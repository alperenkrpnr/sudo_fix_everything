// Bildirim modülü (minimal, uygulama içi). Diğer modüller kendi `yaz` gövdelerinde,
// aynı transaction içinde `bildirimGonder(tx, ...)` çağırır. Kullanıcının kapattığı türler
// (ticket 08, `BildirimTercihi`) burada elenir; çağıranlar tercihleri bilmez.
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { oku, yaz } from '../yetki';
import { terminBildirimleriniIsle } from './termin';
import { BILDIRIM_TURLERI, bilinenTur } from './turler';

export { BILDIRIM_TURLERI } from './turler';

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
  let alicilar = [...new Set(g.kullaniciIds)].filter((id) => id !== g.haric);
  if (!alicilar.length) return 0;
  const kapali = await tx.bildirimTercihi.findMany({
    where: { tur: g.tur, acik: false, kullaniciId: { in: alicilar } },
    select: { kullaniciId: true },
  });
  if (kapali.length) {
    const k = new Set(kapali.map((x) => x.kullaniciId));
    alicilar = alicilar.filter((id) => !k.has(id));
    if (!alicilar.length) return 0;
  }
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

export interface BildirimTercihGorunumu {
  tur: string;
  ad: string;
  acik: boolean;
}

export function bildirimServisi(ctx: ServiceContext) {
  return {
    /** Sistem işlemi (aktör yok, idempotent): termini yaklaşan/geçen açık Task'lar için bildirim. */
    terminBildirimleriniIsle: (now?: Date) => terminBildirimleriniIsle(ctx, now),

    /** Benim bildirim tercihlerim: her bilinen tür için açık/kapalı (varsayılan açık). */
    tercihler(actor: Actor): Promise<BildirimTercihGorunumu[]> {
      return oku(ctx, actor, 'bildirim.tercihler', async (kimlik, tx) => {
        const rows = await tx.bildirimTercihi.findMany({ where: { kullaniciId: kimlik.kullaniciId } });
        const acik = new Map(rows.map((r) => [r.tur, r.acik]));
        return BILDIRIM_TURLERI.map(({ tur, ad }) => ({ tur, ad, acik: acik.get(tur) ?? true }));
      });
    },

    /** Bir bildirim türünü kendim için açar/kapatır (uygulama içi). */
    tercihGuncelle(actor: Actor, tur: string, acik: boolean): Promise<BildirimTercihGorunumu> {
      return yaz(ctx, actor, 'bildirim.tercihGuncelle', async (kimlik, tx) => {
        if (!bilinenTur(tur)) throw new DogrulamaHatasi('Bilinmeyen bildirim türü');
        if (typeof acik !== 'boolean') throw new DogrulamaHatasi('acik true/false olmalı');
        const kullaniciId = kimlik.kullaniciId;
        await tx.bildirimTercihi.upsert({
          where: { kullaniciId_tur: { kullaniciId, tur } },
          create: { kullaniciId, tur, acik, guncelleme: kimlik.zaman },
          update: { acik, guncelleme: kimlik.zaman },
        });
        const ad = BILDIRIM_TURLERI.find((x) => x.tur === tur)!.ad;
        return { sonuc: { tur, ad, acik }, denetim: { varlikTuru: 'BildirimTercihi', varlikId: `${kullaniciId}:${tur}`, veri: { tur, acik } } };
      });
    },

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
