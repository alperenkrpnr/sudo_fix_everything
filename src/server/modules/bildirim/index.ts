// Bildirim modülü (minimal, uygulama içi). Diğer modüller kendi `yaz` gövdelerinde,
// aynı transaction içinde `bildirimGonder(tx, ...)` çağırır. Tercihler (ticket 08) yok.
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { oku, yaz } from '../yetki';

export interface BildirimGirdisi {
  /** Alıcılar; tekrarlar ve `haric` çıkarılır. */
  kullaniciIds: string[];
  tur: string;
  mesaj: string;
  zaman: Date;
  varlikTuru?: string;
  varlikId?: string;
  /** Genelde işlemi yapan kişi: kendine bildirim gitmesin. */
  haric?: string;
}

/** Bildirim oluşturur. Çağıranın transaction'ı (`tx`) içinde çalışır. */
export async function bildirimGonder(tx: Tx, g: BildirimGirdisi): Promise<number> {
  const alicilar = [...new Set(g.kullaniciIds)].filter((id) => id !== g.haric);
  if (!alicilar.length) return 0;
  await tx.bildirim.createMany({
    data: alicilar.map((kullaniciId) => ({
      kullaniciId,
      tur: g.tur,
      mesaj: g.mesaj,
      varlikTuru: g.varlikTuru ?? null,
      varlikId: g.varlikId ?? null,
      olusturma: g.zaman,
    })),
  });
  return alicilar.length;
}

export interface BildirimGorunumu {
  id: string;
  tur: string;
  mesaj: string;
  varlikTuru: string | null;
  varlikId: string | null;
  olusturma: Date;
  okundu: Date | null;
}

export function bildirimServisi(ctx: ServiceContext) {
  return {
    /** Kendi bildirimlerim (yeniden eskiye, son 100). */
    listele(actor: Actor): Promise<BildirimGorunumu[]> {
      return oku(ctx, actor, 'bildirim.listele', async (kimlik, tx) => {
        const rows = await tx.bildirim.findMany({
          where: { kullaniciId: kimlik.kullaniciId },
          orderBy: [{ olusturma: 'desc' }, { id: 'desc' }],
          take: 100,
        });
        return rows.map(({ kullaniciId: _k, ...r }) => r);
      });
    },

    okunduIsaretle(actor: Actor, bildirimId: string): Promise<void> {
      return yaz(ctx, actor, 'bildirim.okundu', async (kimlik, tx) => {
        const b = await tx.bildirim.findUnique({ where: { id: bildirimId } });
        if (!b || b.kullaniciId !== kimlik.kullaniciId) throw new BulunamadiHatasi('Bildirim bulunamadı');
        if (!b.okundu) await tx.bildirim.update({ where: { id: b.id }, data: { okundu: kimlik.zaman } });
        return { sonuc: undefined, denetim: { varlikTuru: 'Bildirim', varlikId: b.id } };
      });
    },
  };
}
