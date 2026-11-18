// Kabul modülü (ticket 05): kabul zinciri adımlarının kaydı, accept/refuse, reddedilen Task'ın
// yeniden atanması / iptali ve "kullanıcı U için t anında bekleyen kabul adımları" sorgusu.
// Zincir KURALLARI `yetki/kabul.ts` içindedir (ADR-0001).
import type { KabulAdimi, Task, TaskDurum, TaskOncelik } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { bildirimGonder } from '../bildirim';
import {
  adimOnaylayicilari,
  kabulZinciriPlani,
  kullaniciEkibi,
  oku,
  sorumluEkip,
  taskGorunurluk,
  uyeOlduguEkipler,
  yaz,
  type TaskAtamaHedefi,
  type ZincirPlani,
} from '../yetki';

export type { ZincirPlani };

export interface KabulAdimGorunumu extends KabulAdimi {
  /** Adımın şu anki onaylayıcıları (bekleyen SORUMLU adımda karar anında çözülür). */
  onaylayicilar: string[];
}

export interface BekleyenKabul {
  adimId: string;
  sira: number;
  tur: KabulAdimi['tur'];
  /** Bu adım ne zamandan beri karar bekliyor (kabul bekleme süresi başlangıcı). */
  baslangic: Date;
  task: Task;
}

/** Atama sonrası durumu ve zinciri hesaplar (Task oluşturulmadan önce çağrılır). */
export async function atamaPlani(tx: Tx, requesterId: string, hedef: TaskAtamaHedefi, t: Date): Promise<ZincirPlani & { durum: TaskDurum }> {
  const plan = await kabulZinciriPlani(tx, requesterId, hedef, t);
  return { ...plan, durum: plan.direkt ? 'KABUL_EDILDI' : 'KABUL_BEKLIYOR' };
}

/**
 * Planı Task için kaydeder (yeni bir `deneme`) ve bildirimleri gönderir. Çağıranın `yaz` tx'i içinde.
 * Direkt kabulde tek bir OTOMATIK (DIREKT) adım yazılır: çifte rol (REQUESTER_VE_ONAYLAYICI) tarihçede görünür.
 */
export async function zincirBaslat(tx: Tx, task: Task, plan: ZincirPlani, t: Date): Promise<void> {
  const son = await tx.kabulAdimi.findFirst({ where: { taskId: task.id }, orderBy: { deneme: 'desc' } });
  const deneme = (son?.deneme ?? 0) + 1;
  const ortak = { taskId: task.id, deneme, requesterId: task.requesterId, requesterEkipId: await kullaniciEkibi(tx, task.requesterId, t) };
  const bildirim = { varlikTuru: 'Task', varlikId: task.id, zaman: t, haric: task.requesterId };

  if (plan.direkt) {
    await tx.kabulAdimi.create({
      data: { ...ortak, sira: 0, tur: 'DIREKT', karar: 'OTOMATIK', baslangic: t, kararZamani: t, kararVerenId: task.requesterId, not: plan.neden },
    });
    const alicilar = task.assigneeKullaniciId ? [task.assigneeKullaniciId] : await adimOnaylayicilari(tx, 'SORUMLU', task, t);
    await bildirimGonder(tx, { ...bildirim, kullaniciIds: alicilar, tur: 'TASK_ATAMA', mesaj: `Size yeni Task atandı: ${task.baslik}` });
    return;
  }
  await tx.kabulAdimi.createMany({
    data: plan.adimlar.map((tur, sira) => ({ ...ortak, sira, tur, baslangic: sira === 0 ? t : null })),
  });
  await bildirimGonder(tx, {
    ...bildirim,
    kullaniciIds: await adimOnaylayicilari(tx, plan.adimlar[0], task, t),
    tur: 'KABUL_TALEBI',
    mesaj: `Kabul bekleyen Task: ${task.baslik}`,
  });
  await bildirimGonder(tx, { ...bildirim, kullaniciIds: plan.bilgi, tur: 'TASK_BILGI', mesaj: `Unit'inize Task atandı (bilgi): ${task.baslik}` });
}

