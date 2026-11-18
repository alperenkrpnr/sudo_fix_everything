// Delegasyon ve Ekip havuzu (ticket 06). Ekip'e atanan Task Sorumlu yöneticinin gelen kutusuna düşer;
// kabul edildikten sonra Ekip havuzundadır (assigneeEkipId dolu). Sorumlu yönetici Ekip içinden bir
// Çalışan'a delege eder; Çalışan kabul edince Assignee o olur, reddederse Task havuza döner (Reddedildi olmaz).
// Kurallar `yetki/delegasyon.ts` içindedir. `kabulServisi`ne yayılır (services.kabul.*).
import type { Delegasyon, Task } from '@prisma/client';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { bildirimGonder } from '../bildirim';
import { delegeAdayiMi, delegeEdebilir, oku, sorumluOlduguEkipler, sorumluYonetici, taskGorunurluk, yaz, yetkiGerekli } from '../yetki';
import { bekleyenKabulAdimlari } from './index';

/** Ekip havuzunda sayılan durumlar (kabul edilmiş, kapanmamış). */
const HAVUZ_DURUMLARI = ['KABUL_EDILDI', 'DEVAM_EDIYOR', 'BLOKLU'] as const;

export type GelenKutusuTuru = 'KABUL' | 'HAVUZ' | 'DELEGASYON_BEKLIYOR';

export interface GelenKutusuKaydi {
  /** KABUL: Ekip ataması kabul bekliyor; HAVUZ: delege edilmeyi bekliyor; DELEGASYON_BEKLIYOR: Çalışan yanıtı bekleniyor. */
  tur: GelenKutusuTuru;
  ekipId: string;
  ekipKod: string;
  ekipAd: string;
  task: Task;
  beklemeBaslangici: Date;
  /** DELEGASYON_BEKLIYOR için bekleyen delegasyon. */
  delegasyon: Delegasyon | null;
}

export interface EkipGelenKutusu {
  /** Filtre için: çağıranın Sorumlu yöneticisi olduğu Ekipler. */
  ekipler: { id: string; kod: string; ad: string }[];
  kayitlar: GelenKutusuKaydi[];
}

