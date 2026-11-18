// Raporlama (ticket 12, lean). Rol kapsamı: Çalışan kendisine atanan Task'lar, Yönetici yönettiği
// Ekipler (`yonetimKapsami`), Direktör hepsi. Çalışan sıralaması yalnızca yöneticilere.
//
// Tanımlar: TASLAK sayılmaz. Kapalı = TAMAMLANDI | IPTAL | REDDEDILDI; diğerleri açık.
// Geciken = açık ve bitisTarihi < şimdi. Çözüm süresi yalnızca TAMAMLANDI için.
//
// Çözüm ve blok süresi ticket 04'ün durum tarihçesinden (`durumOzetleri` → `cozumSureleri`, `blokSuresiOzeti`).
// SWAP POINT'ler (ticket 05 karar kayıtları gelince): `kabulBeklemeOzeti`, `retRaporu` (şimdilik null = veri yok).
// TODO (ADR-0002, ertelendi): Task'ın Ekibi `task.ekipId` (oluşturma anındaki); kapsam güncel yapıdan çözülür.
import type { Task, TaskDurum } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
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
}

const KAPALI: TaskDurum[] = ['TAMAMLANDI', 'IPTAL', 'REDDEDILDI'];
const SAAT = 3_600_000;

type DurumOzetleri = Map<string, ReturnType<typeof durumOzeti>>;

/** Task başına durum tarihçesi özeti (ticket 04): blok süresi ve tamamlanma anı. Tarihçesi olmayan Task yok sayılır. */
export async function durumOzetleri(tx: Tx, tasks: Task[], simdi: Date): Promise<DurumOzetleri> {
  const gecisler = await tx.taskDurumGecisi.findMany({
    where: { taskId: { in: tasks.map((x) => x.id) } },
    orderBy: [{ zaman: 'asc' }, { id: 'asc' }],
  });
  const grup = new Map<string, typeof gecisler>();
  for (const g of gecisler) grup.set(g.taskId, [...(grup.get(g.taskId) ?? []), g]);
  return new Map([...grup].map(([id, gs]) => [id, durumOzeti(gs, simdi)]));
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

/** SWAP POINT (ticket 05): kabul bekleme süresi (KABUL_BEKLIYOR → karar). Veri yok → null. */
export async function kabulBeklemeOzeti(_tx: Tx, _tasks: Task[]): Promise<SureOzeti | null> {
  return null;
}

/** Bloklu kalmış Task'lar ve Task başına ortalama blok süresi (hâlâ bloklu olan şimdiye kadar). */
export function blokSuresiOzeti(ozetler: DurumOzetleri): SureOzeti {
  const sureler = [...ozetler.values()].map((o) => o.blokSuresiMs).filter((ms) => ms > 0);
  const ort = sureler.length ? sureler.reduce((a, b) => a + b, 0) / sureler.length / SAAT : null;
  return { adet: sureler.length, ortSaat: ort === null ? null : Math.round(ort * 10) / 10 };
}

/** SWAP POINT (ticket 05): ret oranı, gerekçe dağılımı, Ekip'ten Ekip'e ret akışı. Veri yok → null. */
export async function retRaporu(_tx: Tx, _tasks: Task[]): Promise<RaporOzeti['retRaporu']> {
  return null;
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

        const tasks = await tx.task.findMany({
          where: {
            durum: { not: 'TASLAK' },
            ...(yonetici
              ? ekipIds === null ? {} : { ekipId: { in: ekipIds } }
              : { assigneeKullaniciId: kimlik.kullaniciId, ...(ekipIds ? { ekipId: { in: ekipIds } } : {}) }),
          },
        });
        const ozetler = await durumOzetleri(tx, tasks, simdi);
        const sureler = cozumSureleri(tasks, ozetler);
        const blokSuresi = blokSuresiOzeti(ozetler);
        const [kabulBekleme, ret] = await Promise.all([kabulBeklemeOzeti(tx, tasks), retRaporu(tx, tasks)]);
        const sonuc: RaporOzeti = {
          kapsam: kapsam.tumu ? 'TUMU' : yonetici ? 'YONETICI' : 'KENDI',
          genel: metrik(tasks, sureler, simdi),
          ekipler: null,
          calisanlar: null,
          kabulBekleme,
          blokSuresi,
          retRaporu: ret,
        };
        if (!yonetici) return sonuc;

        const ekipler = await tx.ekip.findMany({
          where: { arsivlendi: null, ...(ekipIds === null ? {} : { id: { in: ekipIds } }) },
          orderBy: { kod: 'asc' },
        });
        sonuc.ekipler = ekipler.map((e) => ({
          ekipId: e.id,
          kod: e.kod,
          ad: e.ad,
          ...metrik(tasks.filter((x) => x.ekipId === e.id), sureler, simdi),
        }));

        const kisiIds = [...new Set(tasks.flatMap((x) => (x.assigneeKullaniciId ? [x.assigneeKullaniciId] : [])))];
        const kisiler = await tx.kullanici.findMany({ where: { id: { in: kisiIds } }, select: { id: true, ad: true } });
        sonuc.calisanlar = kisiler
          .map((k) => ({ kullaniciId: k.id, ad: k.ad, ...metrik(tasks.filter((x) => x.assigneeKullaniciId === k.id), sureler, simdi) }))
          .sort(siralamaKarsilastir);
        return sonuc;
      });
    },
  };
}

export type RaporServisi = ReturnType<typeof raporServisi>;