/**
 * "Kullanıcı U için t anında bekleyen kabul adımları" (Bekleyen işlerim bunu çağırır).
 * Bekleyen adım: karar BEKLIYOR, sırası gelmiş (baslangic dolu), Task Kabul Bekliyor ve U adımın
 * t anındaki onaylayıcılarından biri. En eski bekleyen önce.
 */
export async function bekleyenKabulAdimlari(tx: Tx, kullaniciId: string, t: Date): Promise<BekleyenKabul[]> {
  const adimlar = await tx.kabulAdimi.findMany({
    where: { karar: 'BEKLIYOR', baslangic: { not: null, lte: t } },
    orderBy: { baslangic: 'asc' },
  });
  if (!adimlar.length) return [];
  const tasklar = await tx.task.findMany({ where: { id: { in: adimlar.map((a) => a.taskId) }, durum: 'KABUL_BEKLIYOR' } });
  const taskMap = new Map(tasklar.map((x) => [x.id, x]));
  const out: BekleyenKabul[] = [];
  for (const a of adimlar) {
    const task = taskMap.get(a.taskId);
    if (!task || !(await adimOnaylayicilari(tx, a.tur, task, t)).includes(kullaniciId)) continue;
    out.push({ adimId: a.id, sira: a.sira, tur: a.tur, baslangic: a.baslangic!, task });
  }
  return out;
}

async function gorunurTask(tx: Tx, kullaniciId: string, t: Date, id: string): Promise<Task> {
  const task = await tx.task.findFirst({ where: { AND: [{ id }, await taskGorunurluk(tx, kullaniciId, t)] } });
  if (!task) throw new BulunamadiHatasi('Task bulunamadı');
  return task;
}

/** Task'ın şu an karar bekleyen adımı ve çağıranın onaylayıcı olduğunu doğrular. */
async function aktifAdim(tx: Tx, kullaniciId: string, t: Date, taskId: string) {
  const task = await tx.task.findUnique({ where: { id: taskId } });
  if (!task) throw new BulunamadiHatasi('Task bulunamadı');
  if (task.durum !== 'KABUL_BEKLIYOR') throw new DogrulamaHatasi('Task kabul beklemiyor');
  const adim = await tx.kabulAdimi.findFirst({
    where: { taskId, karar: 'BEKLIYOR', baslangic: { not: null } },
    orderBy: [{ deneme: 'desc' }, { sira: 'asc' }],
  });
  if (!adim) throw new DogrulamaHatasi('Bekleyen kabul adımı yok');
  if (!(await adimOnaylayicilari(tx, adim.tur, task, t)).includes(kullaniciId))
    throw new YetkiHatasi('Bu kabul adımının onaylayıcısı değilsiniz');
  return { task, adim };
}

/** Kararı verenin Ekibi: ASSIGNEE adımında Assignee'nin Ekibi, SORUMLU adımda yönetilen Ekip. */
async function kararVerenEkibi(tx: Tx, adim: KabulAdimi, task: Task, kullaniciId: string, t: Date) {
  return adim.tur === 'SORUMLU' ? sorumluEkip(tx, task, t) : (task.ekipId ?? kullaniciEkibi(tx, kullaniciId, t));
}

export interface YenidenAtaGirdisi {
  assigneeKullaniciId?: string | null;
  assigneeEkipId?: string | null;
  baslik?: string;
  aciklama?: string | null;
  oncelik?: TaskOncelik;
  bitisTarihi?: Date | null;
}