export function delegasyonIslemleri(ctx: ServiceContext) {
  return {
    /**
     * Çok Ekipli yöneticinin birleşik gelen kutusu: Sorumlu yöneticisi olduğu tüm Ekiplere gelen kabul
     * talepleri ve Ekip havuzu, Ekip etiketiyle. `ekipId` filtresi çağıranın Ekiplerinden biri olmalı.
     */
    ekipGelenKutusu(actor: Actor, filtre: { ekipId?: string } = {}): Promise<EkipGelenKutusu> {
      return oku(ctx, actor, 'kabul.ekipGelenKutusu', (kimlik, tx) => ekipGelenKutusuHesapla(tx, kimlik.kullaniciId, kimlik.zaman, filtre.ekipId));
    },

    /** Çağırana delege edilmiş, yanıt bekleyen Task'lar. */
    bekleyenDelegasyonlar(actor: Actor): Promise<BekleyenDelegasyon[]> {
      return oku(ctx, actor, 'kabul.bekleyenDelegasyonlar', (kimlik, tx) => bekleyenDelegasyonlariGetir(tx, kimlik.kullaniciId));
    },

    /**
     * Ekip havuzundaki Task'ı Ekip içinden bir Çalışan'a delege eder. Bekleyen bir delegasyon varsa geri alınır.
     * Sorumlu yönetici veya Üst yöneticileri.
     */
    delegeEt(actor: Actor, taskId: string, calisanId: string): Promise<Delegasyon> {
      return yaz(ctx, actor, 'kabul.delegeEt', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const task = await tx.task.findFirst({ where: { AND: [{ id: taskId }, await taskGorunurluk(tx, kimlik.kullaniciId, t)] } });
        if (!task) throw new BulunamadiHatasi('Task bulunamadı');
        if (!task.assigneeEkipId) throw new DogrulamaHatasi('Task bir Ekip\'e atanmamış');
        const ekipId = task.assigneeEkipId;
        yetkiGerekli(await delegeEdebilir(tx, kimlik.kullaniciId, ekipId, t), 'Bu Ekip\'in Task\'larını delege edemezsiniz');
        if (!havuzda(task)) throw new DogrulamaHatasi('Task Ekip havuzunda değil (önce kabul edilmeli)');
        if (!(await delegeAdayiMi(tx, calisanId, ekipId, t))) throw new DogrulamaHatasi('Yalnızca Ekip içinden bir Çalışan\'a delege edilebilir');

        const geriAlinan = await tx.delegasyon.updateMany({ where: { taskId, durum: 'BEKLIYOR' }, data: { durum: 'GERI_ALINDI', kararZamani: t } });
        const d = await tx.delegasyon.create({ data: { taskId, ekipId, calisanId, delegeEdenId: kimlik.kullaniciId, baslangic: t } });
        await bildirimGonder(tx, {
          kullaniciIds: [calisanId],
          tur: 'TASK_DELEGASYON',
          mesaj: `${kimlik.ad} size Task delege etti: ${task.baslik}`,
          varlikTuru: 'Task',
          varlikId: taskId,
          zaman: t,
          haric: kimlik.kullaniciId,
        });
        return {
          sonuc: d,
          denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { delegasyonId: d.id, ekipId, calisanId, geriAlinan: geriAlinan.count } },
        };
      });
    },

    /** Delege edilen Çalışan kabul eder: Assignee o Çalışan olur (Task'ın Ekibi değişmez). */
    delegasyonKabulEt(actor: Actor, taskId: string): Promise<Task> {
      return yaz(ctx, actor, 'kabul.delegasyonKabulEt', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const { d, task } = await bekleyenDelegasyonum(tx, kimlik.kullaniciId, taskId);
        await tx.delegasyon.update({ where: { id: d.id }, data: { durum: 'KABUL', kararZamani: t } });
        const guncel = await tx.task.update({
          where: { id: taskId },
          data: { assigneeKullaniciId: kimlik.kullaniciId, assigneeEkipId: null, ekipId: d.ekipId, guncelleme: t },
        });
        await bildirimGonder(tx, {
          kullaniciIds: [d.delegeEdenId, task.requesterId],
          tur: 'TASK_DELEGASYON_KABUL',
          mesaj: `${kimlik.ad} delege edilen Task'ı kabul etti: ${task.baslik}`,
          varlikTuru: 'Task',
          varlikId: taskId,
          zaman: t,
          haric: kimlik.kullaniciId,
        });
        return {
          sonuc: guncel,
          denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { delegasyonId: d.id, ekipId: d.ekipId, karar: 'KABUL', assigneeKullaniciId: kimlik.kullaniciId } },
        };
      });
    },

    /**
     * Delege edilen Çalışan reddeder (gerekçe zorunlu). Task Reddedildi olmaz: Ekip havuzunda kalır ve
     * Sorumlu yönetici(ler) ile delege eden bilgilendirilir.
     */
    delegasyonReddet(actor: Actor, taskId: string, gerekce: string): Promise<Task> {
      return yaz(ctx, actor, 'kabul.delegasyonReddet', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const g = gerekce?.trim();
        if (!g) throw new DogrulamaHatasi('Ret gerekçesi zorunlu');
        const { d, task } = await bekleyenDelegasyonum(tx, kimlik.kullaniciId, taskId);
        await tx.delegasyon.update({ where: { id: d.id }, data: { durum: 'RET', kararZamani: t, gerekce: g } });
        await bildirimGonder(tx, {
          kullaniciIds: [d.delegeEdenId, ...(await sorumluYonetici(tx, d.ekipId, t))],
          tur: 'TASK_HAVUZA_DONUS',
          mesaj: `${kimlik.ad} delege edilen Task'ı reddetti, Task Ekip havuzuna döndü: ${task.baslik} (${g})`,
          varlikTuru: 'Task',
          varlikId: taskId,
          zaman: t,
          haric: kimlik.kullaniciId,
        });
        return {
          sonuc: task,
          denetim: { varlikTuru: 'Task', varlikId: taskId, veri: { delegasyonId: d.id, ekipId: d.ekipId, calisanId: d.calisanId, karar: 'RET', gerekce: g, havuzaDondu: true } },
        };
      });
    },
  };
}

/**
 * Kullanıcının t anında Sorumlu yöneticisi olduğu Ekiplerin gelen kutusu (Bekleyen işlerim de bunu kullanır).
 * `ekipId` verilirse yalnızca o Ekip; çağıranın Ekiplerinden biri değilse YetkiHatasi.
 */
