// Rapor demo Task'ları (yalnızca `npm run dev`): farklı çözüm süreleri ve geciken işler.
// Kendi durum tarihçesini yazar (çözüm süresi = olusturma → TAMAMLANDI geçişi; bir blok aralığı).
import type { TaskDurum } from '@prisma/client';
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
  const tasks = await db.task.createManyAndReturn({
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
  const gecisler = tasks.flatMap((x) => {
    const kim = x.assigneeKullaniciId!;
    const g = (eski: TaskDurum, yeni: TaskDurum, zaman: Date, neden?: string) => ({ taskId: x.id, eski, yeni, zaman, kullaniciId: kim, neden });
    const bas = new Date(x.olusturma.getTime() + 3_600_000);
    if (x.durum === 'TAMAMLANDI') return [g('KABUL_EDILDI', 'DEVAM_EDIYOR', bas), g('DEVAM_EDIYOR', 'TAMAMLANDI', x.guncelleme)];
    if (x.durum === 'IPTAL') return [g('KABUL_EDILDI', 'IPTAL', x.guncelleme)];
    // Açık olanlar: bir süre bloklu kalıp devam etmiş
    return [
      g('KABUL_EDILDI', 'DEVAM_EDIYOR', bas),
      g('DEVAM_EDIYOR', 'BLOKLU', new Date(bas.getTime() + 86_400_000), 'Erişim yetkisi bekleniyor'),
      g('BLOKLU', 'DEVAM_EDIYOR', x.guncelleme),
    ];
  });
  await db.taskDurumGecisi.createMany({ data: gecisler });
}
