# 07: Alt task yorum ek backlog

**What to build:** Çalışan Task'a alt task, yorum ve dosya eki ekler. Dosya ekleri boyut ve tür sınırına tabidir. Tarihsiz Task'lar Backlog görünümünde listelenir.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Alt task eklenebilir ve ilerleme üst Task'ta görünür
- [ ] Yorumlar tarihçeye eklenir, görünürlük Task yetkisine bağlıdır
- [ ] Dosya ekinde boyut ve tür sınırı uygulanır, yetkisiz kullanıcı eke erişemez
- [ ] Etiketler ve harici ticket referansı (link/ID) düzenlenebilir
- [ ] Backlog görünümü tarihsiz Task'ları listeler (Backlog bir durum değildir)

## Comments

- 2026-11-18: Backend built on `feat/dashboard-gelistirme` (service, seam tests, REST, dev seed). UI pending: it will be added in the SecOpsGrid design. Deferred: comment notifications, renaming or deleting sub-tasks, deleting attachments, cleanup of orphaned files, Backlog filters.
