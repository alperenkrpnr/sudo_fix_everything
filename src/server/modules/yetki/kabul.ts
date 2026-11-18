// Kabul zinciri kuralları (spec "Kabul zinciri kuralları", ADR-0001): bir atamanın direkt kabul mü
// olduğu, değilse hangi sıralı adımları gerektirdiği ve kime yalnızca bilgi gideceği yalnızca burada yaşar.
// Kalıcılık ve accept/refuse işlemleri `modules/kabul` içindedir.
import type { Tx } from '../../db/client';
import { aktif, roller, sorumluYonetici, ustYoneticiler, uyeOlduguEkipler, yonetimKapsami } from './cozumleme';
import type { TaskAtamaHedefi } from './task';

export type DirektKabulNedeni = 'SELF_ASSIGN' | 'UST_YONETICI' | 'REQUESTER_VE_ONAYLAYICI';
export type OnayAdimTuru = 'ASSIGNEE' | 'SORUMLU';

export type ZincirPlani =
  | { direkt: true; neden: DirektKabulNedeni; bilgi: string[] }
  | { direkt: false; adimlar: OnayAdimTuru[]; bilgi: string[] };

/**
 * Atamanın kabul zinciri.
 * - Direkt kabul: Self-assign; Requester Assignee'nin Üst yöneticisi (Direktör herkes, Unit Head kendi Unit'i);
 *   Ekip'e atamada Requester o Ekibi yönetiyor. Requester hedefin Sorumlu yöneticisi ise neden
 *   REQUESTER_VE_ONAYLAYICI (çifte rol, örn. Team Head'siz Ekip'te Unit Head).
 * - Ekip'e atama: Sorumlu yönetici kabul eder.
 * - Yöneticiye atama (Çalışan → kendi yöneticisi, Yönetici → Yönetici): yalnızca karşı yönetici.
 * - Çalışan → aynı Ekip'ten Çalışan: yalnızca karşı Çalışan.
 * - Diğer her durumda Çalışan'a atama: Çalışan, sonra onun Sorumlu yöneticisi.
 * - Hedef başka Unit'teyse o Unit'in Unit Head'ine (onaylayıcı değilse) yalnızca bilgi gider.
 */
export async function kabulZinciriPlani(tx: Tx, requesterId: string, hedef: TaskAtamaHedefi, t: Date): Promise<ZincirPlani> {
  const bilgiAlicilari = async (hedefEkipler: string[], onaylayicilar: string[]) => {
    const [rUnit, hUnit] = await Promise.all([kullaniciUnitleri(tx, requesterId, t), ekiplerinUnitleri(tx, hedefEkipler)]);
    if (!hUnit.length || hUnit.some((u) => rUnit.includes(u))) return [];
    const uh = await tx.yoneticilik.findMany({ where: { tur: 'UNIT_HEAD', unitId: { in: hUnit }, ...aktif(t) } });
    return uh.map((y) => y.kullaniciId).filter((id) => id !== requesterId && !onaylayicilar.includes(id));
  };

  if ('ekipId' in hedef) {
    const sorumlu = await sorumluYonetici(tx, hedef.ekipId, t);
    if (sorumlu.includes(requesterId)) return { direkt: true, neden: 'REQUESTER_VE_ONAYLAYICI', bilgi: [] };
    const kapsam = await yonetimKapsami(tx, requesterId, t);
    if (kapsam.tumu || kapsam.ekipIds.includes(hedef.ekipId)) return { direkt: true, neden: 'UST_YONETICI', bilgi: [] };
    return { direkt: false, adimlar: ['SORUMLU'], bilgi: await bilgiAlicilari([hedef.ekipId], sorumlu) };
  }

  const a = hedef.kullaniciId;
  if (a === requesterId) return { direkt: true, neden: 'SELF_ASSIGN', bilgi: [] };
  const aEkipler = await uyeOlduguEkipler(tx, a, t);
  const aSorumlu = aEkipler[0] ? await sorumluYonetici(tx, aEkipler[0], t) : [];
  if ((await ustYoneticiler(tx, a, t)).includes(requesterId)) {
    return { direkt: true, neden: aSorumlu.includes(requesterId) ? 'REQUESTER_VE_ONAYLAYICI' : 'UST_YONETICI', bilgi: [] };
  }

  const aRoller = await roller(tx, a, t);
  const aYonetici = aRoller.some((r) => r !== 'CALISAN');
  const aYoneticiEkipleri = aYonetici ? await yonetilenEkipler(tx, a, t) : [];
  if (aYonetici) return { direkt: false, adimlar: ['ASSIGNEE'], bilgi: await bilgiAlicilari(aYoneticiEkipleri, [a]) };

  const rEkipler = await uyeOlduguEkipler(tx, requesterId, t);
  const rRoller = await roller(tx, requesterId, t);
  const ayniEkiptenCalisan = rRoller.every((r) => r === 'CALISAN') && rEkipler.some((e) => aEkipler.includes(e));
  if (ayniEkiptenCalisan || !aEkipler.length) return { direkt: false, adimlar: ['ASSIGNEE'], bilgi: [] };
  return { direkt: false, adimlar: ['ASSIGNEE', 'SORUMLU'], bilgi: await bilgiAlicilari(aEkipler, [a, ...aSorumlu]) };
}

