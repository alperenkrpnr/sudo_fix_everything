// Raporlama (ticket 12, lean). Rol kapsamı: Çalışan kendisine atanan Task'lar, Yönetici yönettiği
// Ekipler (`yonetimKapsami`), Direktör hepsi. Çalışan sıralaması yalnızca yöneticilere.
//
// Tanımlar: TASLAK sayılmaz. Kapalı = TAMAMLANDI | IPTAL | REDDEDILDI; diğerleri açık.
// Geciken = açık ve bitisTarihi < şimdi. Çözüm süresi yalnızca TAMAMLANDI için.
//
// Çözüm ve blok süresi ticket 04'ün durum tarihçesinden (`durumOzetleri` → `cozumSureleri`, `blokSuresiOzeti`).
// Kabul bekleme ve ret raporu ticket 05 karar kayıtlarından (`modules/kabul/rapor.ts`); zincir kaydı yoksa null.
//
// Olay tarihindeki yapı (ADR-0002): Ekip ataması olay anında kaydedilen değerlerden okunur, güncel üyelikten
// yeniden çözülmez. Task → `task.ekipId` (atama anında Assignee Ekibi), ret akışı → `requesterEkipId` /
// `kararVerenEkipId` (zincir başlangıcı / karar anı). Taşınan Çalışanın geçmiş işleri eski Ekipte kalır.
// Arşivlenmiş Ekip, Task'ı varsa listede kalır. Yetki kapsamı (kim neyi görür) güncel yapıdan çözülür.
// Tarih aralığı: Task'lar `olusturma` ∈ [baslangic, bitis] ile seçilir; rapor anı = min(bitis, şimdi).
// Durum, blok/çözüm süresi, geciken ve kabul kararları o an itibarıyla hesaplanır (sonraki olaylar sayılmaz).
// Sınır: Ekip → Unit bağı tarih aralıklı değil; Unit filtresi güncel Unit'e göre çalışır.
import type { Task, TaskDurum } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { kabulBeklemeSureleri, retRaporuHesapla } from '../kabul/rapor';
import { durumOzeti } from '../task/durum';
import { oku, yonetimKapsami } from '../yetki';
import { yoneticiMi } from '../yetki/gorunurluk';

export interface Metrik {
  toplam: number;
  acik: number;
  kapali: number;
  tamamlanan: number;
  geciken: number;
  /** Ortalama çözüm süresi (saat, 1 ondalık); tamamlanan yoksa null. */
  ortCozumSaat: number | null;
}

export interface SureOzeti {
  adet: number;
  ortSaat: number | null;
}

export interface RaporOzeti {
  kapsam: 'KENDI' | 'YONETICI' | 'TUMU';
  genel: Metrik;
  /** Ekip bazlı performans; Çalışan için null. */
  ekipler: Array<Metrik & { ekipId: string; kod: string; ad: string }> | null;
  /** Çalışan sıralaması (yalnızca yöneticiler); Çalışan için null. */
  calisanlar: Array<Metrik & { kullaniciId: string; ad: string }> | null;
  /** null = veri yok (ticket 05 kabul kararları gelince dolar). */
  kabulBekleme: SureOzeti | null;
  /** Durum tarihçesinden (ticket 04); adet = bloklu kalmış Task sayısı. */
  blokSuresi: SureOzeti;
  /** null = veri yok (ticket 05 ret kayıtları gelince dolar). */
  retRaporu: { retOrani: number; gerekceler: Array<{ gerekce: string; adet: number }>; akis: Array<{ kaynakEkipId: string | null; hedefEkipId: string | null; adet: number }> } | null;
}

export interface RaporFiltresi {
  ekipId?: string;
  unitId?: string;
  /** Tarih aralığı (dahil): Task'lar oluşturulma anına göre seçilir. */
  baslangic?: Date;
  bitis?: Date;
}

const KAPALI: TaskDurum[] = ['TAMAMLANDI', 'IPTAL', 'REDDEDILDI'];
const SAAT = 3_600_000;

type DurumOzetleri = Map<string, ReturnType<typeof durumOzeti>>;

/**
 * Task başına durum tarihçesi özeti (ticket 04) `ref` anı itibarıyla: blok süresi, tamamlanma anı ve
 * `ref` anındaki durum. `ref` sonrası geçişler sayılmaz (geçmiş aralığın raporu sonradan değişmez).
 * Tarihçesi olmayan Task'ın özeti yoktur; durumu güncel `task.durum` kabul edilir.
 */
