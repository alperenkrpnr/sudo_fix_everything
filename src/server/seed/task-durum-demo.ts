// Demo durum tarihçesi (ticket 04; yalnızca `npm run dev`): seedTaskDemo'daki ilerlemiş Task'lara
// geçmiş geçişler yazar ki blok süresi / çözüm süresi raporlarında veri olsun.
import type { TaskDurum } from '@prisma/client';
import type { Db } from '../db/client';

export async function seedTaskDurumDemo(db: Db, now: Date = new Date()): Promise<void> {
  const saat = (n: number) => new Date(now.getTime() + n * 3_600_000);
  const tasklar = await db.task.findMany({ where: { durum: { in: ['DEVAM_EDIYOR', 'BLOKLU', 'TAMAMLANDI'] } } });
  const satirlar: Array<{ taskId: string; eski: TaskDurum; yeni: TaskDurum; zaman: Date; kullaniciId: string; neden?: string }> = [];
  for (const t of tasklar) {
    const kim = t.assigneeKullaniciId ?? t.requesterId;
    const g = (eski: TaskDurum, yeni: TaskDurum, h: number, neden?: string) =>
      satirlar.push({ taskId: t.id, eski, yeni, zaman: saat(h), kullaniciId: kim, neden });
    g('KABUL_EDILDI', 'DEVAM_EDIYOR', -60);
    if (t.durum === 'BLOKLU') g('DEVAM_EDIYOR', 'BLOKLU', -26, 'SIEM log kaynağı erişimi bekleniyor');
    if (t.durum === 'TAMAMLANDI') {
      g('DEVAM_EDIYOR', 'BLOKLU', -50, 'Müşteri test penceresi onayı bekleniyor');
      g('BLOKLU', 'DEVAM_EDIYOR', -40);
      g('DEVAM_EDIYOR', 'TAMAMLANDI', -24);
    }
  }
  await db.taskDurumGecisi.createMany({ data: satirlar });
}
