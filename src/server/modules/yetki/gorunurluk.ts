// Kişi bazlı görünürlük (Etkinlik / Yetkinlik geçmişi): kullanıcı kendini ve yönetim
// kapsamındaki Ekiplerin üyelerini + Team Head'lerini görür. Direktör herkesi görür.
import type { Tx } from '../../db/client';
import { aktif, yonetimKapsami, type Rol } from './cozumleme';

export function yoneticiMi(roller: Rol[]): boolean {
  return roller.some((r) => r !== 'CALISAN');
}

export interface KisiGorunurlugu {
  tumu: boolean;
  /** tumu=false iken görülebilen kullanıcı id'leri (kendisi dahil). */
  ids: string[];
}

export async function gorebildigiKullanicilar(tx: Tx, kullaniciId: string, t: Date): Promise<KisiGorunurlugu> {
  const k = await yonetimKapsami(tx, kullaniciId, t);
  if (k.tumu) return { tumu: true, ids: [] };
  if (!k.ekipIds.length) return { tumu: false, ids: [kullaniciId] };
  const [uyeler, thler] = await Promise.all([
    tx.uyelik.findMany({ where: { ekipId: { in: k.ekipIds }, ...aktif(t) }, select: { kullaniciId: true } }),
    tx.yoneticilik.findMany({
      where: { tur: 'TEAM_HEAD', ekipId: { in: k.ekipIds }, ...aktif(t) },
      select: { kullaniciId: true },
    }),
  ]);
  return { tumu: false, ids: [...new Set([kullaniciId, ...uyeler.map((u) => u.kullaniciId), ...thler.map((y) => y.kullaniciId)])] };
}
