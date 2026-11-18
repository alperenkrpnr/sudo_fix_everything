// Vekalet ve eskalasyon demo verisi (yalnızca `npm run dev`). seedKabulDemo'dan sonra çağrılır.
// - thCoklu bu hafta için waf1'i Vekil atar; TEAM-SOC'a gelen talep waf1'in "Vekil işleri" grubunda görünür.
// - TEAM-CTI'a 5 iş günü önce gelmiş talep eskale edilir (uhIstihbarat "Eskale edilenler" grubunda görür).
// - Son olarak `eskalasyonlariIsle()` çalışır (dev başlangıcında süresi dolan tüm adımlar eskale edilir).
import { kullanici } from '../core/actor';
import { isGunuEkle } from '../modules/eskalasyon';
import type { Services } from '../services';
import { F } from './fixture';

const GUN_MS = 24 * 3600 * 1000;

export async function seedVekaletDemo(services: Services): Promise<void> {
  const db = services.ctx.db;
  const now = services.ctx.now();
  await services.vekalet.ata(kullanici(F.thCoklu), {
    vekilId: F.waf1,
    baslangic: new Date(now.getTime() - GUN_MS),
    bitis: new Date(now.getTime() + 7 * GUN_MS),
  });
  await services.task.olustur(kullanici(F.cti1), { baslik: 'SOC: phishing kampanyası IOC taraması', assigneeEkipId: F.ekipSoc, oncelik: 'YUKSEK' });

  const eski = await services.task.olustur(kullanici(F.waf2), { baslik: 'CTI: yeni fidye yazılımı grubu profili', assigneeEkipId: F.ekipCti });
  // Bekleme 5 iş günü önce başlamış gibi (yalnızca demo): adımın başlangıcını geri al.
  let gecmis = now;
  while (isGunuEkle(gecmis, 5) > now) gecmis = new Date(gecmis.getTime() - GUN_MS);
  await db.kabulAdimi.updateMany({ where: { taskId: eski.id, karar: 'BEKLIYOR' }, data: { baslangic: gecmis } });
  await db.task.update({ where: { id: eski.id }, data: { olusturma: gecmis } });

  await services.eskalasyon.eskalasyonlariIsle();
}
