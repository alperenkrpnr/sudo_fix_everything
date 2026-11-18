# 01: Iskelet yetki katmani denetim izi

**What to build:** Mock kullanıcıyla giriş yapılır ve kullanıcı Direktörlük, Unit, Ekip ve Çalışan yapısını rolüne göre görür. Tüm okuma/yazma işlemleri tek yetki servis katmanından geçer (ADR-0001). Her işlem ekleme-tabanlı denetim izine yazılır, ajan işlemi ayrıca işaretlenir (ADR-0002). Küçük bir Direktörlük seed fixture'ı yüklenir.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Mock kullanıcı seçilerek giriş yapılabilir; Direktör, Unit Head, Team Head ve Çalışan rolleri ayrışır
- [ ] Organizasyon yapısı (Direktörlük/Unit/Ekip/Çalışan) rol yetkisine göre görüntülenir
- [ ] Üyelik ve yönetici ilişkisi tarih aralıklı kayıtlardır
- [ ] Servis katmanı kullanıcı kimliği ve ajan işareti alır; web adaptörü iş kuralı içermez
- [ ] Denetim izi yalnızca eklenir, silinmez, arşivlenir; saklama süresi yapılandırılabilir (varsayılan 5 yıl)
- [ ] Seed fixture: Direktör, iki Unit, Team Head'li ve Team Head'siz Ekipler, çok Ekipli Team Head, birkaç Çalışan
- [ ] Servis katmanı seam'inde gerçek PostgreSQL test veritabanıyla testler çalışır
