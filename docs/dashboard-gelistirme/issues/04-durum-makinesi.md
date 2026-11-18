# 04: Durum makinesi

**What to build:** Assignee ve Sorumlu yönetici Task'ı Kabul Edildi, Devam Ediyor, Bloklu ve Tamamlandı arasında ilerletir. Bloklu için neden zorunludur. Requester yalnızca iptal eder; Direktör her şeyi yapabilir. Tamamlanan Task aynı tarihçede yeniden açılabilir.

**Blocked by:** 03

**Status:** resolved

- [ ] İzinli durum geçişleri tanımlı ve geçersiz geçişler reddedilir
- [ ] Bloklu için neden zorunlu
- [ ] Requester yalnızca İptal edebilir
- [ ] Sorumlu yönetici ve Üst yöneticiler altlarındaki Task'ın durumunu değiştirebilir
- [ ] Tamamlandı yeniden açılırsa yeni kayıt oluşmaz, aynı tarihçeye eklenir
- [ ] Kabul Bekliyor durumunda işe başlanamaz
- [ ] Blok süresi ölçülebilir şekilde kaydedilir
- [ ] Durum değişiklikleri denetim izine yazılır

## Comments

- 2026-11-18: Built as a lean demo on `feat/dashboard-gelistirme`. Deferred: a status-history row on Task creation (creation time is the start point), Assignee cancel.
