Status: ready-for-agent

# Siber Güvenlik Task Yönetimi Aracı

Terimler `GLOSSARY.md` ile uyumludur. Kararlar `docs/adr/0001` (tek yetki servis katmanı) ve `docs/adr/0002` (ekleme-tabanlı denetim izi, tarihsel yapı) ile çelişmez.

## Problem Statement

Siber Güvenlik Direktörlüğü'nde (Direktör → Unit Head → Team Head → Çalışan) günlük işler, dış eğitim ve konferans katılımları, yetkinlikler ve duyurular dağınık araçlarda yürüyor. Kimin hangi işi kabul ettiği, kimin reddettiği, işin nerede beklediği görünmüyor. Ekipler arası iş talebinde onay zinciri izlenemiyor. Yöneticiler ekip performansını, bekleme sürelerini ve ret nedenlerini ölçemiyor. Başka AI ajanları bu veriye güvenli biçimde erişemiyor.

## Solution

Microsoft Planner/Trello benzeri, kurum içi bir web uygulaması. Task'lar kişiye veya Ekip'e atanır. Direkt kabul ve çok halkalı accept/refuse akışı organizasyon hiyerarşisine göre işler. Etkinlik, Yetkinlik ve Duyuru modülleri aynı yetki modelini kullanır. Her rol için "Bekleyen işlerim" panosu ve yöneticiler için rapor ekranları sunulur. Aynı yetki servis katmanının üstünde REST API ve MCP sunucusu bulunur; ajanlar kullanıcı adına, varsayılan salt okunur çalışır.

## User Stories

### Organizasyon ve yetki
1. As a Direktör, I want to create and edit Units, Ekipler and Çalışanlar, so that the organization structure matches reality.
2. As a Direktör, I want to see and edit all Task'lar, Etkinlikler and kullanıcılar, so that I have full oversight.
3. As a Unit Head, I want to manage Ekip üyelikleri and Team Head assignments inside my Unit, so that I can reorganize without the Direktör.
4. As a Team Head, I want to add and remove Çalışanlar in my Ekip without Unit Head approval, so that onboarding is fast.
5. As a Unit Head, I want to directly manage Ekipler that have no Team Head, so that they are not orphaned.
6. As a Yönetici, I want to head multiple Ekipler or Units, so that real structures are supported.
7. As a Çalışan, I want to edit my own profile but not my role, so that roles stay controlled.
8. As a Yönetici, I want authority to flow up the management chain (Üst yönetici), so that I can see and edit everything below me.
9. As a Direktör, I want role and structure changes written to the denetim izi, so that changes are auditable.
10. As a Çalışan, I want to be moved to another Ekip without losing history, so that past reports stay correct.
11. As a Yönetici, I want pending approvals of a moved Çalışan to go to the new Sorumlu yönetici, so that nothing is stuck.
12. As a user, I want to sign in with a mock identity in the demo, so that I can try every role (architecture stays SSO-ready).

### Task oluşturma ve atama
13. As a Çalışan, I want to create a Task for myself, so that my own work is tracked (Self-assign, auto-accepted).
14. As a Çalışan, I want to create a Task for a colleague in my Ekip, so that peers can hand off work.
15. As a Çalışan, I want to create a Task for someone in another Ekip or Unit, so that cross-team requests are tracked.
16. As a Çalışan, I want to create a Task for my own Yönetici, so that I can escalate or request things upward.
17. As a Yönetici, I want to assign a Task to my Çalışan with direkt kabul, so that work starts immediately.
18. As a Unit Head, I want to assign to anyone in my Unit with direkt kabul, so that I can direct work down.
19. As a Yönetici, I want to assign a Task to another Yönetici, so that peer managers collaborate.
20. As a Direktör, I want to assign to anyone with direkt kabul, so that urgent work lands immediately.
21. As a Requester, I want to assign a Task to an Ekip (e.g. TEAM-WAF), so that the Ekip decides who works on it.
22. As a Çalışan, I want fields title, description, priority, due date, tags and an optional external ticket reference, so that security work is described properly.
23. As a Çalışan, I want sub-tasks, comments and file attachments with size/type limits, so that work is broken down and discussed safely.
24. As a Requester, I want Backlog Task'lar without a date, so that unscheduled work is parked.
25. As a Requester, I want a Draft state, so that I can prepare before sending.

