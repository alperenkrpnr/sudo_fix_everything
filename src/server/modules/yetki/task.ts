// Task yetki kuralları (ADR-0001): görünürlük. Kabul zinciri kuralları `./kabul.ts` içindedir.
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';
import { aktif, uyeOlduguEkipler, yonetimKapsami } from './cozumleme';
import { vekaletenSorumluEkipler } from './delegasyon';

export type TaskAtamaHedefi = { kullaniciId: string } | { ekipId: string };

/**
 * Görünürlük: kullanıcının görebildiği Task'lar için Prisma `where` filtresi.
 * - Taslak yalnızca Requester'a (ve Direktör'e) görünür.
 * - Çalışan: açtığı, kendisine atanan ve (kabul bekleme dışında) Ekibi'ne atanan Task'lar.
 * - Yönetici: yönettiği Ekiplerin üyeleri/Team Head'leri Requester veya Assignee olan, ya da
 *   yönettiği Ekip'e atanan tüm Task'lar (Üst yönetici kuralı). Direktör: hepsi.
 * - Vekil (yürürlükte): asil'in Sorumlu Ekiplerine ve onların üyelerine atanan Task'lar.
 */
export async function taskGorunurluk(tx: Tx, kullaniciId: string, t: Date): Promise<Prisma.TaskWhereInput> {
  const kapsam = await yonetimKapsami(tx, kullaniciId, t);
  if (kapsam.tumu) return {};
  const ekiplerim = await uyeOlduguEkipler(tx, kullaniciId, t);
  const taslakDegil: Prisma.TaskWhereInput = { durum: { not: 'TASLAK' } };
  const or: Prisma.TaskWhereInput[] = [
    { requesterId: kullaniciId },
    { assigneeKullaniciId: kullaniciId, ...taslakDegil },
    { assigneeEkipId: { in: ekiplerim }, durum: { notIn: ['TASLAK', 'KABUL_BEKLIYOR'] } },
  ];
  if (kapsam.ekipIds.length) {
    const alt = await altKullanicilar(tx, kapsam.ekipIds, t);
    or.push({
      ...taslakDegil,
      OR: [{ requesterId: { in: alt } }, { assigneeKullaniciId: { in: alt } }, { assigneeEkipId: { in: kapsam.ekipIds } }],
    });
  }
  // Ticket 09: yürürlükteki Vekil, asil'in Sorumlu yöneticisi olduğu Ekiplere ve üyelerine atanan Task'ları görür
  // (karar verebileceği kabul adımları ve havuz).
  const vekaleten = await vekaletenSorumluEkipler(tx, kullaniciId, t);
  if (vekaleten.length) {
    or.push({ ...taslakDegil, OR: [{ assigneeEkipId: { in: vekaleten } }, { assigneeKullaniciId: { in: await altKullanicilar(tx, vekaleten, t) } }] });
  }
  return { OR: or };
}

/** Ekiplerin t anındaki üyeleri ve Team Head'leri. */
async function altKullanicilar(tx: Tx, ekipIds: string[], t: Date): Promise<string[]> {
  const [uyeler, thler] = await Promise.all([
    tx.uyelik.findMany({ where: { ekipId: { in: ekipIds }, ...aktif(t) }, select: { kullaniciId: true } }),
    tx.yoneticilik.findMany({ where: { tur: 'TEAM_HEAD', ekipId: { in: ekipIds }, ...aktif(t) }, select: { kullaniciId: true } }),
  ]);
  return [...new Set([...uyeler, ...thler].map((x) => x.kullaniciId))];
}
