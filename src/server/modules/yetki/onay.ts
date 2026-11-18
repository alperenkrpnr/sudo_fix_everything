// Kabul adımında t anında kimin hangi sıfatla karar verebileceği (ADR-0001): adımın onaylayıcıları,
// onların Vekilleri (veya Vekil ilgiliyse Üst yönetici) ve eskalasyonla yetki kazananlar.
import type { Tx } from '../../db/client';
import { aktif } from './cozumleme';
import { adimOnaylayicilari, kullaniciEkibi, sorumluEkip, type OnayAdimTuru } from './kabul';
import { kararYetkilileri, type KararSifati } from './vekalet';

export const KABUL_ADIMI = 'KabulAdimi';

type AdimTask = { requesterId: string; assigneeKullaniciId: string | null; assigneeEkipId: string | null };

/** Talebin ilgilileri: bunlar Vekil/eskalasyon sıfatıyla karar veremez. */
export function talepIlgilileri(task: AdimTask): string[] {
  return [task.requesterId, ...(task.assigneeKullaniciId ? [task.assigneeKullaniciId] : [])];
}

export async function adimKararVerenleri(
  tx: Tx,
  adim: { id: string; tur: OnayAdimTuru | 'DIREKT' },
  task: AdimTask,
  t: Date,
): Promise<Map<string, KararSifati>> {
  const asil = await adimOnaylayicilari(tx, adim.tur, task, t);
  const esk = await tx.eskalasyon.findUnique({ where: { varlikTuru_varlikId: { varlikTuru: KABUL_ADIMI, varlikId: adim.id } } });
  return kararYetkilileri(tx, asil, talepIlgilileri(task), t, esk && esk.zaman <= t ? esk.hedefIds : []);
}

/**
 * Eskalasyon hedefleri: adımın Ekibinin (Sorumlu Ekip; kişi Assignee'de onun Ekibi) Unit Head'i.
 * Unit Head zaten onaylayıcıysa veya Ekip yoksa Direktör. İlgililer yine karar veremez (kararYetkilileri).
 */
export async function eskalasyonHedefleri(
  tx: Tx,
  adim: { tur: OnayAdimTuru | 'DIREKT' },
  task: AdimTask,
  t: Date,
): Promise<string[]> {
  const asil = await adimOnaylayicilari(tx, adim.tur, task, t);
  const ekipId = (await sorumluEkip(tx, task, t)) ?? (task.assigneeKullaniciId ? await kullaniciEkibi(tx, task.assigneeKullaniciId, t) : null);
  if (ekipId) {
    const ekip = await tx.ekip.findUnique({ where: { id: ekipId }, select: { unitId: true } });
    const uh = ekip ? await tx.yoneticilik.findMany({ where: { tur: 'UNIT_HEAD', unitId: ekip.unitId, ...aktif(t) } }) : [];
    const hedef = uh.map((y) => y.kullaniciId).filter((id) => !asil.includes(id));
    if (hedef.length) return hedef;
  }
  const dir = await tx.yoneticilik.findMany({ where: { tur: 'DIREKTOR', ...aktif(t) } });
  return dir.map((y) => y.kullaniciId).filter((id) => !asil.includes(id));
}

/** Adım başlarken bildirim alacaklar: onaylayıcılar ve yürürlükteki Vekilleri (eskalasyon hariç). */
export async function adimBildirimAlicilari(tx: Tx, tur: OnayAdimTuru | 'DIREKT', task: AdimTask, t: Date): Promise<string[]> {
  return [...(await kararYetkilileri(tx, await adimOnaylayicilari(tx, tur, task, t), talepIlgilileri(task), t)).keys()];
}
