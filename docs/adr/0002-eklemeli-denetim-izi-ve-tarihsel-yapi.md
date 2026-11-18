# Denetim izi yalnızca eklenir, raporlar olay tarihindeki yapıya göre hesaplanır

Tüm atama, kabul, ret, durum, vekil, rol ve ajan işlemleri silinemeyen bir olay günlüğüne yazılır; kayıtlar silinmez, arşivlenir (varsayılan saklama 5 yıl, yapılandırılabilir). Bir Çalışan Ekip veya rol değiştirdiğinde geçmiş raporlar, olayın gerçekleştiği tarihteki organizasyon yapısına göre hesaplanır. Mevcut yapıya göre yeniden hesaplamak daha basit olurdu, ancak bir taşıma işlemi eski Ekip'in geçmiş performansını ve ret raporlarını bozardı.

## Consequences

- Organizasyon yapısı (üyelik, yönetici ilişkisi) tarih aralıklı kayıtlar olarak tutulur.
- Raporlama sorguları olay zamanına göre yapıyı çözmek zorundadır.
