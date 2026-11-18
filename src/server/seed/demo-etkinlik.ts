// Dev demo verisi (ticket 10): iç etkinlik, duyuru, yetkinlikler, bitiş hatırlatması.
// Yalnızca `npm run dev` çağırır; testler kullanmaz. Servisler üzerinden yazılır.
import { kullanici } from '../core/actor';
import type { Services } from '../services';
import { F } from './fixture';

const gun = (now: Date, n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);

export async function seedEtkinlikDemo(s: Services): Promise<void> {
  const now = s.ctx.now();
  const e = await s.etkinlik.icEtkinlikOlustur(kullanici(F.uhSavunma), {
    baslik: 'Savunma Unit iletişim toplantısı',
    yer: 'Toplantı salonu B',
    baslangic: gun(now, 3),
    ekipIds: [F.ekipWaf, F.ekipSoc, F.ekipPentest],
    davetliIds: [F.thCoklu],
  });
  await s.etkinlik.yanitla(kullanici(F.waf2), e.id, 'KATILIYORUM');
  await s.etkinlik.yanitla(kullanici(F.soc2), e.id, 'KATILMIYORUM');
  await s.etkinlik.icEtkinlikOlustur(kullanici(F.thCti), {
    baslik: 'CTI haftalık değerlendirme',
    baslangic: gun(now, 1),
    ekipIds: [F.ekipCti],
  });

  await s.duyuru.yayinla(kullanici(F.direktor), {
    baslik: 'Yeni güvenlik politikası yayında',
    metin: 'Tüm personelin politika dokümanını bu hafta okuması rica olunur.',
    hedefTuru: 'DIREKTORLUK',
    hedefId: F.direktorluk,
  });
  await s.duyuru.yayinla(kullanici(F.thCoklu), {
    baslik: 'WAF kural seti güncellemesi',
    metin: 'Cuma 22:00-23:00 arası bakım penceresi.',
    hedefTuru: 'EKIP',
    hedefId: F.ekipWaf,
  });

  await s.yetkinlik.ekle(kullanici(F.waf1), { ad: 'OSCP', kurum: 'OffSec', tarih: gun(now, -700), bitisTarihi: gun(now, 20) });
  await s.yetkinlik.ekle(kullanici(F.waf1), { ad: 'Web App Security eğitimi', kurum: 'SANS', tarih: gun(now, -120) });
  await s.yetkinlik.ekle(kullanici(F.soc1), { ad: 'GCIH', kurum: 'GIAC', tarih: gun(now, -300), bitisTarihi: gun(now, 400) });
  await s.yetkinlik.ekle(kullanici(F.cti1), { ad: 'GCTI', kurum: 'GIAC', tarih: gun(now, -500), bitisTarihi: gun(now, 10) });
  await s.yetkinlik.yaklasanBitisleriBildir(now);
}