export async function durumOzetleri(tx: Tx, tasks: Task[], ref: Date): Promise<{ ozetler: DurumOzetleri; durumlar: Map<string, TaskDurum> }> {
  const gecisler = await tx.taskDurumGecisi.findMany({
    where: { taskId: { in: tasks.map((x) => x.id) } },
    orderBy: [{ zaman: 'asc' }, { id: 'asc' }],
  });
  const grup = new Map<string, typeof gecisler>();
  for (const g of gecisler) grup.set(g.taskId, [...(grup.get(g.taskId) ?? []), g]);
  const ozetler: DurumOzetleri = new Map();
  const durumlar = new Map<string, TaskDurum>();
  for (const x of tasks) {
    const tum = grup.get(x.id);
    if (!tum) {
      durumlar.set(x.id, x.durum);
      continue;
    }
    const gs = tum.filter((g) => g.zaman <= ref);
    ozetler.set(x.id, durumOzeti(gs, ref));
    durumlar.set(x.id, gs.length ? gs[gs.length - 1].yeni : (tum[0].eski ?? x.durum));
  }
  return { ozetler, durumlar };
}

/**
 * TAMAMLANDI Task'ların çözüm süresi (ms): olusturma → tarihçedeki son TAMAMLANDI geçişi.
 * Tarihçesi olmayan (04 öncesi / doğrudan yazılmış) Task'larda yedek: `guncelleme`.
 */
export function cozumSureleri(tasks: Task[], ozetler: DurumOzetleri): Map<string, number> {
  return new Map(
    tasks
      .filter((x) => x.durum === 'TAMAMLANDI')
      .map((x) => [x.id, (ozetler.get(x.id)?.tamamlanma ?? x.guncelleme).getTime() - x.olusturma.getTime()]),
  );
}

/** Kabul bekleme süresi (ticket 05 karar kayıtları: adım başlangıcı → karar). Zincir kaydı yok → null. */
export async function kabulBeklemeOzeti(tx: Tx, tasks: Task[], ref: Date): Promise<SureOzeti | null> {
  return kabulBeklemeSureleri(tx, tasks.map((x) => x.id), ref);
}

/** Bloklu kalmış Task'lar ve Task başına ortalama blok süresi (hâlâ bloklu olan şimdiye kadar). */
export function blokSuresiOzeti(ozetler: DurumOzetleri): SureOzeti {
  const sureler = [...ozetler.values()].map((o) => o.blokSuresiMs).filter((ms) => ms > 0);
  const ort = sureler.length ? sureler.reduce((a, b) => a + b, 0) / sureler.length / SAAT : null;
  return { adet: sureler.length, ortSaat: ort === null ? null : Math.round(ort * 10) / 10 };
}

/** Ret oranı, gerekçe dağılımı, Ekip'ten Ekip'e ret akışı (ticket 05 karar kayıtları). Zincir kaydı yok → null. */
export async function retRaporu(tx: Tx, tasks: Task[], ref: Date): Promise<RaporOzeti['retRaporu']> {
  return retRaporuHesapla(tx, tasks.map((x) => x.id), ref);
}

function metrik(tasks: Task[], sureler: Map<string, number>, simdi: Date): Metrik {
  const kapali = tasks.filter((x) => KAPALI.includes(x.durum)).length;
  const cozumler = tasks.flatMap((x) => (sureler.has(x.id) ? [sureler.get(x.id)!] : []));
  const ort = cozumler.length ? cozumler.reduce((a, b) => a + b, 0) / cozumler.length / SAAT : null;
  return {
    toplam: tasks.length,
    acik: tasks.length - kapali,
    kapali,
    tamamlanan: tasks.filter((x) => x.durum === 'TAMAMLANDI').length,
    geciken: tasks.filter((x) => !KAPALI.includes(x.durum) && x.bitisTarihi && x.bitisTarihi < simdi).length,
    ortCozumSaat: ort === null ? null : Math.round(ort * 10) / 10,
  };
}

/** Sıralama: tamamlanan çok → ortalama çözüm kısa (null en sonda) → geciken az → ad. */
function siralamaKarsilastir(a: Metrik & { ad: string }, b: Metrik & { ad: string }): number {
  return (
    b.tamamlanan - a.tamamlanan ||
    (a.ortCozumSaat ?? Infinity) - (b.ortCozumSaat ?? Infinity) ||
    a.geciken - b.geciken ||
    a.ad.localeCompare(b.ad, 'tr')
  );
}

