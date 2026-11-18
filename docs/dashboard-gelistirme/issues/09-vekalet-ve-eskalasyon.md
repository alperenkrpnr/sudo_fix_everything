# 09: Vekalet ve eskalasyon

**What to build:** Yönetici bir Vekil atar (kendi Ekibi'nden Çalışan veya Direktörlük'teki başka bir Yönetici; başka Ekip'in Çalışanı olamaz). Vekalet tarih aralıklıdır ve süre dolunca biter. Vekil kendi ilişkili olduğu talebi onaylayamaz. Süresinde onaylanmayan talepler (varsayılan 3 iş günü) Unit Head'e eskale edilir.

**Blocked by:** 05; 08

**Status:** ready-for-agent

- [ ] Vekil kuralları: yalnızca izinli adaylar seçilebilir
- [ ] Vekalet tarih aralığıyla tanımlanır ve süre bitince otomatik sona erer
- [ ] Vekil kendi ilişkili olduğu talebi onaylayamaz; talep Üst yöneticiye düşer
- [ ] Vekil kararları 'X adına Y tarafından' olarak kaydedilir
- [ ] Eskalasyon süresi ayarlanabilir, varsayılan 3 iş günü
- [ ] Eskale edilen talepler panoda ayrı grupta görünür, Vekil işleri de ayrı grupta
- [ ] Eskalasyon ve vekalet denetim izine yazılır

## Comments

- 2026-11-18: Backend built on `feat/dashboard-gelistirme` (service, seam tests, REST, dev seed). UI pending: it will be added in the SecOpsGrid design. Deferred: official holidays (escalation skips weekends only), marking a Vekil's delegations 'adına'.