export async function ekipGelenKutusuHesapla(tx: Tx, kullaniciId: string, t: Date, ekipId?: string): Promise<EkipGelenKutusu> {
  const tumEkipIds = await sorumluOlduguEkipler(tx, kullaniciId, t);
  if (ekipId && !tumEkipIds.includes(ekipId)) throw new YetkiHatasi("Bu Ekip'in Sorumlu yöneticisi değilsiniz");
  const ekipIds = ekipId ? [ekipId] : tumEkipIds;
  if (!tumEkipIds.length) return { ekipler: [], kayitlar: [] };
  const ekipler = await tx.ekip.findMany({ where: { id: { in: tumEkipIds } }, select: { id: true, kod: true, ad: true }, orderBy: { kod: 'asc' } });
  const ekipMap = new Map(ekipler.map((e) => [e.id, e]));
  const kayit = (tur: GelenKutusuTuru, task: Task, beklemeBaslangici: Date, delegasyon: Delegasyon | null = null): GelenKutusuKaydi => {
    const e = ekipMap.get(task.assigneeEkipId!)!;
    return { tur, ekipId: e.id, ekipKod: e.kod, ekipAd: e.ad, task, beklemeBaslangici, delegasyon };
  };

  const kabuller = (await bekleyenKabulAdimlari(tx, kullaniciId, t))
    .filter((a) => a.task.assigneeEkipId && ekipIds.includes(a.task.assigneeEkipId))
    .map((a) => kayit('KABUL', a.task, a.baslangic));

  const havuz = await havuzTasklari(tx, ekipIds);
  const bekleyenDel = await tx.delegasyon.findMany({ where: { taskId: { in: havuz.map((x) => x.id) }, durum: 'BEKLIYOR' } });
  const delMap = new Map(bekleyenDel.map((d) => [d.taskId, d]));
  const sonOlaylar = await havuzaGirisZamanlari(tx, havuz.map((x) => x.id));
  const havuzKayitlari = havuz.map((task) => {
    const d = delMap.get(task.id);
    return d ? kayit('DELEGASYON_BEKLIYOR', task, d.baslangic, d) : kayit('HAVUZ', task, sonOlaylar.get(task.id) ?? task.olusturma);
  });
  const kayitlar = [...kabuller, ...havuzKayitlari].sort((a, b) => a.beklemeBaslangici.getTime() - b.beklemeBaslangici.getTime());
  return { ekipler, kayitlar };
}

export interface BekleyenDelegasyon {
  delegasyonId: string;
  ekipId: string;
  delegeEdenId: string;
  baslangic: Date;
  task: Task;
}

/** Kullanıcıya delege edilmiş, yanıt bekleyen ve hâlâ Ekip havuzunda olan Task'lar (eski önce). */
export async function bekleyenDelegasyonlariGetir(tx: Tx, kullaniciId: string): Promise<BekleyenDelegasyon[]> {
  const dels = await tx.delegasyon.findMany({ where: { calisanId: kullaniciId, durum: 'BEKLIYOR' }, orderBy: { baslangic: 'asc' } });
  if (!dels.length) return [];
  const tasklar = new Map((await tx.task.findMany({ where: { id: { in: dels.map((d) => d.taskId) } } })).map((x) => [x.id, x]));
  return dels.flatMap((d) => {
    const task = tasklar.get(d.taskId);
    return task && havuzda(task) && task.assigneeEkipId === d.ekipId
      ? [{ delegasyonId: d.id, ekipId: d.ekipId, delegeEdenId: d.delegeEdenId, baslangic: d.baslangic, task }]
      : [];
  });
}

function havuzda(task: Task): boolean {
  return !!task.assigneeEkipId && (HAVUZ_DURUMLARI as readonly string[]).includes(task.durum);
}

async function bekleyenDelegasyonum(tx: Tx, kullaniciId: string, taskId: string) {
  const task = await tx.task.findUnique({ where: { id: taskId } });
  const d = await tx.delegasyon.findFirst({ where: { taskId, durum: 'BEKLIYOR' } });
  if (!task || !d) throw new BulunamadiHatasi('Bekleyen delegasyon bulunamadı');
  if (d.calisanId !== kullaniciId) throw new YetkiHatasi('Bu Task size delege edilmedi');
  if (!havuzda(task) || task.assigneeEkipId !== d.ekipId) throw new DogrulamaHatasi('Task artık Ekip havuzunda değil');
  return { d, task };
}

function havuzTasklari(tx: Tx, ekipIds: string[]): Promise<Task[]> {
  if (!ekipIds.length) return Promise.resolve([]);
  return tx.task.findMany({ where: { assigneeEkipId: { in: ekipIds }, durum: { in: [...HAVUZ_DURUMLARI] } } });
}

/** Task'ın havuza son girdiği an: son kabul kararı veya son reddedilen/geri alınan delegasyon. */
async function havuzaGirisZamanlari(tx: Tx, taskIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!taskIds.length) return out;
  const [adimlar, dels] = await Promise.all([
    tx.kabulAdimi.findMany({ where: { taskId: { in: taskIds }, kararZamani: { not: null } }, select: { taskId: true, kararZamani: true } }),
    tx.delegasyon.findMany({ where: { taskId: { in: taskIds }, kararZamani: { not: null } }, select: { taskId: true, kararZamani: true } }),
  ]);
  for (const x of [...adimlar, ...dels]) {
    const onceki = out.get(x.taskId);
    if (!onceki || x.kararZamani! > onceki) out.set(x.taskId, x.kararZamani!);
  }
  return out;
}
