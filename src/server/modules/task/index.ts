// Task modülü: oluşturma, listeleme, görüntüleme, alan güncelleme.
// Kabul zinciri `modules/kabul` (kurallar `yetki/kabul.ts`), görünürlük `yetki/task.ts#taskGorunurluk` içindedir.
import type { Task, TaskDurum, TaskOncelik } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { atamaPlani, zincirBaslat } from '../kabul';
import { aktif, oku, taskGorunurluk, uyeOlduguEkipler, yaz, type TaskAtamaHedefi } from '../yetki';

export type { TaskDurum, TaskOncelik };
export type TaskGorunumu = Task;

export interface TaskGirdisi {
  baslik: string;
  aciklama?: string | null;
  oncelik?: TaskOncelik;
  bitisTarihi?: Date | null;
  etiketler?: string[];
  hariciRef?: string | null;
  /** Assignee: tam olarak biri. İkisi de yoksa Self-assign. */
  assigneeKullaniciId?: string | null;
  assigneeEkipId?: string | null;
  /** true: Taslak olarak kaydet (atama kararı `gonder` ile verilir). */
  taslak?: boolean;
}

export type TaskAlanlari = Partial<Pick<TaskGirdisi, 'baslik' | 'aciklama' | 'oncelik' | 'bitisTarihi' | 'etiketler' | 'hariciRef'>>;

export interface Rehber {
  ekipler: Array<{ id: string; kod: string; ad: string }>;
  kullanicilar: Array<{ id: string; ad: string; unvan: string | null; ekipler: Array<{ id: string; kod: string }> }>;
}

/** Atama: durumu kabul zincirine göre belirler, Task'ı yazar (`yaz`), zinciri kaydeder (ticket 05). */
async function atamaYap(tx: Tx, requesterId: string, hedef: TaskAtamaHedefi, t: Date, yaz: (durum: TaskDurum) => Promise<Task>): Promise<Task> {
  const plan = await atamaPlani(tx, requesterId, hedef, t);
  const task = await yaz(plan.durum);
  await zincirBaslat(tx, task, plan, t);
  return task;
}

async function hedefCoz(tx: Tx, requesterId: string, g: TaskGirdisi, t: Date): Promise<{ hedef: TaskAtamaHedefi; ekipId: string | null }> {
  if (g.assigneeKullaniciId && g.assigneeEkipId) throw new DogrulamaHatasi('Assignee tek kişi veya tek Ekip olmalı');
  if (g.assigneeEkipId) {
    const e = await tx.ekip.findFirst({ where: { id: g.assigneeEkipId, arsivlendi: null } });
    if (!e) throw new DogrulamaHatasi('Ekip bulunamadı');
    return { hedef: { ekipId: e.id }, ekipId: e.id };
  }
  const kid = g.assigneeKullaniciId || requesterId;
  const k = await tx.kullanici.findFirst({ where: { id: kid, arsivlendi: null } });
  if (!k) throw new DogrulamaHatasi('Assignee bulunamadı');
  const ekipler = await uyeOlduguEkipler(tx, kid, t);
  return { hedef: { kullaniciId: kid }, ekipId: ekipler[0] ?? null };
}

