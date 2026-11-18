// Delegasyon kuralları (ticket 06, ADR-0001): kimin hangi Ekip'in gelen kutusunu gördüğü, kimin delege
// edebileceği ve kime delege edilebileceği. Kalıcılık `modules/kabul/delegasyon.ts` içindedir.
import type { Tx } from '../../db/client';
import { aktif, uyeOlduguEkipler } from './cozumleme';
import { ekipYonetebilir } from './yonetim';

/** Kullanıcının t anında Sorumlu yöneticisi olduğu Ekipler: Team Head'i olduğu, ve Unit Head'i olduğu Unit'lerde Team Head'siz olanlar. */
export async function sorumluOlduguEkipler(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
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

/** Ekip havuzundaki Task'ı delege edebilir mi: Sorumlu yönetici veya Üst yöneticileri (Unit Head, Direktör). */
export function delegeEdebilir(tx: Tx, kullaniciId: string, ekipId: string, t: Date): Promise<boolean> {
  return ekipYonetebilir(tx, kullaniciId, ekipId, t);
}

/** Delegasyon hedefi t anında Ekip'in üyesi (Çalışan) olmalı. */
export async function delegeAdayiMi(tx: Tx, calisanId: string, ekipId: string, t: Date): Promise<boolean> {
  return (await uyeOlduguEkipler(tx, calisanId, t)).includes(ekipId);
}
