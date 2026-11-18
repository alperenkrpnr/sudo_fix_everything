# Tüm erişim tek bir yetki servis katmanından geçer

Web arayüzü, REST API ve MCP sunucusu aynı servis katmanını çağırır; görünürlük ve düzenleme kuralları (Çalışan / Team Head / Unit Head / Direktör, Sorumlu yönetici, Vekil) yalnızca bu katmanda uygulanır. Ajanlar kullanıcı adına çalışır ve o kullanıcının göremediğini göremez. Her yüzeyin kendi kontrolünü yapması hızlı olurdu, ama kurallar ayrışır ve siber güvenlik verisinde yetki sızıntısı riski doğar.

## Consequences

- MCP tool'ları ve REST uç noktaları ince adaptördür, iş kuralı içermez.
- Yetki kuralı değişikliği tek yerde yapılır ve tek yerde test edilir.
