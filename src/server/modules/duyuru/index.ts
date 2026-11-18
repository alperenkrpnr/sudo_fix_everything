// Duyuru modülü: hedef kitlesi Ekip, Unit veya Direktörlük. Yayında hedef kitleye bildirim gider.
// Yayın yetkisi: Ekip → o Ekibi yöneten; Unit → o Unit'in Unit Head'i; Direktörlük → Direktör.
// Hedef kitle yayın anındaki aktif organizasyona göre çözülür.
import type { DuyuruHedefTuru } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { bildirimGonder } from '../bildirim';
import { aktif, oku, uyeOlduguEkipler, yaz, yonetimKapsami } from '../yetki';

export interface DuyuruGirdisi {
  baslik: string;
  metin: string;
  hedefTuru: DuyuruHedefTuru;
  hedefId: string;
}

export interface DuyuruGorunumu {
  id: string;
  baslik: string;
  metin: string;
  hedefTuru: DuyuruHedefTuru;
  hedefId: string;
  hedefAd: string;
  yayinlayanId: string;
  yayinlayanAd: string;
  yayinZamani: Date;
}

/** Hedef kitledeki kullanıcılar (t anındaki üyelik/yöneticiliklere göre). */
async function hedefKitlesi(tx: Tx, hedefTuru: DuyuruHedefTuru, hedefId: string, t: Date): Promise<string[]> {
  if (hedefTuru === 'DIREKTORLUK') {
    const ks = await tx.kullanici.findMany({ where: { arsivlendi: null }, select: { id: true } });
    return ks.map((k) => k.id);
  }
  const ekipIds =
    hedefTuru === 'EKIP'
      ? [hedefId]
      : (await tx.ekip.findMany({ where: { unitId: hedefId }, select: { id: true } })).map((e) => e.id);
  const [uyeler, yoneticiler] = await Promise.all([
    tx.uyelik.findMany({ where: { ekipId: { in: ekipIds }, ...aktif(t) }, select: { kullaniciId: true } }),
    tx.yoneticilik.findMany({
      where: {
        ...aktif(t),
        OR: [
          { tur: 'TEAM_HEAD', ekipId: { in: ekipIds } },
          ...(hedefTuru === 'UNIT' ? [{ tur: 'UNIT_HEAD' as const, unitId: hedefId }] : []),
        ],
      },
      select: { kullaniciId: true },
    }),
  ]);
  return [...uyeler, ...yoneticiler].map((x) => x.kullaniciId);
}

async function hedefAdi(tx: Tx, hedefTuru: DuyuruHedefTuru, hedefId: string): Promise<string | null> {
  if (hedefTuru === 'EKIP') return (await tx.ekip.findUnique({ where: { id: hedefId } }))?.ad ?? null;
  if (hedefTuru === 'UNIT') return (await tx.unit.findUnique({ where: { id: hedefId } }))?.ad ?? null;
  return (await tx.direktorluk.findUnique({ where: { id: hedefId } }))?.ad ?? null;
}

export function duyuruServisi(ctx: ServiceContext) {
  return {
    yayinla(actor: Actor, g: DuyuruGirdisi): Promise<DuyuruGorunumu> {
      return yaz(ctx, actor, 'duyuru.yayinla', async (kimlik, tx) => {
        if (!g.baslik?.trim() || !g.metin?.trim()) throw new DogrulamaHatasi('Başlık ve metin gerekli');
        if (!['EKIP', 'UNIT', 'DIREKTORLUK'].includes(g.hedefTuru)) throw new DogrulamaHatasi('Geçersiz hedef türü');
        const ad = await hedefAdi(tx, g.hedefTuru, g.hedefId);
        if (!ad) throw new DogrulamaHatasi('Hedef bulunamadı');
        const k = await yonetimKapsami(tx, kimlik.kullaniciId, kimlik.zaman);
        const yetkili =
          k.tumu ||
          (g.hedefTuru === 'UNIT' && k.unitIds.includes(g.hedefId)) ||
          (g.hedefTuru === 'EKIP' && k.ekipIds.includes(g.hedefId));
        if (!yetkili) throw new YetkiHatasi('Bu hedef kitleye duyuru yayınlama yetkiniz yok');

        const d = await tx.duyuru.create({
          data: {
            baslik: g.baslik.trim(),
            metin: g.metin.trim(),
            hedefTuru: g.hedefTuru,
            hedefId: g.hedefId,
            yayinlayanId: kimlik.kullaniciId,
            yayinZamani: kimlik.zaman,
          },
        });
        const alicilar = await hedefKitlesi(tx, g.hedefTuru, g.hedefId, kimlik.zaman);
        const sayi = await bildirimGonder(tx, {
          kullaniciIds: alicilar,
          haric: kimlik.kullaniciId,
          tur: 'DUYURU',
          mesaj: `Yeni duyuru (${ad}): ${d.baslik}`,
          varlikTuru: 'Duyuru',
          varlikId: d.id,
          zaman: kimlik.zaman,
        });
        return {
          sonuc: { ...d, hedefAd: ad, yayinlayanAd: kimlik.ad },
          denetim: { varlikTuru: 'Duyuru', varlikId: d.id, veri: { hedefTuru: d.hedefTuru, hedefId: d.hedefId, aliciSayisi: sayi } },
        };
      });
    },

    /** Bana yönelik (üyesi olduğum / yönettiğim Ekip ve Unit'ler, Direktörlük) ve benim yayınladığım duyurular. */
    listele(actor: Actor): Promise<DuyuruGorunumu[]> {
      return oku(ctx, actor, 'duyuru.listele', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const k = await yonetimKapsami(tx, kimlik.kullaniciId, t);
        const ekipIds = [...new Set([...(await uyeOlduguEkipler(tx, kimlik.kullaniciId, t)), ...k.ekipIds])];
        const ekipUnitleri = await tx.ekip.findMany({ where: { id: { in: ekipIds } }, select: { unitId: true } });
        const unitIds = [...new Set([...ekipUnitleri.map((e) => e.unitId), ...k.unitIds])];
        const rows = await tx.duyuru.findMany({
          where: k.tumu
            ? {}
            : {
                OR: [
                  { hedefTuru: 'DIREKTORLUK' },
                  { hedefTuru: 'UNIT', hedefId: { in: unitIds } },
                  { hedefTuru: 'EKIP', hedefId: { in: ekipIds } },
                  { yayinlayanId: kimlik.kullaniciId },
                ],
              },
          orderBy: { yayinZamani: 'desc' },
          take: 100,
        });
        const [kisiler, ekipler, unitler, direktorlukler] = await Promise.all([
          tx.kullanici.findMany({ where: { id: { in: rows.map((r) => r.yayinlayanId) } }, select: { id: true, ad: true } }),
          tx.ekip.findMany({ select: { id: true, ad: true } }),
          tx.unit.findMany({ select: { id: true, ad: true } }),
          tx.direktorluk.findMany({ select: { id: true, ad: true } }),
        ]);
        const ad = new Map([...kisiler, ...ekipler, ...unitler, ...direktorlukler].map((x) => [x.id, x.ad]));
        return rows.map((r) => ({
          ...r,
          hedefAd: ad.get(r.hedefId) ?? r.hedefId,
          yayinlayanAd: ad.get(r.yayinlayanId) ?? r.yayinlayanId,
        }));
      });
    },
  };
}
