// Kabul zinciri demo verisi (yalnızca `npm run dev`). seedTaskDemo'dan sonra, createServices ile çağrılır.
// 1) seedTaskDemo'nun doğrudan yazdığı Kabul Bekliyor Task'lara zincir adımlarını ekler.
// 2) Servisler üzerinden gerçekçi zincirler üretir: bekleyen, yarı kabul edilmiş ve reddedilmiş Task'lar.
import { kullanici } from '../core/actor';
import { atamaPlani, zincirBaslat } from '../modules/kabul';
import type { Services } from '../services';
import { F } from './fixture';

export async function seedKabulDemo(services: Services): Promise<void> {
  const db = services.ctx.db;
  const now = services.ctx.now();
  const zincirsiz = await db.task.findMany({ where: { durum: 'KABUL_BEKLIYOR' } });
  for (const task of zincirsiz) {
    if (await db.kabulAdimi.count({ where: { taskId: task.id } })) continue;
    const hedef = task.assigneeEkipId ? { ekipId: task.assigneeEkipId } : { kullaniciId: task.assigneeKullaniciId! };
    await zincirBaslat(db, task, await atamaPlani(db, task.requesterId, hedef, now), task.olusturma);
  }

  const { task: ts, kabul } = services;
  await ts.olustur(kullanici(F.waf1), { baslik: 'Şüpheli domain listesi doğrulama', assigneeKullaniciId: F.cti2, oncelik: 'YUKSEK' });

  const yarim = await ts.olustur(kullanici(F.soc1), { baslik: 'OSINT: sızdırılmış kimlik bilgisi taraması', assigneeKullaniciId: F.osint1 });
  await kabul.kabulEt(kullanici(F.osint1), yarim.id);

  const ret1 = await ts.olustur(kullanici(F.waf2), { baslik: 'APT raporu çevirisi', assigneeKullaniciId: F.cti1 });
  await kabul.reddet(kullanici(F.cti1), ret1.id, 'Kapsam CTI dışında, çeviri ekibine yönlendirin');

  const ret2 = await ts.olustur(kullanici(F.thCti), { baslik: 'WAF imzası: yeni C2 altyapısı', assigneeKullaniciId: F.waf1 });
  await kabul.kabulEt(kullanici(F.waf1), ret2.id);
  await kabul.reddet(kullanici(F.thCoklu), ret2.id, 'Ekip kapasitesi bu sprint dolu');
}
