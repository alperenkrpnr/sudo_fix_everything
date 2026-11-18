// Etkinlik modülü. Tek varlık, `tip` = IC | DIS_KATILIM | DIS_KONUSMACI (spec).
// Şimdilik yalnızca iç etkinlik: Yönetici planlar, davet eder; onay yok; davetli
// katılıyorum/katılmıyorum yanıtı verir. Dış etkinlik onayı sonraki bir ticket'ta.
import type { EtkinlikTipi, KatilimYaniti } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { bildirimGonder } from '../bildirim';
import { aktif, oku, yaz, yonetimKapsami } from '../yetki';
import { gorebildigiKullanicilar, yoneticiMi } from '../yetki/gorunurluk';

export interface IcEtkinlikGirdisi {
  baslik: string;
  aciklama?: string;
  yer?: string;
  baslangic: Date;
  bitis?: Date;
  /** Tek tek davet edilen kullanıcılar. */
  davetliIds?: string[];
  /** Bu Ekiplerin aktif üyeleri davet edilir (yönetim kapsamında olmalı). */
  ekipIds?: string[];
}

export interface EtkinlikOzeti {
  id: string;
  tip: EtkinlikTipi;
  baslik: string;
  aciklama: string | null;
  yer: string | null;
  baslangic: Date;
  bitis: Date | null;
  olusturanId: string;
}

export interface EtkinlikGorunumu extends EtkinlikOzeti {
  olusturanAd: string;
  davetler: Array<{ kullaniciId: string; ad: string; yanit: KatilimYaniti }>;
}

export interface BekleyenDavet {
  davetId: string;
  etkinlik: EtkinlikOzeti;
}

const OZET = {
  id: true,
  tip: true,
  baslik: true,
  aciklama: true,
  yer: true,
  baslangic: true,
  bitis: true,
  olusturanId: true,
} as const;

/**
 * Kullanıcının yanıt bekleyen Etkinlik davetleri (başlangıcı `t`den sonra olanlar), yakından uzağa.
 * Yetki kapısı içermez: çağıran (ör. "Bekleyen işlerim") kendi `oku` gövdesinde kullanır.
 */
export async function bekleyenDavetleriGetir(tx: Tx, kullaniciId: string, t: Date): Promise<BekleyenDavet[]> {
  const rows = await tx.etkinlikDaveti.findMany({
    where: { kullaniciId, yanit: 'BEKLIYOR', etkinlik: { baslangic: { gte: t } } },
    include: { etkinlik: { select: OZET } },
    orderBy: { etkinlik: { baslangic: 'asc' } },
  });
  return rows.map((d) => ({ davetId: d.id, etkinlik: d.etkinlik }));
}