### Kabul akışı
26. As a Çalışan, I want to accept or refuse a Task from another Ekip, so that I control my workload.
27. As a Sorumlu yönetici, I want to accept or refuse a Task after my Çalışan accepted, so that cross-team work passes my review.
28. As a Çalışan, I want to be required to write a ret gerekçesi when refusing, so that the Requester understands.
29. As a Requester, I want a notification when a Task is accepted or refused, so that I can react.
30. As a Requester, I want to reassign, edit and resend, or cancel a refused Task, so that work is not lost.
31. As a Sorumlu yönetici, I want to act on a Task assigned to my Çalışan from another Ekip, so that I can intervene.
32. As a Team Head, I want Ekip-assigned Tasks in my inbox, so that I can delegate them.
33. As a Team Head, I want to delegate to a Çalışan of my Ekip, so that the right person works on it.
34. As a Çalışan, I want a refused delegated Task to go back to the Ekip pool, so that the Team Head can pick another person.
35. As a Unit Head of a Team Head-less Ekip, I want to be both Requester and approver without friction, so that self-directed work is auto-accepted, and the dual role is visible in history.
36. As a Team Head with several Ekipler, I want one combined inbox with Ekip labels and filters, so that I do not switch contexts.
37. As a Çalışan, I want to be unable to start a Task still in Kabul Bekliyor, so that the chain is respected.
38. As an auditor, I want every accept/refuse recorded, so that decisions are traceable.

### Durum ve takip
39. As an Assignee, I want to move a Task through Kabul Edildi, Devam Ediyor, Bloklu and Tamamlandı, so that progress is visible.
40. As an Assignee, I want to give a reason when blocking, so that blok süresi can be reported.
41. As a Requester, I want to cancel but not otherwise change status, so that ownership stays with the Assignee.
42. As a Yönetici, I want to change status on my Çalışanların Task'ları, so that I can unblock the team.
43. As a Çalışan, I want to reopen a completed Task in the same history, so that no duplicate is created.
44. As a Çalışan, I want a board view (Planner/Trello style) and list view with filters, so that I can work how I like.
45. As a Çalışan, I want overdue Task'lar highlighted, so that I notice them.

### Görünürlük
46. As a Çalışan, I want to see Task'lar I created, assigned to me and assigned to my Ekip, so that I have context.
47. As a Çalışan, I want a Task awaiting my accept/refuse visible immediately, so that I can answer it.
48. As a Çalışan, I want colleagues not to see unaccepted Task'lar meant for me, so that requests stay private.
49. As a Team Head, I want to see and edit every Task related to my Çalışanlar, so that I manage the whole picture.
50. As a Unit Head, I want the same view over my whole Unit, so that I see cross-Ekip load.

### Bekleyen işlerim
51. As a Çalışan, I want a "Bekleyen işlerim" dashboard with my pending Task accepts and Etkinlik invites, so that I never miss one.
52. As a Yönetici, I want the dashboard to also show Ekip approvals, Etkinlik approvals, work I hold as Vekil and escalated items, so that one place lists everything I owe.
53. As a Yönetici, I want items sorted by deadline and age, so that I handle urgent ones first.

### Vekalet ve eskalasyon
54. As a Yönetici, I want to name a Vekil from my own Ekip or from other Yöneticiler in the Direktörlük, so that approvals continue while I am away.
55. As a Yönetici, I want to be unable to name a Çalışan of another Ekip as Vekil, so that authority stays inside my structure.
56. As a Yönetici, I want Vekalet to have a date range and end automatically, so that it cannot linger.
57. As a Vekil, I want to be unable to approve requests that involve me, so that I cannot self-approve; they go to the next Üst yönetici.
58. As an auditor, I want Vekil decisions shown as "X adına Y tarafından", so that delegation is transparent.
59. As a Direktörlük, I want requests unanswered for 3 iş günü (configurable) to escalate to the Unit Head, so that nothing stalls.
60. As a Yönetici, I want Etkinlik approvals to escalate one day before the Etkinlik if it starts sooner than 3 iş günü, so that time-critical requests are not missed.

