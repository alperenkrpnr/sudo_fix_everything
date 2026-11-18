// Rapor demo Task'ları (yalnızca `npm run dev`): farklı çözüm süreleri ve geciken işler.
// Durum geçmişi (04) gelene kadar çözüm süresi = olusturma → guncelleme.
import type { Db } from '../db/client';
import { F } from './fixture';

export async function seedRaporDemo(db: Db, now: Date = new Date()): Promise<void> {
  const gun = (n: number) => new Date(now.getTime() + n * 86_400_000);
  const t = (baslik: string, k: string, ekipId: string, durum: 'TAMAMLANDI' | 'DEVAM_EDIYOR' | 'IPTAL', acilis: number, kapanis: number, bitis?: number) => ({
    baslik,
    requesterId: F.direktor,
    assigneeKullaniciId: k,
    ekipId,
    durum,
    olusturma: gun(acilis),
    guncelleme: gun(kapanis),
    bitisTarihi: bitis === undefined ? null : gun(bitis),
  });
  await db.task.createMany({
    data: [
      t('ModSecurity kural güncellemesi', F.waf1, F.ekipWaf, 'TAMAMLANDI', -14, -12),
      t('WAF bypass PoC değerlendirmesi', F.waf2, F.ekipWaf, 'TAMAMLANDI', -10, -9.5),
      t('EDR alarm triyajı (gece vardiyası)', F.soc1, F.ekipSoc, 'TAMAMLANDI', -9, -8.75),
      t('SOAR playbook: şüpheli e-posta', F.soc2, F.ekipSoc, 'TAMAMLANDI', -20, -13),
      t('Log kaynağı envanteri', F.soc2, F.ekipSoc, 'DEVAM_EDIYOR', -12, -6, -4),
      t('Web uygulaması pentest (iç portal)', F.pentest1, F.ekipPentest, 'TAMAMLANDI', -25, -15),
      t('APT raporu çevirisi', F.cti2, F.ekipCti, 'TAMAMLANDI', -6, -4),
      t('Tehdit aktörü profili: APT-X', F.cti1, F.ekipCti, 'DEVAM_EDIYOR', -8, -2, -1),
      t('Sosyal medya taraması (eski kampanya)', F.osint1, F.ekipOsint, 'IPTAL', -15, -10),
    ],
  });
}
