// Yetkinlik modülü: Çalışan'ın sertifika / eğitim kayıtları. Kişi kendi kaydını ekler;
// yöneticiler yönettikleri Ekiplerin kayıtlarını görür (yetki/gorunurluk). Bitişi yaklaşan
// sertifikalar için `yaklasanBitisleriBildir` sahibine bir kez hatırlatma gönderir (zamanlayıcı yok;
// dev seed çağırır, ileride bir iş zamanlayıcısı çağırabilir).
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { DogrulamaHatasi } from '../../core/errors';
import { bildirimGonder } from '../bildirim';
import { denetimeEkle } from '../denetim/kaydet';
import { oku, yaz } from '../yetki';
import { gorebildigiKullanicilar } from '../yetki/gorunurluk';

/** Bitişten kaç gün önce hatırlatılır. */
export const HATIRLATMA_GUN = 30;

export interface YetkinlikGirdisi {
  ad: string;
  kurum: string;
  tarih: Date;
  bitisTarihi?: Date | null;
}

export interface YetkinlikGorunumu {
  id: string;
  kullaniciId: string;
  kullaniciAd: string;
  ad: string;
  kurum: string;
  tarih: Date;
  bitisTarihi: Date | null;
}

export function yetkinlikServisi(ctx: ServiceContext) {
  return {
    /** Kendi Yetkinlik kaydımı eklerim. */
    ekle(actor: Actor, g: YetkinlikGirdisi): Promise<YetkinlikGorunumu> {
      return yaz(ctx, actor, 'yetkinlik.ekle', async (kimlik, tx) => {
        if (!g.ad?.trim() || !g.kurum?.trim()) throw new DogrulamaHatasi('Ad ve kurum gerekli');
        const tarih = new Date(g.tarih);
        if (isNaN(tarih.getTime())) throw new DogrulamaHatasi('Geçerli bir tarih gerekli');
        const bitisTarihi = g.bitisTarihi ? new Date(g.bitisTarihi) : null;
        if (bitisTarihi && (isNaN(bitisTarihi.getTime()) || bitisTarihi < tarih))
          throw new DogrulamaHatasi('Bitiş tarihi, tarihten önce olamaz');
        const y = await tx.yetkinlik.create({
          data: {
            kullaniciId: kimlik.kullaniciId,
            ad: g.ad.trim(),
            kurum: g.kurum.trim(),
            tarih,
            bitisTarihi,
            olusturma: kimlik.zaman,
          },
        });
        return {
          sonuc: { id: y.id, kullaniciId: y.kullaniciId, kullaniciAd: kimlik.ad, ad: y.ad, kurum: y.kurum, tarih, bitisTarihi },
          denetim: { varlikTuru: 'Yetkinlik', varlikId: y.id, veri: { ad: y.ad, kurum: y.kurum } },
        };
      });
    },

    /** Görebildiğim Yetkinlikler: kendim + yönettiğim Ekiplerin kişileri (Direktör: herkes). */
    listele(actor: Actor): Promise<YetkinlikGorunumu[]> {
      return oku(ctx, actor, 'yetkinlik.listele', async (kimlik, tx) => {
        const g = await gorebildigiKullanicilar(tx, kimlik.kullaniciId, kimlik.zaman);
        const rows = await tx.yetkinlik.findMany({
          where: g.tumu ? {} : { kullaniciId: { in: g.ids } },
          orderBy: [{ kullaniciId: 'asc' }, { tarih: 'desc' }],
        });
        const kisiler = await tx.kullanici.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.kullaniciId))] } },
          select: { id: true, ad: true },
        });
        const ad = new Map(kisiler.map((k) => [k.id, k.ad]));
        return rows.map((r) => ({
          id: r.id,
          kullaniciId: r.kullaniciId,
          kullaniciAd: ad.get(r.kullaniciId) ?? r.kullaniciId,
          ad: r.ad,
          kurum: r.kurum,
          tarih: r.tarih,
          bitisTarihi: r.bitisTarihi,
        }));
      });
    },

    /**
     * Sistem işi (aktör yok): bitişi önümüzdeki HATIRLATMA_GUN gün içinde olan ve henüz
     * hatırlatılmamış sertifikalar için sahibine bildirim gönderir. Gönderilen sayıyı döner.
     */
    yaklasanBitisleriBildir(now: Date = ctx.now()): Promise<number> {
      const sinir = new Date(now.getTime() + HATIRLATMA_GUN * 24 * 3600 * 1000);
      return ctx.db.$transaction(async (tx) => {
        const yaklasan = await tx.yetkinlik.findMany({
          where: { hatirlatmaGonderildi: null, bitisTarihi: { gt: now, lte: sinir } },
        });
        for (const y of yaklasan) {
          await bildirimGonder(tx, {
            kullaniciIds: [y.kullaniciId],
            tur: 'YETKINLIK_BITIS',
            mesaj: `"${y.ad}" (${y.kurum}) ${y.bitisTarihi!.toISOString().slice(0, 10)} tarihinde bitiyor`,
            varlikTuru: 'Yetkinlik',
            varlikId: y.id,
            zaman: now,
          });
          await tx.yetkinlik.update({ where: { id: y.id }, data: { hatirlatmaGonderildi: now } });
        }
        if (yaklasan.length)
          await denetimeEkle(tx, {
            islem: 'yetkinlik.bitisHatirlatmasi',
            zaman: now,
            kullaniciId: null,
            veri: { yetkinlikIds: yaklasan.map((y) => y.id) },
          });
        return yaklasan.length;
      });
    },
  };
}