### Etkinlik, Yetkinlik, Duyuru
61. As a Yönetici, I want to plan an iç etkinlik (iletişim toplantısı) with invitations, so that internal meetings are tracked.
62. As a Çalışan, I want to answer an iç etkinlik invite with katılıyorum/katılmıyorum, so that organizers know attendance.
63. As a Çalışan, I want to submit a dış katılım request (conference/training), so that attendance is approved and recorded.
64. As a Çalışan, I want to record a dış konuşmacı Etkinlik with speaker, institution, topic and date, so that my external talks are tracked.
65. As a Sorumlu yönetici, I want a notification and 3 iş günü to approve dış etkinlikler, so that workforce planning is protected.
66. As a Çalışan, I want to keep my Yetkinlikler (certificates, trainings) with expiry dates, so that my record is current.
67. As a Çalışan, I want a reminder before a certificate expires, so that I renew in time.
68. As a Yönetici, I want to see Yetkinlik and Etkinlik history of my Ekip, so that I plan development.
69. As a Yönetici, I want to publish a Duyuru to an Ekip, a Unit or the Direktörlük, so that information reaches the right audience.
70. As a Çalışan, I want a notification for new Duyurular addressed to me, so that I stay informed.

### Raporlama
71. As a Yönetici, I want open/closed Task ratios per Ekip and Çalışan, so that I see load and completion.
72. As a Yönetici, I want average resolution time (creation → done), so that I measure speed.
73. As a Yönetici, I want kabul bekleme süresi and blok süresi shown separately, so that I find where time is lost.
74. As a Yönetici, I want Ekip-based resolution performance, so that Ekipler can be compared.
75. As a Yönetici, I want a ret raporu: rate, ret gerekçesi distribution, and which Ekip refused whose requests, so that I fix friction.
76. As a Yönetici, I want overdue Task counts, so that I address delays.
77. As a Yönetici, I want a Çalışan comparison ranking visible only to managers, so that individuals are not publicly ranked.
78. As a Çalışan, I want a report of my own Task'lar, so that I see my own record.
79. As a Direktör, I want reports across all Units, so that I see the entire Direktörlük.
80. As a Yönetici, I want to filter reports by date range, Ekip and Unit, so that I focus.
81. As a Yönetici, I want past reports calculated with the structure at the time of each event, so that moving a Çalışan does not rewrite history.

### Bildirim
82. As a user, I want in-app notifications for new assignment, accept/refuse, block, deadline, escalation, certificate expiry, Etkinlik invite and Duyuru, so that I am informed.
83. As a user, I want to toggle notifications per channel, so that I control noise (e-posta follows after the demo).

### API ve MCP
84. As an AI agent, I want a REST API for Task'lar, Etkinlikler, Yetkinlikler and reports, so that I can integrate.
85. As an AI agent, I want an MCP server exposing the same capabilities as tools, so that agents integrate easily.
86. As a user, I want an agent to see only what I can see, so that agents never widen access.
87. As a user, I want agent tokens with separate read and write scopes, default read-only, so that I grant minimum rights.
88. As an auditor, I want every Ajan işlemi marked in the denetim izi, so that agent actions are distinguishable.

### Denetim
89. As an auditor, I want an append-only denetim izi for assignments, accept/refuse, status changes, Vekil, role changes and agent actions, so that nothing can be hidden.
90. As an admin, I want records archived rather than deleted, retained 5 years by default (configurable), so that policy is met.

## Implementation Decisions

- **Modules (deep, thin interfaces):**
  - Organizasyon: Direktörlük/Unit/Ekip/Çalışan, yönetici ilişkileri, roller. Üyelik ve yönetici ilişkisi tarih aralıklı kayıtlardır (ADR-0002).
  - Yetki servis katmanı: tek giriş noktası (ADR-0001). Girdi: kullanıcı kimliği (ve ajan işareti) + işlem. Görünürlük, düzenleme, onay yetkisi, Sorumlu yönetici, Üst yönetici ve Vekil çözümü yalnızca burada yaşar.
  - Kabul akışı motoru: Requester/Assignee ilişkisinden onay zincirini üretir ve ilerletir.
  - Task: durum makinesi, alt task, yorum, ek, Backlog.
  - Etkinlik, Yetkinlik, Duyuru: üç ayrı varlık; Etkinlik tek varlık, tip alanı iç / dış katılım / dış konuşmacı.
  - Bekleyen işlerim: yetki katmanından beslenen birleşik sorgu; Çalışan ve Yönetici aynı bileşen, farklı içerik.
  - Raporlama: olay tarihindeki yapıya göre hesaplayan sorgu katmanı.
  - Bildirim: uygulama içi, kullanıcı bazlı tercih.
  - Denetim izi: ekleme-tabanlı olay günlüğü.
  - API ve MCP adaptörleri: iş kuralı içermez, yalnızca servis katmanını çağırır.