export function taskServisi(ctx: ServiceContext) {
  return {
    /** Task açar. Durum: Taslak, direkt kabulde Kabul Edildi, aksi halde Kabul Bekliyor. */
    olustur(actor: Actor, g: TaskGirdisi): Promise<TaskGorunumu> {
      return yaz(ctx, actor, 'task.olustur', async (kimlik, tx) => {
        const baslik = g.baslik?.trim();
        if (!baslik) throw new DogrulamaHatasi('Başlık zorunlu');
        const { hedef, ekipId } = await hedefCoz(tx, kimlik.kullaniciId, g, kimlik.zaman);
        const olustur = (durum: TaskDurum) => tx.task.create({
          data: {
            baslik,
            aciklama: g.aciklama ?? null,
            oncelik: g.oncelik ?? 'ORTA',
            bitisTarihi: g.bitisTarihi ?? null,
            etiketler: g.etiketler ?? [],
            hariciRef: g.hariciRef ?? null,
            requesterId: kimlik.kullaniciId,
            assigneeKullaniciId: 'kullaniciId' in hedef ? hedef.kullaniciId : null,
            assigneeEkipId: 'ekipId' in hedef ? hedef.ekipId : null,
            ekipId,
            durum,
            olusturma: kimlik.zaman,
            guncelleme: kimlik.zaman,
          },
        });
        const task = g.taslak ? await olustur('TASLAK') : await atamaYap(tx, kimlik.kullaniciId, hedef, kimlik.zaman, olustur);
        return { sonuc: task, denetim: atamaDenetimi(task) };
      });
    },

    /** Çağıranın görebildiği Task'lar (yeniden eskiye). */
    listele(actor: Actor, filtre: { durum?: TaskDurum } = {}): Promise<TaskGorunumu[]> {
      return oku(ctx, actor, 'task.listele', async (kimlik, tx) => {
        const gorunur = await taskGorunurluk(tx, kimlik.kullaniciId, kimlik.zaman);
        return tx.task.findMany({ where: { AND: [gorunur, { durum: filtre.durum }] }, orderBy: { olusturma: 'desc' } });
      });
    },

    /** Taslak'ı gönderir: atama kararı (direkt kabul / Kabul Bekliyor) şimdi verilir. Yalnızca Requester. */
    gonder(actor: Actor, id: string): Promise<TaskGorunumu> {
      return yaz(ctx, actor, 'task.gonder', async (kimlik, tx) => {
        const mevcut = await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, id);
        if (mevcut.requesterId !== kimlik.kullaniciId) throw new YetkiHatasi('Taslak yalnızca Requester tarafından gönderilir');
        if (mevcut.durum !== 'TASLAK') throw new DogrulamaHatasi('Task taslak değil');
        const hedef: TaskAtamaHedefi = mevcut.assigneeEkipId
          ? { ekipId: mevcut.assigneeEkipId }
          : { kullaniciId: mevcut.assigneeKullaniciId! };
        const task = await atamaYap(tx, kimlik.kullaniciId, hedef, kimlik.zaman, (durum) =>
          tx.task.update({ where: { id }, data: { durum, guncelleme: kimlik.zaman } }),
        );
        return { sonuc: task, denetim: atamaDenetimi(task) };
      });
    },

    /** Task alanlarını günceller (durum ve Assignee hariç). Task'ı gören herkes güncelleyebilir. */
    guncelle(actor: Actor, id: string, alanlar: TaskAlanlari): Promise<TaskGorunumu> {
      return yaz(ctx, actor, 'task.guncelle', async (kimlik, tx) => {
        await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, id);
        const { baslik, aciklama, oncelik, bitisTarihi, etiketler, hariciRef } = alanlar;
        if (baslik !== undefined && !baslik.trim()) throw new DogrulamaHatasi('Başlık zorunlu');
        const data = { baslik: baslik?.trim(), aciklama, oncelik, bitisTarihi, etiketler, hariciRef };
        const task = await tx.task.update({ where: { id }, data: { ...data, guncelleme: kimlik.zaman } });
        return { sonuc: task, denetim: { varlikTuru: 'Task', varlikId: id, veri: data } };
      });
    },

    /** Kullanıcı rehberi: Assignee seçimi için tüm kullanıcıların adı/Ekibi ve tüm Ekipler. */
    rehber(actor: Actor): Promise<Rehber> {
      return oku(ctx, actor, 'task.rehber', async (kimlik, tx) => {
        const [ks, ekipler, uyelikler] = await Promise.all([
          tx.kullanici.findMany({ where: { arsivlendi: null }, orderBy: { ad: 'asc' } }),
          tx.ekip.findMany({ where: { arsivlendi: null }, orderBy: { kod: 'asc' }, select: { id: true, kod: true, ad: true } }),
          tx.uyelik.findMany({ where: aktif(kimlik.zaman), select: { kullaniciId: true, ekipId: true } }),
        ]);
        const ekipMap = new Map(ekipler.map((e) => [e.id, { id: e.id, kod: e.kod }]));
        return {
          ekipler,
          kullanicilar: ks.map((k) => ({
            id: k.id,
            ad: k.ad,
            unvan: k.unvan,
            ekipler: uyelikler.filter((u) => u.kullaniciId === k.id).flatMap((u) => ekipMap.get(u.ekipId) ?? []),
          })),
        };
      });
    },

    /** Tek Task; görünmüyorsa BULUNAMADI (varlığı sızdırılmaz). */
    getir(actor: Actor, id: string): Promise<TaskGorunumu> {
      return oku(ctx, actor, 'task.getir', (kimlik, tx) => gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, id));
    },
  };
}

async function gorunurTask(tx: Tx, kullaniciId: string, t: Date, id: string): Promise<Task> {
  const task = await tx.task.findFirst({ where: { AND: [{ id }, await taskGorunurluk(tx, kullaniciId, t)] } });
  if (!task) throw new BulunamadiHatasi('Task bulunamadı');
  return task;
}

function atamaDenetimi(task: Task) {
  return {
    varlikTuru: 'Task',
    varlikId: task.id,
    veri: {
      requesterId: task.requesterId,
      assigneeKullaniciId: task.assigneeKullaniciId,
      assigneeEkipId: task.assigneeEkipId,
      durum: task.durum,
    },
  };
}

export type TaskServisi = ReturnType<typeof taskServisi>;
