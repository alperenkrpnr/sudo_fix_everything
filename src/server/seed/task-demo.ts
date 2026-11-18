// Demo Task'ları (yalnızca `npm run dev`; testler sadece fixture'ı yükler).
import type { Db } from '../db/client';
import { F } from './fixture';

export async function seedTaskDemo(db: Db, now: Date = new Date()): Promise<void> {
  const gun = (n: number) => new Date(now.getTime() + n * 86_400_000);
  const t = (
    baslik: string,
    requesterId: string,
    hedef: { k?: string; e?: string },
    ekipId: string | null,
    durum: 'TASLAK' | 'KABUL_BEKLIYOR' | 'KABUL_EDILDI' | 'DEVAM_EDIYOR' | 'BLOKLU' | 'TAMAMLANDI',
    ekstra: { oncelik?: 'DUSUK' | 'ORTA' | 'YUKSEK' | 'KRITIK'; bitis?: number; etiketler?: string[]; hariciRef?: string } = {},
  ) => ({
    baslik,
    requesterId,
    assigneeKullaniciId: hedef.k ?? null,
    assigneeEkipId: hedef.e ?? null,
    ekipId,
    durum,
    oncelik: ekstra.oncelik ?? 'ORTA',
    bitisTarihi: ekstra.bitis === undefined ? null : gun(ekstra.bitis),
    etiketler: ekstra.etiketler ?? [],
    hariciRef: ekstra.hariciRef ?? null,
    olusturma: gun(-3),
    guncelleme: gun(-1),
  });
  await db.task.createMany({
    data: [
      t('OWASP CRS 4 kural setine geçiş', F.thCoklu, { k: F.waf1 }, F.ekipWaf, 'DEVAM_EDIYOR', { oncelik: 'YUKSEK', bitis: 5, etiketler: ['waf'] }),
      t('False positive analizi: /api/login', F.waf2, { k: F.waf2 }, F.ekipWaf, 'KABUL_EDILDI', { bitis: 2, etiketler: ['waf', 'fp'] }),
      t('Phishing kampanyası IOC zenginleştirme', F.soc1, { k: F.cti1 }, F.ekipCti, 'KABUL_BEKLIYOR', { oncelik: 'YUKSEK', bitis: 3, etiketler: ['ioc'], hariciRef: 'INC-4521' }),
      t('SIEM korelasyon kuralı: brute force', F.thCoklu, { k: F.soc2 }, F.ekipSoc, 'BLOKLU', { bitis: -1, etiketler: ['siem'] }),
      t('Q1 dış sızma testi raporu', F.uhSavunma, { k: F.pentest1 }, F.ekipPentest, 'TAMAMLANDI', { oncelik: 'KRITIK', bitis: -2 }),
      t('Dark web marka izleme', F.cti2, { e: F.ekipOsint }, F.ekipOsint, 'KABUL_BEKLIYOR', { etiketler: ['osint'] }),
      t('WAF log saklama süresi önerisi', F.waf1, { k: F.thCoklu }, F.ekipWaf, 'KABUL_BEKLIYOR', { oncelik: 'DUSUK' }),
      t('Haftalık tehdit bülteni taslağı', F.cti1, { k: F.cti1 }, F.ekipCti, 'TASLAK', {}),
      t('Yıllık güvenlik farkındalık eğitimi', F.direktor, { k: F.uhIstihbarat }, null, 'KABUL_EDILDI', { bitis: 20 }),
    ],
  });
}