- **Kabul zinciri kuralları:**
  - Yönetici → kendi çalışanı: direkt kabul. Unit Head → kendi Unit'i: direkt kabul. Direktör → herkes: direkt kabul. Self-assign: otomatik kabul.
  - Çalışan → aynı Ekip'ten Çalışan: karşı Çalışan kabul eder.
  - Çalışan → başka Ekip veya Unit'ten Çalışan: Çalışan kabul eder, sonra onun Sorumlu yöneticisi kabul eder. Başka Unit'te karşı Unit Head'e yalnızca bilgi gider, onay gerekmez.
  - Çalışan → kendi yöneticisi: accept/refuse gerekir.
  - Yönetici → başka yöneticinin çalışanı: Çalışan ve onun Sorumlu yöneticisi kabul eder. Yönetici → yönetici: karşı Yönetici kabul eder.
  - Herhangi biri → Ekip: Sorumlu yöneticiye düşer; kabul edip delege eder. Team Head yoksa Unit Head.
  - Zincirin herhangi bir halkası reddederse Task Reddedildi olur; zincir baştan başlamaz. Delegasyon sonrası Çalışan reddederse Task Ekip havuzuna döner, Reddedildi olmaz.
  - Ret gerekçesi zorunludur. Reddedilen Task silinmez.
- **Durum makinesi:** Taslak → Kabul Bekliyor → Kabul Edildi → Devam Ediyor → Bloklu → Tamamlandı; ayrıca Reddedildi ve İptal. Kabul Bekliyor'da işe başlanamaz. Durumu Assignee ve Sorumlu yönetici (Üst yöneticiler dahil) değiştirir; Requester yalnızca iptal eder; Direktör her şeyi yapar. Tamamlandı yeniden açılabilir, aynı kaydın tarihçesine eklenir. Bloklu için neden zorunludur. Backlog bir durum değil, tarihsiz Task'ların görünümüdür.
- **Bekleme süresi iki ölçüm olarak tutulur:** kabul bekleme süresi ve blok süresi.
- **Görünürlük:** Çalışan kendi açtığı, kendisine atanan ve Ekip'ine atanan Task'ları görür ve günceller. Kabul bekleyen Task, hedef Çalışan ve onun yöneticilerince hemen görünür; diğer Ekip arkadaşlarınca görünmez. Team Head ve Unit Head, altlarındaki Çalışanların ilişkili olduğu tüm Task'ları görür ve düzenler. Direktör her şeyi.
- **Etkinlik onayı:** Dış katılım ve dış konuşmacı için Sorumlu yönetici onayı; iç etkinlikte yalnızca davet ve katılım yanıtı. Onay süresi Task kabulüyle aynı sayaç ve kuralı kullanır (3 iş günü, ayarlanabilir; Etkinlik başlangıcı daha yakınsa eskalasyon Etkinlik tarihinden bir gün öncesine çekilir).
- **Vekalet:** Vekil kendi Ekibi'nin Çalışanı veya Direktörlük'teki başka bir Yönetici olabilir. Kendi ilişkili olduğu talebi onaylayamaz (talep Üst yöneticiye düşer). Tarih aralığıyla tanımlanır ve süre bitince sona erer. Kayıtlar "X adına Y tarafından" biçiminde tutulur. Vekalet ve eskalasyon demoda yer alır.
- **Organizasyon değişimi:** Taşınan Çalışan'ın açık Task'ları eski Ekip'te kalır, bekleyen onaylar yeni Sorumlu yöneticiye geçer, geçmiş kayıtlar değişmez.
- **Rol yönetimi:** Direktör her şeyi; Unit Head kendi Unit'indeki üyelik ve Team Head atamasını; Team Head kendi Ekibi'ne onay gerektirmeden üye ekler/çıkarır; Çalışan yalnızca kendi profilini.
- **Raporlar:** açık/kapalı oranı, ortalama çözüm süresi, kabul bekleme ve blok süresi, Ekip bazlı performans, ret raporu (ret oranı, gerekçe dağılımı, Ekip'ten Ekip'e ret akışı), geciken sayısı. Çalışan sıralaması yalnızca yöneticilere. Tarih aralığı, Ekip ve Unit filtresi. Geçmiş, olay tarihindeki yapıya göre hesaplanır.
- **Bildirim olayları:** yeni atama, kabul/ret, blok, termin yaklaşma/geçme, eskalasyon, sertifika bitişi, etkinlik daveti, yeni duyuru. Kanal: uygulama içi; kullanıcı bazında açılıp kapatılır.
- **API ve MCP:** Kullanıcı adına çalışan token'lar; ayrı okuma ve yazma kapsamı, varsayılan salt okunur. MCP tool'ları ve REST uç noktaları aynı servis katmanını çağırır. Ajan işlemleri denetim izinde işaretlenir. Demoda yazma kapsamı mevcuttur ama varsayılan kapalıdır.
- **Teknoloji:** TypeScript; Node tabanlı backend; PostgreSQL; ORM olarak Prisma; React + Vite ön yüz; MCP için resmi TypeScript SDK.
- **Kimlik:** Demo'da mock kullanıcı girişi; mimari Entra ID/OIDC'ye hazır.
- **Denetim:** Ekleme-tabanlı olay günlüğü; silme yok, arşivleme; saklama varsayılan 5 yıl, yapılandırılabilir.

