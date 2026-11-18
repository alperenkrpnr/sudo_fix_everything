# 04: Durum makinesi

**What to build:** Assignee ve Sorumlu yönetici Task'ı Kabul Edildi, Devam Ediyor, Bloklu ve Tamamlandı arasında ilerletir. Bloklu için neden zorunludur. Requester yalnızca iptal eder; Direktör her şeyi yapabilir. Tamamlanan Task aynı tarihçede yeniden açılabilir.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] İzinli durum geçişleri tanımlı ve geçersiz geçişler reddedilir
- [ ] Bloklu için neden zorunlu
- [ ] Requester yalnızca İptal edebilir
- [ ] Sorumlu yönetici ve Üst yöneticiler altlarındaki Task'ın durumunu değiştirebilir
- [ ] Tamamlandı yeniden açılırsa yeni kayıt oluşmaz, aynı tarihçeye eklenir
- [ ] Kabul Bekliyor durumunda işe başlanamaz
- [ ] Blok süresi ölçülebilir şekilde kaydedilir
- [ ] Durum değişiklikleri denetim izine yazılır
