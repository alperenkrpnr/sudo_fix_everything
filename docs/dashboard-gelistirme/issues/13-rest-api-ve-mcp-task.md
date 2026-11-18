# 13: Rest api ve mcp task

**What to build:** Ajanlar kullanıcı adına token ile REST API ve MCP üzerinden Task'ları okur ve (yazma kapsamı verilirse) değiştirir. Her iki yüzey aynı yetki servis katmanını kullanır. Token varsayılan salt okunurdur ve ajan işlemleri denetim izinde işaretlenir.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Token kullanıcı adına çalışır; ajan kullanıcının göremediğini göremez
- [ ] Ayrı okuma ve yazma kapsamı, varsayılan salt okunur
- [ ] REST uç noktaları Task listeleme, görüntüleme ve (yazma kapsamıyla) oluşturma/durum değiştirme
- [ ] MCP tool'ları aynı yetenekleri aynı servis katmanıyla sunar
- [ ] Ajan işlemleri denetim izinde 'ajan işlemi' olarak işaretlenir
- [ ] Adaptörler iş kuralı içermez; yönlendirme testleri geçer
- [ ] Yetkisiz erişim denemeleri reddedilir ve test edilir

## Comments

- 2026-11-18: Backend built on `feat/dashboard-gelistirme` (service, seam tests, REST, dev seed). UI pending: it will be added in the SecOpsGrid design. Simplified by the user: an MCP server (stdio) with task_listele, task_getir, bekleyen_islerim, rapor_ozet, task_olustur, task_durum_degistir; agent tokens with okuma/yazma scopes, read-only by default. Deferred: token expiry, HTTP MCP transport.
