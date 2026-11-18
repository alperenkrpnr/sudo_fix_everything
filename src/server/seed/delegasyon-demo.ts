// Delegasyon demo verisi (yalnızca `npm run dev`, seedKabulDemo'dan sonra). Servisler üzerinden:
// çok Ekipli Team Head (thCoklu) gelen kutusunda WAF ve SOC kayıtları, bekleyen / reddedilen / kabul edilen delegasyonlar.
import { kullanici } from '../core/actor';
import type { Services } from '../services';
import { F } from './fixture';

export async function seedDelegasyonDemo(services: Services): Promise<void> {
  const { task: ts, kabul } = services;
  const ata = (kim: string, baslik: string, ekipId: string) => ts.olustur(kullanici(kim), { baslik, assigneeEkipId: ekipId });

  // Direktör → Ekip: direkt havuza düşer (thCoklu delege edecek)
  await ata(F.direktor, 'WAF kural seti yıllık gözden geçirme', F.ekipWaf);
  // Başka Unit'ten Ekip'e talep: thCoklu'nun kabulünü bekliyor
  await ata(F.cti2, 'WAF: yeni IOC listesi için engelleme kuralı', F.ekipWaf);

  // Kabul edildi ve soc1'e delege edildi; soc1'in yanıtı bekleniyor
  const soc = await ata(F.cti1, 'SOC: phishing kampanyası log analizi', F.ekipSoc);
  await kabul.kabulEt(kullanici(F.thCoklu), soc.id);
  await kabul.delegeEt(kullanici(F.thCoklu), soc.id, F.soc1);

  // Team Head'siz Ekip: Unit Head delege etti, Çalışan reddetti → havuza döndü
  const pentest = await ata(F.waf2, 'Pentest: yeni WAF önündeki uygulama', F.ekipPentest);
  await kabul.kabulEt(kullanici(F.uhSavunma), pentest.id);
  await kabul.delegeEt(kullanici(F.uhSavunma), pentest.id, F.pentest1);
  await kabul.delegasyonReddet(kullanici(F.pentest1), pentest.id, 'Bu hafta başka bir testteyim');

  // Kabul edilmiş delegasyon: Assignee artık cti2
  const cti = await ata(F.direktor, 'CTI: çeyreklik tehdit raporu', F.ekipCti);
  await kabul.delegeEt(kullanici(F.thCti), cti.id, F.cti2);
  await kabul.delegasyonKabulEt(kullanici(F.cti2), cti.id);
}