export function etkinlikServisi(ctx: ServiceContext) {
  return {
    /** Yönetici iç etkinlik planlar ve davet gönderir. Onay gerektirmez. */
    icEtkinlikOlustur(actor: Actor, g: IcEtkinlikGirdisi): Promise<EtkinlikOzeti> {
      return yaz(ctx, actor, 'etkinlik.icOlustur', async (kimlik, tx) => {
        if (!yoneticiMi(kimlik.roller)) throw new YetkiHatasi('İç etkinliği yalnızca yöneticiler planlar');
        if (!g.baslik?.trim()) throw new DogrulamaHatasi('Başlık gerekli');
        const baslangic = new Date(g.baslangic);
        if (isNaN(baslangic.getTime())) throw new DogrulamaHatasi('Geçerli bir başlangıç tarihi gerekli');
        const bitis = g.bitis ? new Date(g.bitis) : null;
        if (bitis && bitis < baslangic) throw new DogrulamaHatasi('Bitiş başlangıçtan önce olamaz');

        const ekipIds = g.ekipIds ?? [];
        if (ekipIds.length) {
          const k = await yonetimKapsami(tx, kimlik.kullaniciId, kimlik.zaman);
          if (!k.tumu && ekipIds.some((id) => !k.ekipIds.includes(id)))
            throw new YetkiHatasi('Yalnızca yönettiğiniz Ekipleri davet edebilirsiniz');
        }
        const ekipUyeleri = ekipIds.length
          ? await tx.uyelik.findMany({
              where: { ekipId: { in: ekipIds }, ...aktif(kimlik.zaman) },
              select: { kullaniciId: true },
            })
          : [];
        const davetliIds = [...new Set([...(g.davetliIds ?? []), ...ekipUyeleri.map((u) => u.kullaniciId)])].filter(
          (id) => id !== kimlik.kullaniciId,
        );
        const mevcut = await tx.kullanici.count({ where: { id: { in: davetliIds }, arsivlendi: null } });
        if (mevcut !== davetliIds.length) throw new DogrulamaHatasi('Bilinmeyen davetli');

        const e = await tx.etkinlik.create({
          data: {
            tip: 'IC',
            baslik: g.baslik.trim(),
            aciklama: g.aciklama ?? null,
            yer: g.yer ?? null,
            baslangic,
            bitis,
            olusturanId: kimlik.kullaniciId,
            olusturma: kimlik.zaman,
            davetler: { create: davetliIds.map((kullaniciId) => ({ kullaniciId })) },
          },
          select: OZET,
        });
        await bildirimGonder(tx, {
          kullaniciIds: davetliIds,
          tur: 'ETKINLIK_DAVETI',
          mesaj: `${kimlik.ad} sizi "${e.baslik}" etkinliğine davet etti`,
          varlikTuru: 'Etkinlik',
          varlikId: e.id,
          zaman: kimlik.zaman,
        });
        return {
          sonuc: e,
          denetim: { varlikTuru: 'Etkinlik', varlikId: e.id, veri: { tip: 'IC', davetliSayisi: davetliIds.length } },
        };
      });
    },

    /** Davetli katılım yanıtı verir (tekrar yanıtlanabilir). */
    yanitla(actor: Actor, etkinlikId: string, yanit: 'KATILIYORUM' | 'KATILMIYORUM'): Promise<void> {
      return yaz(ctx, actor, 'etkinlik.yanitla', async (kimlik, tx) => {
        if (yanit !== 'KATILIYORUM' && yanit !== 'KATILMIYORUM') throw new DogrulamaHatasi('Geçersiz yanıt');
        const davet = await tx.etkinlikDaveti.findUnique({
          where: { etkinlikId_kullaniciId: { etkinlikId, kullaniciId: kimlik.kullaniciId } },
        });
        if (!davet) throw new BulunamadiHatasi('Davet bulunamadı');
        await tx.etkinlikDaveti.update({ where: { id: davet.id }, data: { yanit, yanitZamani: kimlik.zaman } });
        return { sonuc: undefined, denetim: { varlikTuru: 'Etkinlik', varlikId: etkinlikId, veri: { yanit } } };
      });
    },

    /** Benim yanıt bekleyen davetlerim. */
    bekleyenDavetler(actor: Actor): Promise<BekleyenDavet[]> {
      return oku(ctx, actor, 'etkinlik.bekleyenDavetler', (kimlik, tx) =>
        bekleyenDavetleriGetir(tx, kimlik.kullaniciId, kimlik.zaman),
      );
    },

    /**
     * Görebildiğim Etkinlikler (geçmiş dahil, yeniden eskiye): düzenlediğim/davetli olduğum ve
     * yönettiğim Ekiplerin kişilerinin düzenlediği/davetli olduğu Etkinlikler. Direktör hepsini görür.
     */
    listele(actor: Actor): Promise<EtkinlikGorunumu[]> {
      return oku(ctx, actor, 'etkinlik.listele', async (kimlik, tx) => {
        const g = await gorebildigiKullanicilar(tx, kimlik.kullaniciId, kimlik.zaman);
        const rows = await tx.etkinlik.findMany({
          where: g.tumu
            ? {}
            : { OR: [{ olusturanId: { in: g.ids } }, { davetler: { some: { kullaniciId: { in: g.ids } } } }] },
          select: { ...OZET, davetler: { select: { kullaniciId: true, yanit: true } } },
          orderBy: { baslangic: 'desc' },
          take: 200,
        });
        const kisiIds = [...new Set(rows.flatMap((e) => [e.olusturanId, ...e.davetler.map((d) => d.kullaniciId)]))];
        const kisiler = await tx.kullanici.findMany({ where: { id: { in: kisiIds } }, select: { id: true, ad: true } });
        const ad = new Map(kisiler.map((k) => [k.id, k.ad]));
        return rows.map((e) => ({
          ...e,
          olusturanAd: ad.get(e.olusturanId) ?? e.olusturanId,
          davetler: e.davetler.map((d) => ({ ...d, ad: ad.get(d.kullaniciId) ?? d.kullaniciId })),
        }));
      });
    },
  };
}
