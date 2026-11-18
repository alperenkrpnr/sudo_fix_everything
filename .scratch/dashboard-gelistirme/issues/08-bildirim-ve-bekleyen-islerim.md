# 08: Bildirim ve bekleyen islerim

**What to build:** Uygulama içi bildirim sistemi kullanıcı bazlı tercihle çalışır. Çalışan ve Yönetici için aynı 'Bekleyen işlerim' panosu, role göre içerik gösterir: Çalışan kendisine gelen kabul bekleyen Task'ları ve etkinlik davetlerini; Yönetici bunlara ek olarak Ekip onaylarını.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Bildirim olayları: yeni atama, kabul/ret, blok, termin yaklaşma/geçme
- [ ] Kullanıcı bildirim türlerini açıp kapatabilir (uygulama içi; e-posta kapsam dışı)
- [ ] Çalışan panosu yalnızca kendisine gelen kabul bekleyen işleri gösterir
- [ ] Yönetici panosu Ekip onaylarını da gösterir
- [ ] Panoda liste termine ve bekleme yaşına göre sıralanır
- [ ] Pano aynı bileşendir; içerik yetki katmanından beslenir

## Comments

- 2026-11-18: Partly built on `feat/dashboard-gelistirme`. Done: the minimal in-app notification module (from ticket 10) and the Bekleyen işlerim page (Task acceptances plus Etkinlik invites, sorted by due date then age). Open: per-user notification preferences, due-date-approaching/overdue notifications.
