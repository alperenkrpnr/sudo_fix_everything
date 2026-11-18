// "Bekleyen işlerim": kullanıcının üzerinde bekleyen her şey tek listede (Çalışan ve Yönetici aynı
// bileşen; içerik yetki katmanından gelir). Kaynaklar:
//  - kabul bekleyen Task'lar  → `bekleyenKabuller` (SWAP POINT: ticket 05 kabul zinciri)
//  - yanıt bekleyen Etkinlik davetleri → etkinlik#bekleyenDavetleriGetir
// Sıra: termin (yakın önce, tarihsiz en sonda), sonra bekleme yaşı (eski önce).
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import type { Tx } from '../../db/client';
import { bekleyenDavetleriGetir } from '../etkinlik';
import { oku, sorumluYonetici, yonetimKapsami } from '../yetki';

export type BekleyenTuru = 'TASK_KABUL' | 'ETKINLIK_DAVETI';

export interface BekleyenIs {
  tur: BekleyenTuru;
  /** Task id veya Etkinlik id. */
  id: string;
  baslik: string;
  /** Task bitiş tarihi veya Etkinlik başlangıcı; null = tarihsiz. */
  termin: Date | null;
  /** Bekleme başlangıcı (yaş). */
  beklemeBaslangici: Date;
  /** Neden bende: 'Bana atandı', 'Ekip onayı: TEAM-WAF', ... */
  neden: string;
}

/**
 * SWAP POINT (ticket 05): kullanıcının karar vermesi gereken kabul adımları.
 * Şimdilik: kendisine atanmış KABUL_BEKLIYOR Task'lar + Sorumlu yöneticisi olduğu Ekiplere atanmış
 * KABUL_BEKLIYOR Task'lar. 05 birleştiğinde bunu "kullanıcının bekleyen zincir adımları" sorgusuyla değiştirin.
 */
export async function bekleyenKabuller(tx: Tx, kullaniciId: string, t: Date): Promise<BekleyenIs[]> {
  const kapsam = await yonetimKapsami(tx, kullaniciId, t);
  const sorumluEkipler: string[] = [];
  for (const ekipId of kapsam.ekipIds) if ((await sorumluYonetici(tx, ekipId, t)).includes(kullaniciId)) sorumluEkipler.push(ekipId);
  const ekipKodlari = new Map(
    (await tx.ekip.findMany({ where: { id: { in: sorumluEkipler } }, select: { id: true, kod: true } })).map((e) => [e.id, e.kod]),
  );
  const tasks = await tx.task.findMany({
    where: {
      durum: 'KABUL_BEKLIYOR',
      OR: [{ assigneeKullaniciId: kullaniciId }, { assigneeEkipId: { in: sorumluEkipler } }],
    },
  });
  return tasks.map((task) => ({
    tur: 'TASK_KABUL',
    id: task.id,
    baslik: task.baslik,
    termin: task.bitisTarihi,
    beklemeBaslangici: task.guncelleme,
    neden: task.assigneeEkipId ? `Ekip onayı: ${ekipKodlari.get(task.assigneeEkipId) ?? task.assigneeEkipId}` : 'Bana atandı',
  }));
}

function sirala(a: BekleyenIs, b: BekleyenIs): number {
  const ta = a.termin?.getTime() ?? Infinity;
  const tb = b.termin?.getTime() ?? Infinity;
  if (ta !== tb) return ta - tb;
  return a.beklemeBaslangici.getTime() - b.beklemeBaslangici.getTime();
}

export function bekleyenServisi(ctx: ServiceContext) {
  return {
    /** Çağıranın bekleyen işleri (kabuller + davetler), termine sonra yaşa göre sıralı. */
    listele(actor: Actor): Promise<BekleyenIs[]> {
      return oku(ctx, actor, 'bekleyen.listele', async (kimlik, tx) => {
        const [kabuller, davetler] = await Promise.all([
          bekleyenKabuller(tx, kimlik.kullaniciId, kimlik.zaman),
          bekleyenDavetleriGetir(tx, kimlik.kullaniciId, kimlik.zaman),
        ]);
        const davetIsleri: BekleyenIs[] = davetler.map((d) => ({
          tur: 'ETKINLIK_DAVETI',
          id: d.etkinlik.id,
          baslik: d.etkinlik.baslik,
          termin: d.etkinlik.baslangic,
          beklemeBaslangici: d.etkinlik.baslangic,
          neden: 'Etkinlik daveti',
        }));
        return [...kabuller, ...davetIsleri].sort(sirala);
      });
    },
  };
}

export type BekleyenServisi = ReturnType<typeof bekleyenServisi>;
