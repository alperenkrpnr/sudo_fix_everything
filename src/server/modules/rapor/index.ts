// Raporlama (ticket 12, lean). Rol kapsamı: Çalışan kendisine atanan Task'lar, Yönetici yönettiği
// Ekipler (`yonetimKapsami`), Direktör hepsi. Çalışan sıralaması yalnızca yöneticilere.
//
// Tanımlar: TASLAK sayılmaz. Kapalı = TAMAMLANDI | IPTAL | REDDEDILDI; diğerleri açık.
// Geciken = açık ve bitisTarihi < şimdi. Çözüm süresi yalnızca TAMAMLANDI için.
//
// SWAP POINT'ler (aşağıdaki fonksiyonlar): `cozumSureleri` (04: durum geçmişi), `kabulBeklemeOzeti`
// (05: karar kayıtları), `blokSuresiOzeti` (04), `retRaporu` (05).
// TODO (ADR-0002, ertelendi): Task'ın Ekibi `task.ekipId` (oluşturma anındaki); kapsam güncel yapıdan çözülür.
import type { Task, TaskDurum } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
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
  /** null = veri yok (ticket 04 durum geçmişi gelince dolar). */
  blokSuresi: SureOzeti | null;
  /** null = veri yok (ticket 05 ret kayıtları gelince dolar). */
  retRaporu: { retOrani: number; gerekceler: Array<{ gerekce: string; adet: number }>; akis: Array<{ kaynakEkipId: string | null; hedefEkipId: string | null; adet: number }> } | null;
}

export interface RaporFiltresi {
  ekipId?: string;
  unitId?: string;
}

const KAPALI: TaskDurum[] = ['TAMAMLANDI', 'IPTAL', 'REDDEDILDI'];
const SAAT = 3_600_000;

/**
 * SWAP POINT (ticket 04): TAMAMLANDI Task'ların çözüm süresi (ms), olusturma → tamamlanma.
 * Şimdilik tamamlanma anı = `guncelleme` (durum geçmişi yok). 04 birleşince TAMAMLANDI geçişinin zamanını kullanın.
 */
export async function cozumSureleri(_tx: Tx, tasks: Task[]): Promise<Map<string, number>> {
  return new Map(tasks.filter((x) => x.durum === 'TAMAMLANDI').map((x) => [x.id, x.guncelleme.getTime() - x.olusturma.getTime()]));
}

/** SWAP POINT (ticket 05): kabul bekleme süresi (KABUL_BEKLIYOR → karar). Veri yok → null. */
export async function kabulBeklemeOzeti(_tx: Tx, _tasks: Task[]): Promise<SureOzeti | null> {
  return null;
}

/** SWAP POINT (ticket 04): BLOKLU'da geçen toplam süre. Veri yok → null. */
export async function blokSuresiOzeti(_tx: Tx, _tasks: Task[]): Promise<SureOzeti | null> {
  return null;
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
        const sureler = await cozumSureleri(tx, tasks);
        const [kabulBekleme, blokSuresi, ret] = await Promise.all([
          kabulBeklemeOzeti(tx, tasks),
          blokSuresiOzeti(tx, tasks),
          retRaporu(tx, tasks),
        ]);
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
