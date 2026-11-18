# 06: Ekibe atama ve delegasyon

**What to build:** Herhangi biri Task'ı bir Ekip'e (örn. TEAM-WAF) atayabilir; Task Ekip'in Sorumlu yöneticisine düşer, o kabul edip Ekip içinden bir Çalışan'a delege eder. Delege edilen Çalışan reddederse Task Ekip havuzuna döner. Çok Ekipli yönetici tek birleşik gelen kutusu görür.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Ekibe atanan Task Sorumlu yöneticiye (Team Head, yoksa Unit Head) düşer
- [ ] Sorumlu yönetici Ekip içi bir Çalışan'a delege eder
- [ ] Delegasyon sonrası Çalışan reddi Task'ı Reddedildi yapmaz, Ekip havuzuna döndürür
- [ ] Çok Ekipli yönetici birleşik gelen kutusunda Ekip etiketi ve filtresi görür
- [ ] Direktör'ün Ekip'e ataması direkt Ekip'e düşer
- [ ] Delegasyon ve havuza dönüş denetim izine yazılır
