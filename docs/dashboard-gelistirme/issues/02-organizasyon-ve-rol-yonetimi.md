# 02: Organizasyon ve rol yonetimi

**What to build:** Direktör Unit, Ekip, Çalışan ve rolleri yönetir; Unit Head kendi Unit'indeki üyelik ve Team Head atamasını; Team Head kendi Ekibi'ne onaysız üye ekler ve çıkarır. Team Head'siz Ekipler doğrudan Unit Head'e bağlıdır. Bir yönetici birden fazla Ekip veya Unit'ten sorumlu olabilir.

**Blocked by:** 01

**Status:** resolved

- [ ] Direktör yapıyı oluşturur, düzenler ve Çalışan taşır
- [ ] Unit Head kendi Unit'indeki Ekip üyeliğini ve Team Head atamasını yönetir
- [ ] Team Head kendi Ekibi'ne Unit Head onayı olmadan üye ekler ve çıkarır
- [ ] Çalışan yalnızca kendi profilini düzenler, rolünü değiştiremez
- [ ] Team Head'siz Ekip için Sorumlu yönetici Unit Head olarak çözülür
- [ ] Üst yönetici kuralı: yetki yönetim zincirinde yukarı doğru kapsar
- [ ] Her yapı ve rol değişikliği denetim izine yazılır; geçmiş yapı tarihli kayıtlarla korunur

## Comments

- 2026-11-18: Built as a lean demo on `feat/dashboard-gelistirme`. Deferred: archiving/deleting Unit and Ekip, a UI for editing an Ekip (service and REST only).
