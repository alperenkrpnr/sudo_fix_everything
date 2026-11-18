// Task detayı demo verisi (ticket 07; yalnızca `npm run dev`). seedTaskDemo'dan sonra, servisler üzerinden çalışır
// (denetim izi de oluşur). Ek dosyası `ctx.config.ekDizini` altına yazılır.
import { kullanici } from '../core/actor';
import type { Services } from '../services';
import { F } from './fixture';

export async function seedTaskDetayDemo(services: Services): Promise<void> {
  const d = services.taskDetay;
  const waf1 = kullanici(F.waf1);
  const th = kullanici(F.thCoklu);
  const owasp = (await services.task.listele(th)).find((x) => x.baslik.startsWith('OWASP CRS 4'));
  if (owasp) {
    const adimlar = ['Mevcut istisnaları çıkar', 'Paranoia level 2 ile test ortamı', 'Canlıya kademeli geçiş'];
    const alt = [];
    for (const baslik of adimlar) alt.push(await d.altTaskEkle(waf1, owasp.id, { baslik }));
    await d.altTaskTamamla(waf1, alt[0].id, true);
    await d.altTaskTamamla(waf1, alt[1].id, true);
    await d.yorumEkle(waf1, owasp.id, { metin: 'Test ortamında 3 false positive çıktı, istisna listesine ekledim.' });
    await d.yorumEkle(th, owasp.id, { metin: 'Canlı geçişi Cuma akşamı bakım penceresinde yapalım.' });
    await d.ekYukle(waf1, owasp.id, { dosyaAdi: 'crs4-istisnalar.txt', icerik: Buffer.from('REQUEST-942-APPLICATION-ATTACK-SQLI: /api/search\n') });
    await d.etiketRefGuncelle(waf1, owasp.id, { etiketler: ['waf', 'crs4'], hariciRef: 'https://jira.example.local/browse/SEC-1042' });
  }
  // Backlog: tarihsiz açık Task.
  const backlog = await services.task.olustur(kullanici(F.waf2), { baslik: 'WAF kural envanteri temizliği', oncelik: 'DUSUK' });
  await d.etiketRefGuncelle(kullanici(F.waf2), backlog.id, { etiketler: ['waf', 'teknik-borc'], hariciRef: 'SEC-977' });
  await d.altTaskEkle(kullanici(F.waf2), backlog.id, { baslik: 'Kullanılmayan kuralları listele' });
}
