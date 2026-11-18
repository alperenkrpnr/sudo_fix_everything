// Task detayı (ticket 07): alt task, yorum, dosya eki, etiket/harici ref düzenleme ve Backlog görünümü.
// Yetki: üst Task'ı gören herkes (spec: "görür ve günceller") okur ve yazar; görünmeyen Task → BULUNAMADI.
import type { AltTask, Task, TaskDurum, TaskEki, TaskYorumu } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { gorunurTask } from '../task';
import { ekDogrula, ekOku, ekYaz } from './ek';
import { oku, taskGorunurluk, yaz } from '../yetki';

export type { AltTask, TaskEki, TaskYorumu };
export { IZINLI_TURLER } from './ek';

/** Task tarihçesi: yorumlar ve durum geçişleri (ticket 04) tek zaman çizelgesinde, eskiden yeniye. */
export type TarihceKaydi =
  | { tur: 'YORUM'; id: string; zaman: Date; kullaniciId: string; metin: string }
  | { tur: 'DURUM'; id: string; zaman: Date; kullaniciId: string; eski: TaskDurum | null; yeni: TaskDurum; neden: string | null };

const YORUM_MAX = 5000;

export interface Ilerleme {
  tamamlanan: number;
  toplam: number;
}

export interface TaskDetayi {
  altTasklar: AltTask[];
  ilerleme: Ilerleme;
  tarihce: TarihceKaydi[];
  ekler: TaskEki[];
}

/** Backlog satırı: Task + alt task ilerlemesi. */
export type BacklogTask = Task & { ilerleme: Ilerleme };

const KAPALI: TaskDurum[] = ['TAMAMLANDI', 'IPTAL', 'REDDEDILDI'];

export interface IndirilenEk {
  dosyaAdi: string;
  mimeTuru: string;
  icerik: Buffer;
}

/** Alt task'ı yükler ve üst Task'ın görünürlüğünü uygular. */
async function gorunurAltTask(tx: Tx, kullaniciId: string, t: Date, id: string): Promise<AltTask> {
  const a = await tx.altTask.findUnique({ where: { id } });
  if (!a) throw new BulunamadiHatasi('Alt task bulunamadı');
  await gorunurTask(tx, kullaniciId, t, a.taskId);
  return a;
}

/** Etiketler: kırpılır, boşlar atılır, tekilleştirilir (sıra korunur). */
function etiketleriTemizle(etiketler: unknown): string[] {
  if (!Array.isArray(etiketler)) throw new DogrulamaHatasi('Etiketler liste olmalı');
  const temiz = [...new Set(etiketler.map((e) => String(e ?? '').trim()).filter(Boolean))];
  if (temiz.length > 20 || temiz.some((e) => e.length > 50)) throw new DogrulamaHatasi('En fazla 20 etiket, her biri en fazla 50 karakter');
  return temiz;
}

/** Harici ticket referansı: boş → null; şema içeriyorsa yalnızca http(s) link; aksi halde düz ID. */
function hariciRefTemizle(ref: unknown): string | null {
  const r = String(ref ?? '').trim();
  if (!r) return null;
  if (r.length > 500 || /[\u0000-\u001f\u007f]/.test(r)) throw new DogrulamaHatasi('Geçersiz harici referans');
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) {
    let url: URL;
    try {
      url = new URL(r);
    } catch {
      throw new DogrulamaHatasi('Geçersiz harici link');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new DogrulamaHatasi('Harici link http(s) olmalı');
  }
  return r;
}

function ilerleme(altTasklar: Pick<AltTask, 'tamamlandi'>[]): Ilerleme {
  return { tamamlanan: altTasklar.filter((a) => a.tamamlandi).length, toplam: altTasklar.length };
}

