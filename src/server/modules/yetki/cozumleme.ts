// Yetki çözümleme: roller, yönetim kapsamı, Sorumlu yönetici, Üst yönetici.
// ADR-0001: bu kurallar YALNIZCA burada yaşar. Hepsi tarih (`t`) alır; organizasyon
// tarih aralıklı olduğundan (ADR-0002) geçmiş bir anın yapısı da çözülebilir.
import type { Tx } from '../../db/client';

export type Rol = 'DIREKTOR' | 'UNIT_HEAD' | 'TEAM_HEAD' | 'CALISAN';

/** Prisma `where` parçası: t anında aktif tarih aralıklı kayıt. */
export function aktif(t: Date) {
  return { gecerliBaslangic: { lte: t }, OR: [{ gecerliBitis: null }, { gecerliBitis: { gt: t } }] };
}

export async function roller(tx: Tx, kullaniciId: string, t: Date): Promise<Rol[]> {
  const ys = await tx.yoneticilik.findMany({ where: { kullaniciId, ...aktif(t) }, select: { tur: true } });
  const set = new Set<Rol>(ys.map((y) => y.tur));
  const uye = await tx.uyelik.count({ where: { kullaniciId, ...aktif(t) } });
  if (uye > 0 || set.size === 0) set.add('CALISAN');
  return (['DIREKTOR', 'UNIT_HEAD', 'TEAM_HEAD', 'CALISAN'] as const).filter((r) => set.has(r));
}

/** Kullanıcının üyesi olduğu Ekipler. */
export async function uyeOlduguEkipler(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  const us = await tx.uyelik.findMany({ where: { kullaniciId, ...aktif(t) }, select: { ekipId: true } });
  return [...new Set(us.map((u) => u.ekipId))];
}

export interface YonetimKapsami {
  /** Direktör: her şey. */
  tumu: boolean;
  /** Unit Head olduğu Unit'ler. */
  unitIds: string[];
  /** Yönettiği Ekipler: Team Head olduğu + Unit Head olduğu Unit'lerin tüm Ekipleri. */
  ekipIds: string[];
}

/** Kullanıcının aşağı doğru yönetim kapsamı (Üst yönetici kuralı). */
export async function yonetimKapsami(tx: Tx, kullaniciId: string, t: Date): Promise<YonetimKapsami> {
  const ys = await tx.yoneticilik.findMany({ where: { kullaniciId, ...aktif(t) } });
  const tumu = ys.some((y) => y.tur === 'DIREKTOR');
  if (tumu) {
    const [units, ekipler] = await Promise.all([
      tx.unit.findMany({ select: { id: true } }),
      tx.ekip.findMany({ select: { id: true } }),
    ]);
    return { tumu, unitIds: units.map((u) => u.id), ekipIds: ekipler.map((e) => e.id) };
  }
  const unitIds = ys.filter((y) => y.tur === 'UNIT_HEAD' && y.unitId).map((y) => y.unitId!);
  const unitEkipleri = unitIds.length
    ? await tx.ekip.findMany({ where: { unitId: { in: unitIds } }, select: { id: true } })
    : [];
  const ekipIds = new Set([
    ...ys.filter((y) => y.tur === 'TEAM_HEAD' && y.ekipId).map((y) => y.ekipId!),
    ...unitEkipleri.map((e) => e.id),
  ]);
  return { tumu, unitIds, ekipIds: [...ekipIds] };
}

/** Ekip'in Sorumlu yöneticisi: Team Head varsa o, yoksa Unit Head. */
export async function sorumluYonetici(tx: Tx, ekipId: string, t: Date): Promise<string[]> {
  const th = await tx.yoneticilik.findMany({ where: { tur: 'TEAM_HEAD', ekipId, ...aktif(t) } });
  if (th.length) return th.map((y) => y.kullaniciId);
  const ekip = await tx.ekip.findUniqueOrThrow({ where: { id: ekipId }, select: { unitId: true } });
  const uh = await tx.yoneticilik.findMany({ where: { tur: 'UNIT_HEAD', unitId: ekip.unitId, ...aktif(t) } });
  return uh.map((y) => y.kullaniciId);
}

/** Kullanıcının yönetim zincirindeki üstleri (yakından uzağa; Team Head → Unit Head → Direktör). */
export async function ustYoneticiler(tx: Tx, kullaniciId: string, t: Date): Promise<string[]> {
  const ys = await tx.yoneticilik.findMany({ where: { kullaniciId, ...aktif(t) } });
  if (ys.some((y) => y.tur === 'DIREKTOR')) return [];
  const uyeEkipler = await uyeOlduguEkipler(tx, kullaniciId, t);
  const thEkipler = ys.filter((y) => y.tur === 'TEAM_HEAD').map((y) => y.ekipId!);
  const zincir: string[] = [];
  // Team Head(ler): üyesi olduğu Ekiplerin Team Head'leri
  if (uyeEkipler.length) {
    const th = await tx.yoneticilik.findMany({ where: { tur: 'TEAM_HEAD', ekipId: { in: uyeEkipler }, ...aktif(t) } });
    zincir.push(...th.map((y) => y.kullaniciId));
  }
  // Unit Head(ler): ilgili Ekiplerin Unit'leri (Unit Head kendisi değilse)
  const ilgiliEkipler = [...uyeEkipler, ...thEkipler];
  const ownUnits = ys.filter((y) => y.tur === 'UNIT_HEAD').map((y) => y.unitId!);
  if (ilgiliEkipler.length) {
    const ekipler = await tx.ekip.findMany({ where: { id: { in: ilgiliEkipler } }, select: { unitId: true } });
    const unitIds = [...new Set(ekipler.map((e) => e.unitId))].filter((u) => !ownUnits.includes(u));
    const uh = await tx.yoneticilik.findMany({ where: { tur: 'UNIT_HEAD', unitId: { in: unitIds }, ...aktif(t) } });
    zincir.push(...uh.map((y) => y.kullaniciId));
  }
  const dir = await tx.yoneticilik.findMany({ where: { tur: 'DIREKTOR', ...aktif(t) } });
  zincir.push(...dir.map((y) => y.kullaniciId));
  return [...new Set(zincir)].filter((id) => id !== kullaniciId);
}