/**
 * Adımın t anındaki onaylayıcıları. SORUMLU adım karar anında çözülür: Assignee Çalışan taşınırsa
 * bekleyen onay yeni Sorumlu yöneticiye geçer.
 */
export async function adimOnaylayicilari(
  tx: Tx,
  tur: OnayAdimTuru | 'DIREKT',
  task: { assigneeKullaniciId: string | null; assigneeEkipId: string | null },
  t: Date,
): Promise<string[]> {
  if (tur === 'DIREKT') return [];
  if (tur === 'ASSIGNEE') return task.assigneeKullaniciId ? [task.assigneeKullaniciId] : [];
  const ekip = await sorumluEkip(tx, task, t);
  return ekip ? sorumluYonetici(tx, ekip, t) : [];
}

/** SORUMLU adımın Ekibi: Ekip ataması ise o Ekip, kişiye atamada Assignee'nin t anındaki (ilk) Ekibi. */
export async function sorumluEkip(
  tx: Tx,
  task: { assigneeKullaniciId: string | null; assigneeEkipId: string | null },
  t: Date,
): Promise<string | null> {
  if (task.assigneeEkipId) return task.assigneeEkipId;
  if (!task.assigneeKullaniciId) return null;
  return (await uyeOlduguEkipler(tx, task.assigneeKullaniciId, t))[0] ?? null;
}

/** Kullanıcının "kendi" Ekibi (raporlar için): üyesi olduğu ilk Ekip, yoksa Team Head olduğu ilk Ekip. */
export async function kullaniciEkibi(tx: Tx, kullaniciId: string, t: Date): Promise<string | null> {
  const uye = await uyeOlduguEkipler(tx, kullaniciId, t);
  if (uye[0]) return uye[0];
  const th = await tx.yoneticilik.findFirst({ where: { kullaniciId, tur: 'TEAM_HEAD', ...aktif(t) } });
  return th?.ekipId ?? null;
}

async function yonetilenEkipler(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  const k = await yonetimKapsami(tx, kullaniciId, t);
  return k.tumu ? [] : k.ekipIds;
}

async function ekiplerinUnitleri(tx: Tx, ekipIds: string[]): Promise<string[]> {
  if (!ekipIds.length) return [];
  const es = await tx.ekip.findMany({ where: { id: { in: ekipIds } }, select: { unitId: true } });
  return [...new Set(es.map((e) => e.unitId))];
}

/** Kullanıcının bağlı olduğu Unit'ler (üyelik, Team Head'lik veya Unit Head'lik yoluyla). */
async function kullaniciUnitleri(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  const [uye, ys] = await Promise.all([
    uyeOlduguEkipler(tx, kullaniciId, t),
    tx.yoneticilik.findMany({ where: { kullaniciId, ...aktif(t) } }),
  ]);
  const thEkip = ys.filter((y) => y.tur === 'TEAM_HEAD' && y.ekipId).map((y) => y.ekipId!);
  const uhUnit = ys.filter((y) => y.tur === 'UNIT_HEAD' && y.unitId).map((y) => y.unitId!);
  return [...new Set([...(await ekiplerinUnitleri(tx, [...uye, ...thEkip])), ...uhUnit])];
}