export function taskDetayServisi(ctx: ServiceContext) {
  return {
    /** Üst Task'a alt task ekler. */
    altTaskEkle(actor: Actor, taskId: string, g: { baslik: string }): Promise<AltTask> {
      return yaz(ctx, actor, 'taskDetay.altTaskEkle', async (kimlik, tx) => {
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const baslik = String(g?.baslik ?? '').trim();
        if (!baslik) throw new DogrulamaHatasi('Başlık zorunlu');
        const a = await tx.altTask.create({
          data: { taskId, baslik, olusturanId: kimlik.kullaniciId, olusturma: kimlik.zaman },
        });
        return { sonuc: a, denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { altTaskId: a.id, baslik } } };
      });
    },

    /** Alt task'ı tamamlandı / açık olarak işaretler. */
    altTaskTamamla(actor: Actor, altTaskId: string, tamamlandi: boolean): Promise<AltTask> {
      return yaz(ctx, actor, 'taskDetay.altTaskTamamla', async (kimlik, tx) => {
        const mevcut = await gorunurAltTask(tx, kimlik.kullaniciId, kimlik.zaman, altTaskId);
        const a = await tx.altTask.update({
          where: { id: mevcut.id },
          data: { tamamlandi: !!tamamlandi, tamamlanmaZamani: tamamlandi ? kimlik.zaman : null },
        });
        return { sonuc: a, denetim: { varlikTuru: 'Task', varlikId: a.taskId, veri: { altTaskId: a.id, tamamlandi: a.tamamlandi } } };
      });
    },

    /** Backlog görünümü: çağıranın görebildiği, bitiş tarihi olmayan açık Task'lar (önce yüksek öncelik, sonra en eski). */
    backlog(actor: Actor): Promise<BacklogTask[]> {
      return oku(ctx, actor, 'taskDetay.backlog', async (kimlik, tx) => {
        const gorunur = await taskGorunurluk(tx, kimlik.kullaniciId, kimlik.zaman);
        const tasklar = await tx.task.findMany({
          where: { AND: [gorunur, { bitisTarihi: null, durum: { notIn: KAPALI } }] },
          orderBy: [{ oncelik: 'desc' }, { olusturma: 'asc' }, { id: 'asc' }],
        });
        const altlar = await tx.altTask.findMany({ where: { taskId: { in: tasklar.map((x) => x.id) } }, select: { taskId: true, tamamlandi: true } });
        return tasklar.map((task) => ({ ...task, ilerleme: ilerleme(altlar.filter((a) => a.taskId === task.id)) }));
      });
    },

    /** Etiketleri ve/veya harici ticket referansını (link/ID) düzenler. Verilmeyen alan değişmez. */
    etiketRefGuncelle(actor: Actor, taskId: string, g: { etiketler?: string[]; hariciRef?: string | null }): Promise<Task> {
      return yaz(ctx, actor, 'taskDetay.etiketRefGuncelle', async (kimlik, tx) => {
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const data: { etiketler?: string[]; hariciRef?: string | null } = {};
        if (g?.etiketler !== undefined) data.etiketler = etiketleriTemizle(g.etiketler);
        if (g?.hariciRef !== undefined) data.hariciRef = hariciRefTemizle(g.hariciRef);
        const task = await tx.task.update({ where: { id: taskId }, data: { ...data, guncelleme: kimlik.zaman } });
        return { sonuc: task, denetim: { varlikTuru: 'Task', varlikId: taskId, veri: data } };
      });
    },

    /** Task'a yorum ekler; yorumlar düzenlenmez/silinmez, tarihçede görünür. */
    yorumEkle(actor: Actor, taskId: string, g: { metin: string }): Promise<TaskYorumu> {
      return yaz(ctx, actor, 'taskDetay.yorumEkle', async (kimlik, tx) => {
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const metin = String(g?.metin ?? '').trim();
        if (!metin) throw new DogrulamaHatasi('Yorum boş olamaz');
        if (metin.length > YORUM_MAX) throw new DogrulamaHatasi(`Yorum en fazla ${YORUM_MAX} karakter olabilir`);
        const y = await tx.taskYorumu.create({ data: { taskId, yazarId: kimlik.kullaniciId, metin, zaman: kimlik.zaman } });
        return { sonuc: y, denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { yorumId: y.id } } };
      });
    },

    /** Task'a dosya eki yükler. Tür (uzantı) ve boyut (`ctx.config.ekMaxBayt`) sınırı burada uygulanır. */
    ekYukle(actor: Actor, taskId: string, g: { dosyaAdi: string; icerik: Buffer }): Promise<TaskEki> {
      return yaz(ctx, actor, 'taskDetay.ekYukle', async (kimlik, tx) => {
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const { dosyaAdi, mimeTuru, boyut } = ekDogrula(ctx.config, g?.dosyaAdi, g?.icerik);
        const ek = await tx.taskEki.create({
          data: { taskId, dosyaAdi, mimeTuru, boyut, yukleyenId: kimlik.kullaniciId, zaman: kimlik.zaman },
        });
        await ekYaz(ctx.config, ek.id, g.icerik); // hata → tx geri alınır
        return { sonuc: ek, denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { ekId: ek.id, dosyaAdi, boyut } } };
      });
    },

    /** Eki indirir; yetki üst Task'ın görünürlüğüdür (görünmüyorsa BULUNAMADI). */
    ekIndir(actor: Actor, ekId: string): Promise<IndirilenEk> {
      return oku(ctx, actor, 'taskDetay.ekIndir', async (kimlik, tx) => {
        const ek = await tx.taskEki.findUnique({ where: { id: ekId } });
        if (!ek) throw new BulunamadiHatasi('Ek bulunamadı');
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, ek.taskId);
        return { dosyaAdi: ek.dosyaAdi, mimeTuru: ek.mimeTuru, icerik: await ekOku(ctx.config, ek.id) };
      });
    },

    /** Task detayı: alt tasklar + ilerleme + tarihçe (yorum + durum geçişi). */
    detay(actor: Actor, taskId: string): Promise<TaskDetayi> {
      return oku(ctx, actor, 'taskDetay.detay', async (kimlik, tx) => {
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const [altTasklar, yorumlar, gecisler, ekler] = await Promise.all([
          tx.altTask.findMany({ where: { taskId }, orderBy: [{ olusturma: 'asc' }, { id: 'asc' }] }),
          tx.taskYorumu.findMany({ where: { taskId }, orderBy: [{ zaman: 'asc' }, { id: 'asc' }] }),
          tx.taskDurumGecisi.findMany({ where: { taskId }, orderBy: [{ zaman: 'asc' }, { id: 'asc' }] }),
          tx.taskEki.findMany({ where: { taskId }, orderBy: [{ zaman: 'asc' }, { id: 'asc' }] }),
        ]);
        const tarihce: TarihceKaydi[] = [
          ...yorumlar.map((y) => ({ tur: 'YORUM' as const, id: y.id, zaman: y.zaman, kullaniciId: y.yazarId, metin: y.metin })),
          ...gecisler.map((g) => ({ tur: 'DURUM' as const, id: g.id, zaman: g.zaman, kullaniciId: g.kullaniciId, eski: g.eski, yeni: g.yeni, neden: g.neden })),
        ].sort((a, b) => a.zaman.getTime() - b.zaman.getTime());
        return { altTasklar, ilerleme: ilerleme(altTasklar), tarihce, ekler };
      });
    },
  };
}

export type TaskDetayServisi = ReturnType<typeof taskDetayServisi>;
