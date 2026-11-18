// Delegasyon kuralları (ticket 06, ADR-0001): kimin hangi Ekip'in gelen kutusunu gördüğü, kimin delege
// edebileceği ve kime delege edilebileceği. Kalıcılık `modules/kabul/delegasyon.ts` içindedir.
import type { Tx } from '../../db/client';
import { aktif, uyeOlduguEkipler } from './cozumleme';
import { aktifVekalet } from './vekalet';
import { ekipYonetebilir } from './yonetim';

/** Kullanıcının t anında Vekili olduğu asiller (ticket 09). Vekalet zincirlenmez. */
async function vekiliOldugu(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  return (await tx.vekalet.findMany({ where: { vekilId: kullaniciId, ...aktifVekalet(t) }, select: { asilId: true } })).map((v) => v.asilId);
}

/**
 * Kullanıcının t anında Sorumlu yöneticisi olduğu Ekipler: Team Head'i olduğu, ve Unit Head'i olduğu Unit'lerde
 * Team Head'siz olanlar; yürürlükteki Vekalette asil'in Ekipleri de (ticket 09).
 */
export async function sorumluOlduguEkipler(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  return [...new Set([...(await kendiSorumluEkipleri(tx, kullaniciId, t)), ...(await vekaletenSorumluEkipler(tx, kullaniciId, t))])];
}

/** Yürürlükteki Vekalet(ler)de asil'in Sorumlu yöneticisi olduğu Ekipler (Vekil görünürlüğü de bunu kullanır). */
export async function vekaletenSorumluEkipler(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  const asiller = await vekiliOldugu(tx, kullaniciId, t);
  return [...new Set((await Promise.all(asiller.map((a) => kendiSorumluEkipleri(tx, a, t)))).flat())];
}

async function kendiSorumluEkipleri(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  const ys = await tx.yoneticilik.findMany({ where: { kullaniciId, tur: { in: ['TEAM_HEAD', 'UNIT_HEAD'] }, ...aktif(t) } });
  const thEkipler = ys.filter((y) => y.tur === 'TEAM_HEAD' && y.ekipId).map((y) => y.ekipId!);
  const unitIds = ys.filter((y) => y.tur === 'UNIT_HEAD' && y.unitId).map((y) => y.unitId!);
  let thsiz: string[] = [];
  if (unitIds.length) {
    const ekipler = await tx.ekip.findMany({ where: { unitId: { in: unitIds }, arsivlendi: null }, select: { id: true } });
    const thli = new Set(
      (await tx.yoneticilik.findMany({ where: { tur: 'TEAM_HEAD', ekipId: { in: ekipler.map((e) => e.id) }, ...aktif(t) } })).map((y) => y.ekipId),
    );
    thsiz = ekipler.map((e) => e.id).filter((id) => !thli.has(id));
  }
  return [...new Set([...thEkipler, ...thsiz])];
}

/** Ekip havuzundaki Task'ı delege edebilir mi: Sorumlu yönetici veya Üst yöneticileri (Unit Head, Direktör), ya da onların yürürlükteki Vekili. */
export async function delegeEdebilir(tx: Tx, kullaniciId: string, ekipId: string, t: Date): Promise<boolean> {
  if (await ekipYonetebilir(tx, kullaniciId, ekipId, t)) return true;
  for (const asil of await vekiliOldugu(tx, kullaniciId, t)) if (await ekipYonetebilir(tx, asil, ekipId, t)) return true;
  return false;
}

/** Delegasyon hedefi t anında Ekip'in üyesi (Çalışan) olmalı. */
export async function delegeAdayiMi(tx: Tx, calisanId: string, ekipId: string, t: Date): Promise<boolean> {
  return (await uyeOlduguEkipler(tx, calisanId, t)).includes(ekipId);
}
