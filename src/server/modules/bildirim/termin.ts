// Termin yaklaşma/geçme bildirimleri (ticket 08). Sistem işlemi (aktör yok): zamanlayıcı yok;
// dev başlangıcı ve REST tetikleyicisi çağırır. Her (Task, tür, termin) için bir kez gönderir.
import type { Task, TaskDurum } from '@prisma/client';
import type { ServiceContext } from '../../core/context';
import type { Tx } from '../../db/client';
import { denetimeEkle } from '../denetim/kaydet';
import { sorumluYonetici } from '../yetki';
import { bildirimGonder } from './index';

const ACIK_DEGIL: TaskDurum[] = ['TASLAK', 'TAMAMLANDI', 'IPTAL', 'REDDEDILDI'];
const GUN_MS = 24 * 3600 * 1000;

/** Alıcılar: Requester + Assignee kişi, ya da Ekip'e atanmışsa Ekip'in Sorumlu yöneticisi. */
async function alicilar(tx: Tx, task: Task, t: Date): Promise<string[]> {
  const ids = [task.requesterId];
  if (task.assigneeKullaniciId) ids.push(task.assigneeKullaniciId);
  if (task.assigneeEkipId) ids.push(...(await sorumluYonetici(tx, task.assigneeEkipId, t)));
  return ids;
}

/** Gönderilen bildirim sayısını (alıcı başına) döndürür. */
export function terminBildirimleriniIsle(ctx: ServiceContext, now: Date = ctx.now()): Promise<number> {
  const sinir = new Date(now.getTime() + ctx.config.terminYaklasmaGun * GUN_MS);
  return ctx.db.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({
      where: { durum: { notIn: ACIK_DEGIL }, bitisTarihi: { not: null, lte: sinir } },
      orderBy: { bitisTarihi: 'asc' },
    });
    let adet = 0;
    const islenen: string[] = [];
    for (const task of tasks) {
      const bitis = task.bitisTarihi!;
      const tur = bitis <= now ? 'TERMIN_GECTI' : 'TERMIN_YAKLASIYOR';
      const anahtar = { taskId: task.id, tur, bitisTarihi: bitis };
      if (await tx.terminBildirimi.findUnique({ where: { taskId_tur_bitisTarihi: anahtar } })) continue;
      await tx.terminBildirimi.create({ data: { ...anahtar, gonderim: now } });
      const gun = bitis.toISOString().slice(0, 10);
      adet += await bildirimGonder(tx, {
        kullaniciIds: await alicilar(tx, task, now),
        tur,
        mesaj: tur === 'TERMIN_GECTI' ? `"${task.baslik}" termini geçti (${gun})` : `"${task.baslik}" termini yaklaşıyor (${gun})`,
        varlikTuru: 'Task',
        varlikId: task.id,
        zaman: now,
      });
      islenen.push(task.id);
    }
    if (islenen.length)
      await denetimeEkle(tx, { islem: 'bildirim.terminBildirimleri', zaman: now, kullaniciId: null, veri: { taskIds: islenen } });
    return adet;
  });
}
