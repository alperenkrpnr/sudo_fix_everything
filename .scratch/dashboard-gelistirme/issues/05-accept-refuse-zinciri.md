# 05: Accept refuse zinciri

**What to build:** Başka Ekip, Unit veya yöneticiden gelen Task'ta Çalışan accept/refuse eder, ardından Sorumlu yöneticisi accept/refuse eder. Çalışan→kendi yöneticisi ve Yönetici→Yönetici de accept/refuse gerektirir. Ret gerekçesi zorunludur; zincirin herhangi bir halkası reddederse Task Reddedildi olur ve Requester yeniden atar ya da iptal eder.

**Blocked by:** 02; 03

**Status:** resolved

- [ ] Spec'teki kabul zinciri kurallarında yer alan her Requester→Assignee kombinasyonu doğru zinciri üretir
- [ ] Başka Unit'te karşı Unit Head'e yalnızca bilgi gider, onay gerekmez
- [ ] Team Head'siz Ekip'te Unit Head hem Requester hem onaylayıcı olabilir ve otomatik kabul sayılır; çifte rol tarihçede görünür
- [ ] Ret gerekçesi zorunlu; reddedilen Task silinmez
- [ ] Zincirin herhangi bir halkası reddederse Task Reddedildi olur, zincir baştan başlamaz
- [ ] Requester reddedilen Task'ı yeniden atar, düzenleyip gönderir veya iptal eder
- [ ] Kabul bekleyen Task hedef Çalışan ve yöneticilerince hemen görünür, Ekip arkadaşlarınca görünmez
- [ ] Taşınan Çalışan'ın bekleyen onayları yeni Sorumlu yöneticiye geçer
- [ ] Tüm kabul ve ret kararları denetim izine yazılır
- [ ] Seam testleri her zincir satırını kapsar

## Comments

- 2026-11-18: Built as a lean demo on `feat/dashboard-gelistirme`. Deferred: auto-accept when the Requester is the approver of a later step (the dual role is recorded instead). Ekip delegation is ticket 06.