## Testing Decisions

- **İyi test:** Yalnızca dış davranışı doğrular (kim ne görür, hangi işlem kime düşer, hangi durum geçişi izinlidir). İç yapıyı, tablo düzenini veya sınıf yapısını test etmez.
- **Tek seam: yetki servis katmanı.** Testler servis katmanını doğrudan çağırır (kullanıcı kimliği + işlem) ve gerçek bir PostgreSQL test veritabanına karşı çalışır. Web, REST ve MCP ince adaptör olduğundan ayrı seam gerektirmez; yalnızca adaptörün yönlendirmesini doğrulayan birkaç ince test yazılır.
- **Fixture:** Mock kullanıcılarla küçük bir Direktörlük: bir Direktör, iki Unit, Team Head'li ve Team Head'siz Ekipler, çok Ekipli bir Team Head, birkaç Çalışan.
- **Kapsanacak davranışlar:** kabul zinciri senaryoları (her satır için), görünürlük sınırları, Ekip'e atama ve delegasyon, Ekip havuzuna dönüş, durum geçişi yetkileri, Vekil kuralları (kendi talebini onaylayamama, süre bitimi), eskalasyon süreleri, organizasyon değişiminde onayların taşınması, Bekleyen işlerim içeriği, rapor sorgularının olay tarihindeki yapıya göre doğruluğu, ajan kapsamı ve denetim izi kaydı.
- **Prior art:** Proje boştur; mevcut test yoktur. İlk testler bu spec'in örnek senaryolarını belirler.

## Out of Scope

- SSO'nun gerçek entegrasyonu (Entra ID/LDAP); demo mock giriş kullanır.
- E-posta bildirimi, Teams ve Slack entegrasyonu.
- Tekrarlayan task (Tekrar şablonu) ve CSV dışa aktarım (demo sonrası).
- Ajan yazma kapsamının varsayılan olarak açılması.
- Harici ticket/SIEM/ITSM sistemleriyle gerçek entegrasyon (yalnızca link/ID alanı).
- On-call/nöbet planlaması.
- Matris organizasyon ve Unit altında iç içe alt ekipler.

## Further Notes

- Tam ürün tek spec olarak çok geniştir. `/to-tickets` ile modüllere (Organizasyon ve yetki, Kabul akışı ve Task, Etkinlik/Yetkinlik/Duyuru, Raporlama, Bildirim, API ve MCP) bölünmesi önerilir.
- Veri modeli şeması, ekran tasarımları ve API sözleşmesi uygulama planında çıkarılır.
- Vekalet ve eskalasyon veri modelinde baştan yer alır (Vekil ve süre alanları).