export function raporServisi(ctx: ServiceContext) {
  return {
    /** Çağıranın rol kapsamındaki rapor özeti. */
    ozet(actor: Actor, filtre: RaporFiltresi = {}): Promise<RaporOzeti> {
      return oku(ctx, actor, 'rapor.ozet', async (kimlik, tx) => {
        const simdi = kimlik.zaman;
        if (filtre.baslangic && filtre.bitis && filtre.baslangic > filtre.bitis)
          throw new DogrulamaHatasi('Başlangıç bitişten sonra olamaz');
        // Rapor anı: geçmiş bir aralık, aralık sonundaki duruma göre hesaplanır.
        const ref = filtre.bitis && filtre.bitis < simdi ? filtre.bitis : simdi;
        const yonetici = yoneticiMi(kimlik.roller);
        const kapsam = await yonetimKapsami(tx, kimlik.kullaniciId, simdi);

        // Ekip kümesi: kapsam ∩ filtre
        // (Çalışan: kapsam kendisine atananlardır; Ekip kümesi yalnızca filtreden gelir.)
        let ekipIds: string[] | null = kapsam.tumu || !yonetici ? null : kapsam.ekipIds;
        if (filtre.unitId || filtre.ekipId) {
          const filtreEkipleri = (
            await tx.ekip.findMany({ where: { unitId: filtre.unitId, id: filtre.ekipId }, select: { id: true } })
          ).map((e) => e.id);
          if (yonetici && !kapsam.tumu && filtreEkipleri.some((id) => !kapsam.ekipIds.includes(id)))
            throw new YetkiHatasi('Bu Ekip/Unit raporu kapsamınız dışında');
          ekipIds = filtreEkipleri;
        }

        const adaylar = await tx.task.findMany({
          where: {
            durum: { not: 'TASLAK' },
            ...(filtre.baslangic || filtre.bitis ? { olusturma: { gte: filtre.baslangic, lte: filtre.bitis } } : {}),
            ...(yonetici
              ? ekipIds === null ? {} : { ekipId: { in: ekipIds } }
              : { assigneeKullaniciId: kimlik.kullaniciId, ...(ekipIds ? { ekipId: { in: ekipIds } } : {}) }),
          },
        });
        const { ozetler, durumlar } = await durumOzetleri(tx, adaylar, ref);
        // Durum `ref` anındakidir; o an Taslak olanlar sayılmaz.
        const tasks = adaylar.map((x) => ({ ...x, durum: durumlar.get(x.id)! })).filter((x) => x.durum !== 'TASLAK');
        const sureler = cozumSureleri(tasks, ozetler);
        const blokSuresi = blokSuresiOzeti(ozetler);
        const [kabulBekleme, ret] = await Promise.all([kabulBeklemeOzeti(tx, tasks, ref), retRaporu(tx, tasks, ref)]);
        const sonuc: RaporOzeti = {
          kapsam: kapsam.tumu ? 'TUMU' : yonetici ? 'YONETICI' : 'KENDI',
          genel: metrik(tasks, sureler, ref),
          ekipler: null,
          calisanlar: null,
          kabulBekleme,
          blokSuresi,
          retRaporu: ret,
        };
        if (!yonetici) return sonuc;

        const ekipler = await tx.ekip.findMany({
          // Arşivlenmiş Ekip, kapsamdaki Task'ları varsa geçmişiyle listede kalır (ADR-0002).
          where: {
            OR: [{ arsivlendi: null }, { id: { in: tasks.flatMap((x) => (x.ekipId ? [x.ekipId] : [])) } }],
            ...(ekipIds === null ? {} : { id: { in: ekipIds } }),
          },
          orderBy: { kod: 'asc' },
        });
        sonuc.ekipler = ekipler.map((e) => ({
          ekipId: e.id,
          kod: e.kod,
          ad: e.ad,
          ...metrik(tasks.filter((x) => x.ekipId === e.id), sureler, ref),
        }));

        const kisiIds = [...new Set(tasks.flatMap((x) => (x.assigneeKullaniciId ? [x.assigneeKullaniciId] : [])))];
        const kisiler = await tx.kullanici.findMany({ where: { id: { in: kisiIds } }, select: { id: true, ad: true } });
        sonuc.calisanlar = kisiler
          .map((k) => ({ kullaniciId: k.id, ad: k.ad, ...metrik(tasks.filter((x) => x.assigneeKullaniciId === k.id), sureler, ref) }))
          .sort(siralamaKarsilastir);
        return sonuc;
      });
    },
  };
}

export type RaporServisi = ReturnType<typeof raporServisi>;
