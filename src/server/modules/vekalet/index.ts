// Vekalet modülü (ticket 09): Yönetici tarih aralıklı Vekil atar, listeler, erken bitirir.
// Kurallar (aday, Vekil çözümü) `yetki/vekalet.ts` içindedir (ADR-0001).
import type { Vekalet } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi } from '../../core/errors';
import { bildirimGonder } from '../bildirim';
import { oku, yaz, yetkiGerekli } from '../yetki';
import { vekilAdaylari } from '../yetki/vekalet';

export interface VekaletGirdisi {
  vekilId: string;
  baslangic: Date;
  bitis: Date;
}

export interface VekilAdayi {
  id: string;
  ad: string;
  unvan: string | null;
}

function gecerliTarih(x: unknown): x is Date {
  return x instanceof Date && !Number.isNaN(x.getTime());
}

export function vekaletServisi(ctx: ServiceContext) {
  return {
    /** Çağıranın seçebileceği Vekil adayları (Çalışan için boş). */
    adaylar(actor: Actor): Promise<VekilAdayi[]> {
      return oku(ctx, actor, 'vekalet.adaylar', async (kimlik, tx) => {
        const ids = await vekilAdaylari(tx, kimlik.kullaniciId, kimlik.zaman);
        return tx.kullanici.findMany({
          where: { id: { in: ids }, arsivlendi: null },
          select: { id: true, ad: true, unvan: true },
          orderBy: { ad: 'asc' },
        });
      });
    },

    /** Kendi adıma [baslangic, bitis) aralığında Vekil atar. Aynı aralıkta ikinci Vekalet olmaz. */
    ata(actor: Actor, g: VekaletGirdisi): Promise<Vekalet> {
      return yaz(ctx, actor, 'vekalet.ata', async (kimlik, tx) => {
        if (!gecerliTarih(g.baslangic) || !gecerliTarih(g.bitis) || g.bitis <= g.baslangic)
          throw new DogrulamaHatasi('Vekalet için geçerli bir başlangıç ve bitiş tarihi gerekli');
        if (g.bitis <= kimlik.zaman) throw new DogrulamaHatasi('Vekalet bitişi geçmişte olamaz');
        const adaylar = await vekilAdaylari(tx, kimlik.kullaniciId, kimlik.zaman);
        yetkiGerekli(adaylar.includes(g.vekilId), 'Bu kişi Vekil olarak atanamaz');
        const cakisan = await tx.vekalet.count({
          where: { asilId: kimlik.kullaniciId, baslangic: { lt: g.bitis }, bitis: { gt: g.baslangic } },
        });
        if (cakisan) throw new DogrulamaHatasi('Bu tarih aralığında zaten bir Vekalet var');
        const v = await tx.vekalet.create({
          data: { asilId: kimlik.kullaniciId, vekilId: g.vekilId, baslangic: g.baslangic, bitis: g.bitis, olusturma: kimlik.zaman },
        });
        await bildirimGonder(tx, {
          kullaniciIds: [g.vekilId],
          tur: 'VEKALET',
          mesaj: `${kimlik.ad} sizi ${g.baslangic.toISOString().slice(0, 10)} – ${g.bitis.toISOString().slice(0, 10)} arası Vekil atadı`,
          varlikTuru: 'Vekalet',
          varlikId: v.id,
          zaman: kimlik.zaman,
        });
        return {
          sonuc: v,
          denetim: { varlikTuru: 'Vekalet', varlikId: v.id, veri: { asilId: v.asilId, vekilId: v.vekilId, baslangic: v.baslangic.toISOString(), bitis: v.bitis.toISOString() } },
        };
      });
    },

    /** Verdiğim ve üstlendiğim Vekaletler (geçmiş dahil, yeniden eskiye). */
    listele(actor: Actor): Promise<{ verdiklerim: Vekalet[]; vekiliOlduklarim: Vekalet[] }> {
      return oku(ctx, actor, 'vekalet.listele', async (kimlik, tx) => {
        const [verdiklerim, vekiliOlduklarim] = await Promise.all([
          tx.vekalet.findMany({ where: { asilId: kimlik.kullaniciId }, orderBy: { baslangic: 'desc' } }),
          tx.vekalet.findMany({ where: { vekilId: kimlik.kullaniciId }, orderBy: { baslangic: 'desc' } }),
        ]);
        return { verdiklerim, vekiliOlduklarim };
      });
    },

    /** Vekaleti şimdi bitirir (yalnızca asil; bitmiş Vekalet değişmez). */
    sonlandir(actor: Actor, id: string): Promise<Vekalet> {
      return yaz(ctx, actor, 'vekalet.sonlandir', async (kimlik, tx) => {
        const v = await tx.vekalet.findUnique({ where: { id } });
        if (!v || v.asilId !== kimlik.kullaniciId) throw new BulunamadiHatasi('Vekalet bulunamadı');
        if (v.bitis <= kimlik.zaman) throw new DogrulamaHatasi('Vekalet zaten sona ermiş');
        const bitis = v.baslangic > kimlik.zaman ? v.baslangic : kimlik.zaman;
        const guncel = await tx.vekalet.update({ where: { id }, data: { bitis } });
        return { sonuc: guncel, denetim: { varlikTuru: 'Vekalet', varlikId: id, veri: { eskiBitis: v.bitis.toISOString(), bitis: bitis.toISOString() } } };
      });
    },
  };
}

export type VekaletServisi = ReturnType<typeof vekaletServisi>;
