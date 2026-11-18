# 12: Raporlama

**What to build:** Yöneticiler ve Direktör rol kapsamında raporları görür: açık/kapalı oranı, ortalama çözüm süresi, kabul bekleme ve blok süresi, Ekip bazlı performans, geciken Task sayısı ve ret raporu. Çalışan yalnızca kendi raporunu görür. Çalışan sıralaması yalnızca yöneticilere açıktır. Raporlar olay tarihindeki organizasyon yapısına göre hesaplanır.

**Blocked by:** 02; 04; 05

**Status:** ready-for-agent

- [ ] Açık/kapalı Task oranı ve ortalama çözüm süresi (oluşturulma→tamamlandı)
- [ ] Kabul bekleme süresi ve blok süresi ayrı ayrı gösterilir
- [ ] Ekip bazlı çözüm performansı ve geciken Task sayısı
- [ ] Ret raporu: ret oranı, gerekçe dağılımı, hangi Ekip'ten hangi Ekip'e ret gitti
- [ ] Çalışan sıralaması yalnızca yöneticilere görünür
- [ ] Tarih aralığı, Ekip ve Unit filtresi
- [ ] Rol kapsamı: Çalışan kendisi, yönetici Ekibi/Unit'i, Direktör hepsi
- [ ] Çalışan taşındığında geçmiş rapor olay tarihindeki yapıya göre kalır (ADR-0002)
- [ ] Seam testlerinde fixture üzerinde sayılar doğrulanır
