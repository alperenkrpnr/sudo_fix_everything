# 05: Accept refuse zinciri

**What to build:** Başka Ekip, Unit veya yöneticiden gelen Task'ta Çalışan accept/refuse eder, ardından Sorumlu yöneticisi accept/refuse eder. Çalışan→kendi yöneticisi ve Yönetici→Yönetici de accept/refuse gerektirir. Ret gerekçesi zorunludur; zincirin herhangi bir halkası reddederse Task Reddedildi olur ve Requester yeniden atar ya da iptal eder.

**Blocked by:** 02; 03

**Status:** ready-for-agent

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
