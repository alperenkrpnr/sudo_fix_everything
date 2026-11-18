// Task durum makinesi (ticket 04): izinli geçişler, yetki, tarihçe, blok bildirimi.
// Tarihçe `TaskDurumGecisi` (prisma/schema/task-durum.prisma); raporlar oradan hesaplar.
import type { Task, TaskDurum, TaskDurumGecisi } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { bildirimGonder } from '../bildirim';
import { oku, sorumluYonetici, taskGorunurluk, ustYoneticiler, yaz } from '../yetki';
import { taskDurumYetkisi } from '../yetki/task-durum';

export type { TaskDurumGecisi };

/**
 * İzinli geçişler. Kabul Bekliyor'da işe başlanamaz (yalnızca İptal; kabul/ret ticket 05).
 * Tamamlandı → Devam Ediyor: yeniden açma (aynı Task, aynı tarihçe). Reddedildi ve İptal sondur.
 */
export const GECISLER: Record<TaskDurum, TaskDurum[]> = {
  TASLAK: ['IPTAL'],
  KABUL_BEKLIYOR: ['IPTAL'],
  KABUL_EDILDI: ['DEVAM_EDIYOR', 'BLOKLU', 'TAMAMLANDI', 'IPTAL'],
  DEVAM_EDIYOR: ['BLOKLU', 'TAMAMLANDI', 'IPTAL'],
  BLOKLU: ['DEVAM_EDIYOR', 'TAMAMLANDI', 'IPTAL'],
  TAMAMLANDI: ['DEVAM_EDIYOR'],
  REDDEDILDI: [],
  IPTAL: [],
};

export interface DurumDegisikligi {
  durum: TaskDurum;
  /** Bloklu için zorunlu. */
  neden?: string | null;
}

export interface DurumGecmisi {
  gecisler: TaskDurumGecisi[];
  /** Toplam Bloklu kalma süresi (ms); hâlâ Bloklu ise şimdiye kadar. */
  blokSuresiMs: number;
  /** Son Tamamlandı anı (yeniden açıldıysa null). */
  tamamlanma: Date | null;
}

/**
 * Tarihçe satırı yazar. Durum değiştiren diğer modüller (ör. ticket 05 kabul/ret) de bunu
 * kendi `yaz` gövdelerinde çağırmalı ki raporlar tek tablodan hesaplansın.
 */
export async function durumGecisiKaydet(
  tx: Tx,
  g: { taskId: string; eski: TaskDurum | null; yeni: TaskDurum; zaman: Date; kullaniciId: string; neden?: string | null },
): Promise<void> {
  await tx.taskDurumGecisi.create({ data: { ...g, neden: g.neden ?? null } });
}

/** Tarihçeden blok süresi ve tamamlanma anı (saf fonksiyon; raporlar da kullanabilir). */
export function durumOzeti(gecisler: Pick<TaskDurumGecisi, 'yeni' | 'zaman'>[], simdi: Date): Omit<DurumGecmisi, 'gecisler'> {
  let blokSuresiMs = 0;
  let blokBaslangic: Date | null = null;
  let tamamlanma: Date | null = null;
  for (const g of gecisler) {
    if (blokBaslangic) blokSuresiMs += g.zaman.getTime() - blokBaslangic.getTime();
    blokBaslangic = g.yeni === 'BLOKLU' ? g.zaman : null;
    tamamlanma = g.yeni === 'TAMAMLANDI' ? g.zaman : null;
  }
  if (blokBaslangic) blokSuresiMs += simdi.getTime() - blokBaslangic.getTime();
  return { blokSuresiMs, tamamlanma };
}

export function taskDurumIslemleri(ctx: ServiceContext) {
  return {
    /** Durumu değiştirir: geçiş izinli olmalı, Bloklu neden ister, Requester yalnızca İptal eder. */
    durumDegistir(actor: Actor, id: string, d: DurumDegisikligi): Promise<Task> {
      return yaz(ctx, actor, 'task.durumDegistir', async (kimlik, tx) => {
        const mevcut = await gorunur(tx, kimlik.kullaniciId, kimlik.zaman, id);
        const yetki = await taskDurumYetkisi(tx, kimlik.kullaniciId, mevcut, kimlik.zaman);
        if (!yetki) throw new YetkiHatasi('Bu Task\'ın durumunu değiştiremezsiniz');
        if (yetki === 'IPTAL' && d.durum !== 'IPTAL') throw new YetkiHatasi('Requester yalnızca İptal edebilir');
        if (!GECISLER[mevcut.durum].includes(d.durum))
          throw new DogrulamaHatasi(`Geçersiz durum geçişi: ${mevcut.durum} → ${d.durum}`);
        const neden = d.neden?.trim() || null;
        if (d.durum === 'BLOKLU' && !neden) throw new DogrulamaHatasi('Bloklu için neden zorunlu');

        const task = await tx.task.update({ where: { id }, data: { durum: d.durum, guncelleme: kimlik.zaman } });
        await durumGecisiKaydet(tx, { taskId: id, eski: mevcut.durum, yeni: d.durum, zaman: kimlik.zaman, kullaniciId: kimlik.kullaniciId, neden });
        if (d.durum === 'BLOKLU') await blokBildirimi(tx, task, kimlik.ad, neden!, kimlik.zaman, kimlik.kullaniciId);
        return {
          sonuc: task,
          denetim: { varlikTuru: 'Task', varlikId: id, veri: { eski: mevcut.durum, yeni: d.durum, neden } },
        };
      });
    },

    /** Task'ın durum tarihçesi (eskiden yeniye) + blok süresi + tamamlanma anı. */
    durumGecmisi(actor: Actor, id: string): Promise<DurumGecmisi> {
      return oku(ctx, actor, 'task.durumGecmisi', async (kimlik, tx) => {
        await gorunur(tx, kimlik.kullaniciId, kimlik.zaman, id);
        const gecisler = await tx.taskDurumGecisi.findMany({ where: { taskId: id }, orderBy: [{ zaman: 'asc' }, { id: 'asc' }] });
        return { gecisler, ...durumOzeti(gecisler, kimlik.zaman) };
      });
    },
  };
}

async function gorunur(tx: Tx, kullaniciId: string, t: Date, id: string): Promise<Task> {
  const task = await tx.task.findFirst({ where: { AND: [{ id }, await taskGorunurluk(tx, kullaniciId, t)] } });
  if (!task) throw new BulunamadiHatasi('Task bulunamadı');
  return task;
}

/** Blok bildirimi: Requester, Assignee ve Sorumlu yönetici(ler)e. */
async function blokBildirimi(tx: Tx, task: Task, kimAd: string, neden: string, zaman: Date, haric: string) {
  const alicilar = [task.requesterId];
  if (task.assigneeKullaniciId) {
    alicilar.push(task.assigneeKullaniciId, ...(await ustYoneticiler(tx, task.assigneeKullaniciId, zaman)).slice(0, 1));
  }
  if (task.assigneeEkipId) alicilar.push(...(await sorumluYonetici(tx, task.assigneeEkipId, zaman)));
  await bildirimGonder(tx, {
    kullaniciIds: alicilar,
    tur: 'TASK_BLOK',
    mesaj: `"${task.baslik}" Bloklu (${kimAd}): ${neden}`,
    varlikTuru: 'Task',
    varlikId: task.id,
    zaman,
    haric,
  });
}