export function kabulServisi(ctx: ServiceContext) {
  return {
    /** Çağıranın üzerinde bekleyen kabul adımları. */
    bekleyenler(actor: Actor): Promise<BekleyenKabul[]> {
      return oku(ctx, actor, 'kabul.bekleyenler', (kimlik, tx) => bekleyenKabulAdimlari(tx, kimlik.kullaniciId, kimlik.zaman));
    },

    /** Task'ın kabul tarihçesi (tüm denemeler, sıralı) ve bekleyen adımların şu anki onaylayıcıları. */
    zincir(actor: Actor, taskId: string): Promise<{ adimlar: KabulAdimGorunumu[] }> {
      return oku(ctx, actor, 'kabul.zincir', async (kimlik, tx) => {
        const task = await gorunurTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const rows = await tx.kabulAdimi.findMany({ where: { taskId }, orderBy: [{ deneme: 'asc' }, { sira: 'asc' }] });
        const adimlar: KabulAdimGorunumu[] = [];
        for (const a of rows) {
          const onaylayicilar =
            a.karar === 'BEKLIYOR' ? await adimOnaylayicilari(tx, a.tur, task, kimlik.zaman) : a.kararVerenId ? [a.kararVerenId] : [];
          adimlar.push({ ...a, onaylayicilar });
        }
        return { adimlar };
      });
    },

    /** Aktif adımı kabul eder; son adımsa Task Kabul Edildi olur, değilse sıradaki adım başlar. */
    kabulEt(actor: Actor, taskId: string): Promise<Task> {
      return yaz(ctx, actor, 'kabul.kabulEt', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const { task, adim } = await aktifAdim(tx, kimlik.kullaniciId, t, taskId);
        await tx.kabulAdimi.update({
          where: { id: adim.id },
          data: { karar: 'KABUL', kararZamani: t, kararVerenId: kimlik.kullaniciId, kararVerenEkipId: await kararVerenEkibi(tx, adim, task, kimlik.kullaniciId, t) },
        });
        const sonraki = await tx.kabulAdimi.findFirst({ where: { taskId, deneme: adim.deneme, sira: adim.sira + 1 } });
        let guncel = task;
        const bildirim = { varlikTuru: 'Task', varlikId: taskId, zaman: t, haric: kimlik.kullaniciId };
        if (sonraki) {
          await tx.kabulAdimi.update({ where: { id: sonraki.id }, data: { baslangic: t } });
          await bildirimGonder(tx, {
            ...bildirim,
            kullaniciIds: await adimOnaylayicilari(tx, sonraki.tur, task, t),
            tur: 'KABUL_TALEBI',
            mesaj: `Kabul bekleyen Task: ${task.baslik}`,
          });
        } else {
          guncel = await tx.task.update({ where: { id: taskId }, data: { durum: 'KABUL_EDILDI', guncelleme: t } });
        }
        await bildirimGonder(tx, { ...bildirim, kullaniciIds: [task.requesterId], tur: 'TASK_KABUL', mesaj: `${kimlik.ad} Task'ı kabul etti: ${task.baslik}` });
        return {
          sonuc: guncel,
          denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { adimId: adim.id, deneme: adim.deneme, sira: adim.sira, tur: adim.tur, karar: 'KABUL', durum: guncel.durum } },
        };
      });
    },

    /** Aktif adımı reddeder (gerekçe zorunlu). Task Reddedildi olur; zincir baştan başlamaz, Task silinmez. */
    reddet(actor: Actor, taskId: string, gerekce: string): Promise<Task> {
      return yaz(ctx, actor, 'kabul.reddet', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const g = gerekce?.trim();
        if (!g) throw new DogrulamaHatasi('Ret gerekçesi zorunlu');
        const { task, adim } = await aktifAdim(tx, kimlik.kullaniciId, t, taskId);
        await tx.kabulAdimi.update({
          where: { id: adim.id },
          data: { karar: 'RET', gerekce: g, kararZamani: t, kararVerenId: kimlik.kullaniciId, kararVerenEkipId: await kararVerenEkibi(tx, adim, task, kimlik.kullaniciId, t) },
        });
        const guncel = await tx.task.update({ where: { id: taskId }, data: { durum: 'REDDEDILDI', guncelleme: t } });
        await bildirimGonder(tx, {
          kullaniciIds: [task.requesterId],
          tur: 'TASK_RET',
          mesaj: `${kimlik.ad} Task'ı reddetti: ${task.baslik} (${g})`,
          varlikTuru: 'Task',
          varlikId: taskId,
          zaman: t,
          haric: kimlik.kullaniciId,
        });
        return {
          sonuc: guncel,
          denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { adimId: adim.id, deneme: adim.deneme, sira: adim.sira, tur: adim.tur, karar: 'RET', gerekce: g, durum: 'REDDEDILDI' } },
        };
      });
    },

    /**
     * Reddedilen Task'ı yeniden atar (Assignee verilmezse aynı Assignee'ye yeniden gönderir), isteğe bağlı
     * alanları düzenler ve yeni bir kabul denemesi başlatır. Yalnızca Requester.
     */
    yenidenAta(actor: Actor, taskId: string, g: YenidenAtaGirdisi): Promise<Task> {
      return yaz(ctx, actor, 'kabul.yenidenAta', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const mevcut = await reddedilmisTask(tx, kimlik.kullaniciId, t, taskId);
        if (g.assigneeKullaniciId && g.assigneeEkipId) throw new DogrulamaHatasi('Assignee tek kişi veya tek Ekip olmalı');
        let hedef: TaskAtamaHedefi;
        let ekipId: string | null;
        if (g.assigneeEkipId) {
          const e = await tx.ekip.findFirst({ where: { id: g.assigneeEkipId, arsivlendi: null } });
          if (!e) throw new DogrulamaHatasi('Ekip bulunamadı');
          hedef = { ekipId: e.id };
          ekipId = e.id;
        } else if (g.assigneeKullaniciId) {
          const k = await tx.kullanici.findFirst({ where: { id: g.assigneeKullaniciId, arsivlendi: null } });
          if (!k) throw new DogrulamaHatasi('Assignee bulunamadı');
          hedef = { kullaniciId: k.id };
          ekipId = (await uyeOlduguEkipler(tx, k.id, t))[0] ?? null;
        } else {
          hedef = mevcut.assigneeEkipId ? { ekipId: mevcut.assigneeEkipId } : { kullaniciId: mevcut.assigneeKullaniciId! };
          ekipId = mevcut.ekipId;
        }
        if (g.baslik !== undefined && !g.baslik.trim()) throw new DogrulamaHatasi('Başlık zorunlu');
        const plan = await atamaPlani(tx, kimlik.kullaniciId, hedef, t);
        const task = await tx.task.update({
          where: { id: taskId },
          data: {
            baslik: g.baslik?.trim(),
            aciklama: g.aciklama,
            oncelik: g.oncelik,
            bitisTarihi: g.bitisTarihi,
            assigneeKullaniciId: 'kullaniciId' in hedef ? hedef.kullaniciId : null,
            assigneeEkipId: 'ekipId' in hedef ? hedef.ekipId : null,
            ekipId,
            durum: plan.durum,
            guncelleme: t,
          },
        });
        await zincirBaslat(tx, task, plan, t);
        return {
          sonuc: task,
          denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { assigneeKullaniciId: task.assigneeKullaniciId, assigneeEkipId: task.assigneeEkipId, durum: task.durum } },
        };
      });
    },

    /** Reddedilen Task'ı iptal eder. Yalnızca Requester. */
    iptalEt(actor: Actor, taskId: string): Promise<Task> {
      return yaz(ctx, actor, 'kabul.iptalEt', async (kimlik, tx) => {
        await reddedilmisTask(tx, kimlik.kullaniciId, kimlik.zaman, taskId);
        const task = await tx.task.update({ where: { id: taskId }, data: { durum: 'IPTAL', guncelleme: kimlik.zaman } });
        return { sonuc: task, denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { durum: 'IPTAL' } } };
      });
    },
  };
}

async function reddedilmisTask(tx: Tx, kullaniciId: string, t: Date, taskId: string): Promise<Task> {
  const task = await gorunurTask(tx, kullaniciId, t, taskId);
  if (task.requesterId !== kullaniciId) throw new YetkiHatasi('Yalnızca Requester yeniden atar veya iptal eder');
  if (task.durum !== 'REDDEDILDI') throw new DogrulamaHatasi('Task reddedilmiş değil');
  return task;
}

export type KabulServisi = ReturnType<typeof kabulServisi>;
