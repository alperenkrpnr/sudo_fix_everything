// "Bekleyen işlerim": kullanıcının üzerinde bekleyen her şey tek listede (Çalışan ve Yönetici aynı
// bileşen; içerik yetki katmanından gelir). Kaynaklar:
//  - kabul bekleyen Task'lar  → `bekleyenKabuller` (ticket 05 kabul zinciri adımları; ticket 09: `grup`
//    kendi / Vekil / eskale edilen)
//  - yanıt bekleyen Etkinlik davetleri → etkinlik#bekleyenDavetleriGetir
// Sıra: termin (yakın önce, tarihsiz en sonda), sonra bekleme yaşı (eski önce).
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import type { Tx } from '../../db/client';
import { bekleyenDavetleriGetir } from '../etkinlik';
import { bekleyenDelegasyonlariGetir, bekleyenKabulAdimlari, ekipGelenKutusuHesapla, type BekleyenKabul } from '../kabul';
import { oku } from '../yetki';

export type BekleyenTuru = 'TASK_KABUL' | 'ETKINLIK_DAVETI' | 'DELEGASYON' | 'EKIP_HAVUZU';
/** Pano grubu (ticket 09): kendi işlerim, Vekil olarak (veya Vekil ilgili olduğu için Üst yönetici olarak) üstlendiklerim, eskale edilenler. */
export type BekleyenGrubu = 'KENDI' | 'VEKIL' | 'ESKALASYON';

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
  grup: BekleyenGrubu;
  /** VEKIL grubunda: kimin adına. */
  adinaKullaniciId: string | null;
}

/**
 * Kullanıcının karar vermesi gereken kabul adımları (ticket 05 `bekleyenKabulAdimlari`).
 * beklemeBaslangici = adımın karar beklemeye başladığı an.
 */
export async function bekleyenKabuller(tx: Tx, kullaniciId: string, t: Date): Promise<BekleyenIs[]> {
  const adimlar = await bekleyenKabulAdimlari(tx, kullaniciId, t);
  const ekipIds = adimlar.flatMap((a) => (a.task.assigneeEkipId ? [a.task.assigneeEkipId] : []));
  const ekipKodlari = new Map(
    (await tx.ekip.findMany({ where: { id: { in: ekipIds } }, select: { id: true, kod: true } })).map((e) => [e.id, e.kod]),
  );
  const adlar = new Map(
    (
      await tx.kullanici.findMany({
        where: { id: { in: adimlar.flatMap((a) => ('adinaKullaniciId' in a.sifat ? [a.sifat.adinaKullaniciId] : [])) } },
        select: { id: true, ad: true },
      })
    ).map((k) => [k.id, k.ad]),
  );
  return adimlar.map(({ task, tur, baslangic, sifat }) => ({
    tur: 'TASK_KABUL',
    grup: sifat.sifat === 'ASIL' ? 'KENDI' : sifat.sifat === 'ESKALASYON' ? 'ESKALASYON' : 'VEKIL',
    adinaKullaniciId: 'adinaKullaniciId' in sifat ? sifat.adinaKullaniciId : null,
    id: task.id,
    baslik: task.baslik,
    termin: task.bitisTarihi,
    beklemeBaslangici: baslangic,
    neden: kabulNedeni(sifat, adlar, () =>
      task.assigneeEkipId
        ? `Ekip onayı: ${ekipKodlari.get(task.assigneeEkipId) ?? task.assigneeEkipId}`
        : tur === 'SORUMLU'
          ? 'Sorumlu yönetici onayı'
          : 'Bana atandı',
    ),
  }));
}

function kabulNedeni(sifat: BekleyenKabul['sifat'], adlar: Map<string, string>, kendi: () => string): string {
  switch (sifat.sifat) {
    case 'VEKIL':
      return `${adlar.get(sifat.adinaKullaniciId) ?? sifat.adinaKullaniciId} adına Vekil olarak`;
    case 'UST_YONETICI':
      return `${adlar.get(sifat.adinaKullaniciId) ?? sifat.adinaKullaniciId} yerine Üst yönetici olarak (Vekil talebin ilgilisi)`;
    case 'ESKALASYON':
      return 'Eskale edildi: süresinde karar verilmedi';
    default:
      return kendi();
  }
}

/**
 * Ticket 06: bana delege edilmiş, yanıt bekleyen Task'lar (DELEGASYON) ve Sorumlu yöneticisi olduğum
 * Ekiplerin havuzunda delege edilmeyi bekleyen Task'lar (EKIP_HAVUZU).
 */
export async function bekleyenDelegasyonIsleri(tx: Tx, kullaniciId: string, t: Date): Promise<BekleyenIs[]> {
  const [dels, kutu] = await Promise.all([bekleyenDelegasyonlariGetir(tx, kullaniciId), ekipGelenKutusuHesapla(tx, kullaniciId, t)]);
  const kod = new Map(
    (await tx.ekip.findMany({ where: { id: { in: dels.map((d) => d.ekipId) } }, select: { id: true, kod: true } })).map((e) => [e.id, e.kod]),
  );
  const bana: BekleyenIs[] = dels.map((d) => ({
    tur: 'DELEGASYON',
    id: d.task.id,
    baslik: d.task.baslik,
    termin: d.task.bitisTarihi,
    beklemeBaslangici: d.baslangic,
    neden: `Delegasyon: ${kod.get(d.ekipId) ?? d.ekipId}`,
    grup: 'KENDI',
    adinaKullaniciId: null,
  }));
  const havuz: BekleyenIs[] = kutu.kayitlar
    .filter((k) => k.tur === 'HAVUZ')
    .map((k) => ({ tur: 'EKIP_HAVUZU', id: k.task.id, baslik: k.task.baslik, termin: k.task.bitisTarihi, beklemeBaslangici: k.beklemeBaslangici, neden: `Delege et: ${k.ekipKod}`, grup: 'KENDI' as const, adinaKullaniciId: null }));
  return [...bana, ...havuz];
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
        const [kabuller, davetler, delegasyonlar] = await Promise.all([
          bekleyenKabuller(tx, kimlik.kullaniciId, kimlik.zaman),
          bekleyenDavetleriGetir(tx, kimlik.kullaniciId, kimlik.zaman),
          bekleyenDelegasyonIsleri(tx, kimlik.kullaniciId, kimlik.zaman),
        ]);
        const davetIsleri: BekleyenIs[] = davetler.map((d) => ({
          tur: 'ETKINLIK_DAVETI',
          id: d.etkinlik.id,
          baslik: d.etkinlik.baslik,
          termin: d.etkinlik.baslangic,
          beklemeBaslangici: d.etkinlik.baslangic,
          neden: 'Etkinlik daveti',
          grup: 'KENDI',
          adinaKullaniciId: null,
        }));
        return [...kabuller, ...davetIsleri, ...delegasyonlar].sort(sirala);
      });
    },
  };
}

export type BekleyenServisi = ReturnType<typeof bekleyenServisi>;
