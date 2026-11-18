# Devreye alım — Karar (`karar`)

- **Tarih:** 2026-11-18
- **Girdiler:** Bu dizindeki üç bulgu dosyası da mevcut ve okundu:
  - `guvenlik.md`: GUV-01…GUV-12 ve "Bilinen demo boşlukları" bölümü
  - `kod.md`: KOD-01…KOD-27
  - `ux.md`: UX-01…UX-24
- **İncelenen kod:**
  - `guvenlik` ve `kod`: entegrasyon dalının ucu `9519f0e`
  - `ux`: main checkout'ta çalışan uygulama (bkz. §5)
- **Bilinen demo boşlukları:** `guvenlik.md` bunları id vermeden listeliyor. İzlenebilir olsunlar diye bu kararda **GUV-B1…GUV-B5** olarak numaralandı:
  - GUV-B1: taklit edilebilir mock login
  - GUV-B2: token'sız kullanıcı listesi
  - GUV-B3: rate limiting yok
  - GUV-B4: TLS yok
  - GUV-B5: gömülü Postgres'te varsayılan `postgres/postgres` kimlik bilgileri ve superuser bağlantısı
- **Mükerrer birleştirme:** 63 bulgu ve 5 demo boşluğu, toplam 68 kayıt vardı. Birleştirmeden sonra **53 kayıt** kaldı. Birleştirilen her kayıtta tüm id'ler listelendi ve en yüksek sınıf korundu.

## 1. Karar

| Ortam | Karar | P0 | P1 | P2 |
|---|---|---|---|---|
| **Demo** (iç demo / pilot, mock login) | **NO-GO** | 4 | 16 | 33 |
| **Prod** (gerçek kullanıcı, gerçek veri) | **NO-GO** | 8 | 19 | 26 |

Kapılar yeşil: `npm run typecheck` temiz, `npm test` 15 dosyada 121/121 geçiyor. NO-GO'nun sebebi testler değil. Açık P0'ların hiçbirini mevcut testler yakalamıyor (bkz. KOD-15).

## 2. Gerekçeler

### Her iki ortamda P0 (Demo NO-GO'nun sebebi)

1. **GUV-01 / KOD-01:** `teamHeadAta`'da mass assignment var. Unit Head tek istekle (`tur:"DIREKTOR"`) kendini Direktör yapıyor, ardından denetim izini okuyor ve Unit oluşturuyor. CONFIRMED.
2. **GUV-03 / KOD-03 / UX-09:** Assignee ve Üst yöneticileri, Kabul Bekliyor bir Task'ı reddetmek yerine İptal edebiliyor. Ret gerekçesi, TASK_RET bildirimi ve Requester'ın yeniden atama hakkı atlanıyor, yani kabul zinciri bypass ediliyor. CONFIRMED. UX-09 PLAUSIBLE idi; GUV ve KOD bunu doğruladı.
3. **GUV-05 / KOD-04:** Dev sunucusu tüm arayüzlerde dinliyor ve vite 7.1.12'de `server.fs.deny` atlatılabiliyor. Token'sız istekle sunucu kaynağı, `.git` ve `.pgdata` okunabiliyor; `.pgdata` içinde `Kullanici`, `Task` ve `DenetimKaydi` tablo dosyaları var. Mock login ile birleşince aynı ağdaki herkes Direktör oluyor. CONFIRMED; erişilebilir bir high zafiyet.
   - Sınıf: `guvenlik` Demo'yu P1 vermişti, `kod` P0 verdi. En yüksek sınıf korundu.
4. **GUV-02 / KOD-02:** Team Head, başka bir Unit'in Çalışan'ını, Unit Head'ini ya da Direktör'ü kendi Ekibine ekleyebiliyor. Böylece onların Üst yöneticisi oluyor: kayıtlarını görüyor, Task durumlarını değiştiriyor, kendi atamasını kabul zincirini atlayarak direkt kabul ettiriyor. CONFIRMED.
   - Sınıf: `guvenlik` "kimin eklenebileceği ürün kararı" gerekçesiyle P1'e indirmişti, `kod` P0 verdi. En yüksek sınıf korundu. Yönetici ve Direktör eklenmesi ürün kararından bağımsız olarak dikey yetki yükseltmesi.

### Yalnız Prod'da P0 (Demo'da P2, bilinen demo boşlukları)

5. **GUV-B3:** Giriş ucu dahil hiçbir yerde rate limiting yok. `guvenlik.md` tüm bilinen demo boşluklarını Prod'da P0 saydığı için sınıf korundu.
6. **GUV-08 / KOD-16 / GUV-B5:** Uygulama DB'ye varsayılan kimlik bilgileriyle superuser olarak bağlanıyor. Denetim izi koruması TRUNCATE'i kapsamıyor; `arsivlendi` saklama süresine bakılmadan doldurulabiliyor.
7. **GUV-B4:** TLS yok.
8. **KOD-05 / GUV-B1 / GUV-B2:** `Bearer mock:<id>` ile herkes istediği kullanıcı olabiliyor. Giriş ucu kimlik bilgisi istemiyor ve kullanıcı listesi token'sız açık.

### P1'ler: P0'lar kapandıktan sonra KOŞULLU GO'nun koşulları

P0'lar kapanınca karar KOŞULLU GO olur. Her P1 için koşul ya "devreye alım öncesi düzelt" ya da "kabul edilen risk + önlem + sahip + hedef tarih" olacak.

- Prod için öneri: tüm P1'ler düzeltilsin. Kabul ancak tarihli bir planla yapılmalı.
- Demo için öneri aşağıdaki tabloda. Sahip ve tarih alanları doldurulacak.

| # | Id'ler | Demo önerisi | Önlem (kabul ediliyorsa) | Sahip | Hedef tarih |
|---|---|---|---|---|---|
| 9 | KOD-08 | Düzelt (#1 ile aynı değişiklik) | — | `<sahip>` | `<YYYY-AA-GG>` |
| 10 | KOD-09 | Düzelt | — | `<sahip>` | `<YYYY-AA-GG>` |
| 11 | KOD-11 | Kabul | Demo boyunca Ekip→Unit değişikliği yapılmaz; kısa vadeli yasak (S) tercih edilir | `<sahip>` | `<YYYY-AA-GG>` |
| 12 | KOD-13 | Kabul | Rapor ekranında yöneticiye atanan Task ve bekleyen kabul süresi gösterilmez | `<sahip>` | `<YYYY-AA-GG>` |
| 13 | UX-01 | Düzelt (çekirdek akış sahnede) | — | `<sahip>` | `<YYYY-AA-GG>` |
| 14 | UX-04 | Düzelt | — | `<sahip>` | `<YYYY-AA-GG>` |
| 15 | UX-05 | Düzelt | — | `<sahip>` | `<YYYY-AA-GG>` |
| 16 | UX-06 | Düzelt (bağlantı, S) | — | `<sahip>` | `<YYYY-AA-GG>` |
| 17 | GUV-04 / KOD-06 / KOD-07 / UX-11 | En az hata işleyici düzeltilsin (S); doğrulama kabul edilebilir | Demo senaryosu geçersiz girdi denemez | `<sahip>` | `<YYYY-AA-GG>` |
| 18 | GUV-06 / KOD-23 | Kabul | Demo senaryosunda kabulden sonra Task düzenlenmez | `<sahip>` | `<YYYY-AA-GG>` |
| 19 | KOD-10 | Kabul | Demo boyunca Çalışan taşıma yapılmaz | `<sahip>` | `<YYYY-AA-GG>` |
| 20 | KOD-12 | Kabul | Ret raporu demo'da gösterilmez ya da yeniden atanmış Task kullanılmaz | `<sahip>` | `<YYYY-AA-GG>` |
| 21 | KOD-15 | En az #1–#4 ve #9 kurallarının seam testleri yazılsın | Kalan testler tarihli plana bağlanır | `<sahip>` | `<YYYY-AA-GG>` |
| 22 | UX-02 / KOD-14 | Düzelt (ret gerekçesi akışı sahnede) | — | `<sahip>` | `<YYYY-AA-GG>` |
| 23 | UX-03 | Düzelt (#2'deki `izinliGecisler` ile birlikte) | — | `<sahip>` | `<YYYY-AA-GG>` |
| 24 | UX-07 | Kabul | Denetim izi demo'da API yanıtıyla ya da hazır ekran görüntüsüyle gösterilir | `<sahip>` | `<YYYY-AA-GG>` |
| 25 | UX-10 | (Demo'da P2) | — | — | — |
| 26 | GUV-11 | (Demo'da P2) | — | — | — |
| 27 | GUV-07 | (Demo'da P2) | — | — | — |

## 3. Öncelikli düzeltme listesi

Sıralama P0 → P1 → P2. Aynı sınıf içinde önce CONFIRMED, sonra PLAUSIBLE; ardından düşük efor önce gelir. Sınıf iki ortamda farklıysa kayıt, daha yüksek sınıfının grubunda yer alır. "Hüküm" sütununda birleştirilmiş kaydın en güçlü hükmü yazılı.

### Devreye alım öncesi zorunlu (GO'yu engelleyen her şey)

#### A. P0, her iki ortamda

| # | Id'ler | Başlık | Demo / Prod | Hüküm | Efor | Düzeltme |
|---|---|---|---|---|---|---|
| 1 | GUV-01, KOD-01 | `teamHeadAta` / `unitHeadAta` mass assignment: Unit Head kendini Direktör yapıyor | P0 / P0 | CONFIRMED | S | `data`, `where` ve denetim `veri` alanlarını açık alan listesiyle kur; router yalnız `{ekipId, kullaniciId}` alsın; seam testi yaz |
| 2 | GUV-03, KOD-03, UX-09 | Kabul Bekliyor'da Assignee ve Üst yönetici İptal edebiliyor; ret ve yeniden atama atlanıyor | P0 / P0 | CONFIRMED | S | `yetki/task-durum.ts`: KABUL_BEKLIYOR ve TASLAK durumunda yalnız Requester ve Direktör İptal edebilsin; seam testi yaz; arayüzden "→ İptal" kaldırılsın |
| 3 | GUV-05, KOD-04 | Sunucu `*:PORT`'ta dinliyor; vite 7.1.12 ile kaynak, `.git` ve `.pgdata` token'sız okunuyor | P0 / P0 | CONFIRMED | S (Demo) / M (Prod) | Demo: `app.listen(PORT,'127.0.0.1')`, `server.fs.deny` içine `.pgdata/**`, vite ≥ 7.3.7. Prod: `vite build` çıktısını statik sun, Vite middleware'ini kaldır, `.pgdata`'yı repo dışına taşı |
| 4 | GUV-02, KOD-02 | Team Head başka Unit'in kullanıcısını, Unit Head'i ya da Direktör'ü kendi Ekibine ekleyip Üst yöneticisi oluyor | P0 / P0 | CONFIRMED | M | `yetki/` içine `uyeEklenebilir`: kapsam dışındaki yöneticiler ve Direktör reddedilsin; başka Ekipteki Çalışan için ürün kararı alınsın (yoksa `calisanTasi` kullanılsın); seam testi yaz |

#### B. P0, yalnız Prod (Demo'da P2)

| # | Id'ler | Başlık | Demo / Prod | Hüküm | Efor | Düzeltme |
|---|---|---|---|---|---|---|
| 5 | GUV-B3 | Rate limiting yok (giriş ucu dahil) | P2 / P0 | CONFIRMED | S | Giriş ve API uçlarına rate limit ekle |
| 6 | GUV-08, KOD-16, GUV-B5 | Superuser ve varsayılan kimlik bilgileriyle DB bağlantısı; denetim izinde TRUNCATE ve erken arşivleme açık | P2 / P0 | CONFIRMED | M | Tablonun sahibi olmayan ayrı bir uygulama rolü ve gizli parola kullan; `REVOKE TRUNCATE, DELETE, UPDATE`, yalnız `UPDATE(arsivlendi)`; `BEFORE TRUNCATE` tetikleyicisi; arşivlemeye yalnız saklama süresi dolunca izin ver |
| 7 | GUV-B4 | TLS yok | P2 / P0 | CONFIRMED | M (karar tahmini; kaynakta efor verilmemiş) | TLS sonlandıran bir reverse proxy ve sertifika |
| 8 | KOD-05, GUV-B1, GUV-B2 | Taklit edilebilir mock login; token'sız kullanıcı listesi | P2 / P0 | CONFIRMED | L (KOD imzalı token için S veriyor; ancak Prod'da kimlik bilgisi isteyen gerçek bir giriş ya da SSO gerekli) | Gerçek kimlik doğrulama, imzalı/rastgele oturum kimliği, `mockKullanicilar` bir config bayrağının arkasına |

#### C. P1, her iki ortamda

| # | Id'ler | Başlık | Demo / Prod | Hüküm | Efor | Düzeltme |
|---|---|---|---|---|---|---|
| 9 | KOD-08 | Diğer org yazımlarında `...g` (`uyeEkle`, `ekipOlustur`); `calisanTasi` çakışan üyelik üretiyor | P1 / P1 | CONFIRMED | S | Açık alan listesi (#1 ile aynı değişiklik); `eski === yeni` ve zaten aktif üyelik reddedilsin; `kullaniciBul` çağrılsın |
| 10 | KOD-09 | Etkinlik `davetliIds` ile kapsam dışından davet | P1 / P1 | CONFIRMED | S | `yetki/` içine `davetEdebilir`; seam testi yaz |
| 11 | KOD-11 | `ekipDuzenle` Ekip→Unit bağını yerinde değiştiriyor; geçmiş yapı ve raporlar yeniden yazılıyor (ADR-0002) | P1 / P1 | CONFIRMED | S (yasak) / L (tarih aralıklı bağ) | Kısa vadede Unit değişikliğini yasakla; kalıcı çözüm tarih aralıklı Ekip→Unit bağı |
| 12 | KOD-13 | Rapor yöneticiye atanan Task'ları ve bekleyen kabul süresini saymıyor | P1 / P1 | CONFIRMED | S | `ekipId` için `kullaniciEkibi` fallback'i; BEKLIYOR adımlarda süre `simdi − baslangic` |
| 13 | UX-01 | "Kabul et" sonrası kabul zinciri yenilenmiyor, ikinci tıklama hata veriyor | P1 / P1 | CONFIRMED | S | İşlem başarılı olunca zinciri yeniden çek; işlem sürerken düğmeleri devre dışı bırak |
| 14 | UX-04 | Pano 1280px'e sığmıyor; Reddedildi ve İptal ekran dışında | P1 / P1 | CONFIRMED | S | Pano sayfasında `main` genişlik sınırını kaldır, terminal sütunları daralt, `.arac { flex-wrap: wrap }` |
| 15 | UX-05 | Tarihçe kart içinde okunamıyor, aktör gösterilmiyor | P1 / P1 | CONFIRMED | S | Tarihçeyi kartın altına taşı, `kisiAdi` ekle, durum ve kabul tarihçelerini birleştir |
| 16 | UX-06 | Bekleyen işlerim'den Task kabulüne ulaşılamıyor | P1 / P1 | CONFIRMED | S (bağlantı) / M (satır içi işlem) | Satırda `KabulKontrolleri` ya da Task'a odaklanan bir bağlantı |
| 17 | GUV-04, KOD-06, KOD-07, UX-11 | Hata işleyici iç bilgi sızdırıyor (Prisma, dosya yolu, `where` ağacı); geçersiz girdi 500 dönüyor; arayüz ham metni basıyor | P1 / P1 | CONFIRMED | S (işleyici) + M (doğrulama) | 500'de genel mesaj, ayrıntı yalnız logda; body-parser 4xx ve `PrismaClientValidationError` → 400; adaptörlerde tip, enum ve tarih doğrulaması; `api.ts` 5xx için genel bir Türkçe mesaj göstersin |
| 18 | GUV-06, KOD-23 | Kabul edilmiş, reddedilmiş ya da kapalı Task'ın içeriği değiştirilebiliyor | P1 / P1 | CONFIRMED | M | Düzenleme yetkisi `yetki/` altında rol × durum matrisi olsun; kabulden sonra kapsam değişirse yeniden kabul ya da bildirim; kapalı Task kilitlensin |
| 19 | KOD-10 | Taşınan Çalışan'ın açık Task'ları eski Ekipte kalmıyor | P1 / P1 | CONFIRMED | M | Görünürlük ve durum yetkisine "`task.ekipId`'yi yöneten" koşulunu ekle; spec çelişkisini netleştir |
| 20 | KOD-12 | Ret raporu ve kabul bekleme süresi Task'ın o anki Ekibine yazılıyor | P1 / P1 | CONFIRMED | M | Adımları `kararVerenEkipId` / `requesterEkipId` ile kapsamla; seam testi yaz |
| 21 | KOD-15 | Güvenlik ve iş kurallarının seam testleri eksik | P1 / P1 | CONFIRMED | M | Her kural için, kural kaldırılınca kırmızıya dönen bir test (öncelik #1–#4 ve #9'un kuralları) |
| 22 | UX-02, KOD-14 | Ret gerekçesi ve Bloklu nedeni `window.prompt` ile soruluyor; boş Bloklu nedeni sessizce iptal ediliyor | P1 / P1 | CONFIRMED | M | Ortak `GerekceFormu`: satır içi textarea, zorunlu alan doğrulaması, hata alanın yanında |
| 23 | UX-03 | Durum düğmeleri role göre filtrelenmiyor; hata karttan uzakta çıkıyor | P1 / P1 | CONFIRMED | M | Sunucu `izinliGecisler` dönsün (ADR-0001), düğmeler buna göre çizilsin; hata kart içinde gösterilsin. KOD-17'nin web kısmıyla aynı kök neden |
| 24 | UX-07 | Denetim izi için arayüz yok | P1 / P1 | CONFIRMED | M | Yalnız Direktör'e görünen `Denetim.tsx`: işlem filtresi ve ajan işlemi etiketi |

#### D. P1, yalnız Prod (Demo'da P2)

| # | Id'ler | Başlık | Demo / Prod | Hüküm | Efor | Düzeltme |
|---|---|---|---|---|---|---|
| 25 | UX-10 | Geri alınamaz işlemler (İptal, Team Head kaldırma, Çıkar, Taşı) onay istemiyor | P2 / P1 | CONFIRMED | S | Ortak bir `OnayDugmesi`; "Taşı" için önce seç, sonra onayla |
| 26 | GUV-11 | Güvenlik başlıkları yok, `x-powered-by` açık, token localStorage'da | P2 / P1 | CONFIRMED | S (başlıklar) / M (oturum) | CSP, `nosniff`, `frame-ancestors 'none'`, `disable('x-powered-by')`; SSO ile HttpOnly + SameSite çerez |
| 27 | GUV-07 | Girdi boyutu ve adedi sınırsız; ham gövde denetim izine yazılıyor | P2 / P1 | CONFIRMED | M | Alan başına uzunluk ve adet sınırı, şema doğrulaması; denetim `veri`'sine yalnız doğrulanmış alanlar |

### Devreye alım sonrası backlog (P2, her iki ortamda)

| # | Id'ler | Başlık | Hüküm | Efor |
|---|---|---|---|---|
| 28 | GUV-09 | Başarısız ve reddedilen ajan işlemleri denetim izine yazılmıyor (HTTP'de ajan token'ı yok) | CONFIRMED | S |
| 29 | GUV-10 | Geçmiş tarihli organizasyon görünümü eski üyelik üzerinden üye listesini açıyor | CONFIRMED | S |
| 30 | GUV-12, KOD-27 | Bağımlılık açıkları: vitest/tinypool, picomatch, deepmerge-ts (çalışma zamanında erişilemez) | CONFIRMED (`npm audit`); erişim yolu yok | S (vite/vitest) / L (Prisma 7) |
| 31 | KOD-19 | Bekleyen işlerim'de davet yaşı etkinlik başlangıcından hesaplanıyor | CONFIRMED | S |
| 32 | KOD-20 | Team Head'siz Ekibe yayınlanan Duyuru Sorumlu yöneticiye bildirim göndermiyor | CONFIRMED | S |
| 33 | KOD-22 | `kabulEt` / `reddet` görünmeyen Task'ın varlığını ve durumunu sızdırıyor | CONFIRMED | S |
| 34 | KOD-25 | Rapor: bugün termini olan Task geciken sayılıyor; REDDEDILDI "kapalı" sayılıyor | CONFIRMED | S |
| 35 | UX-08 | Rapor filtresi kapsam dışı Unit'leri sunuyor; hatada eski veri yerinde kalıyor | CONFIRMED | S |
| 36 | UX-12 | Hata mesajları işlemin yanında değil, temizlenmiyor; başarı geri bildirimi yok | CONFIRMED | S |
| 37 | UX-13 | Öncelik ham enum olarak gösteriliyor | CONFIRMED | S |
| 38 | UX-14 | Gecikme yalnızca renkle belirtiliyor | CONFIRMED | S |
| 39 | UX-15 | Form alanlarının etiketi yok; ikon düğmelerde `aria-label` yok | CONFIRMED | S |
| 40 | UX-16 | İstemci tarafında doğrulama yok; bazı işlemler sessizce yok sayılıyor | CONFIRMED | S |
| 41 | UX-17 | Etkin görünüm `disabled` düğmeyle gösteriliyor; `aria-current` yok | CONFIRMED | S |
| 42 | UX-18 | Dar pencerede başlık sarmıyor; Çıkış ekran dışında kalıyor | CONFIRMED | S |
| 43 | UX-19 | Bildirimler ilgili kayda götürmüyor | CONFIRMED | S |
| 44 | UX-20 | Boş durumlar yönlendirmiyor; Yetkinlik bitişi vurgulanmıyor | CONFIRMED | S |
| 45 | UX-22 | Tarih gösterimi: saniye ve saat dilimi kayması | CONFIRMED | S |
| 46 | UX-23 | Kısa süreler 0 olarak gösteriliyor | CONFIRMED | S |
| 47 | UX-24 | Soluk metnin kontrastı yetersiz (4.19:1) | CONFIRMED | S |
| 48 | KOD-17 | İzin kararları `yetki/` dışında yazılmış (ADR-0001), sunucu ve web | CONFIRMED | M |
| 49 | KOD-18 | Arşivlenmiş Ekip ve Kullanıcı hâlâ yetki çözümlemesinde sayılıyor; arşivleme servisi gelince P1 olur | CONFIRMED | M |
| 50 | KOD-21 | Sertifika hatırlatma işi `yaz` dışından yazıyor | CONFIRMED | M |
| 51 | UX-21 | Birden çok Ekibin Team Head'i için Ekip filtresi ve bağlam yok | CONFIRMED | M |
| 52 | KOD-24 | Çok Ekipli Çalışan'ın Sorumlu yöneticisi belirsiz | PLAUSIBLE | S |
| 53 | KOD-26 | GLOSSARY _Avoid_ listesindeki "Oluşturan" kullanılıyor | PLAUSIBLE | S |

**Birlikte yapılırsa ucuzlayan düzeltmeler:**
- #1, #9 ve #27 aynı kök nedenden geliyor: açık alan listesi ve şema doğrulaması.
- #2, #23 ve #48'in web kısmı aynı değişiklikle çözülüyor: `izinliGecisler` / `izinler`.
- #3'ün Prod adımı ile #30'daki vite yükseltmesi aynı iş.

## 4. NO-GO'yu GO'ya çevirmek için gereken minimal set

### Demo

- **NO-GO → KOŞULLU GO:** #1–#4 kapanmalı.
  - Id'ler: {GUV-01/KOD-01, GUV-03/KOD-03/UX-09, GUV-05/KOD-04, GUV-02/KOD-02}
  - #3 için Demo adımı (S) yeterli.
  - Ardından §2'deki tabloya göre her P1 ya düzeltilir ya da sahip ve tarihle kabul edilir.
- **NO-GO → GO:** Yukarıdaki 4 kayıt ve Demo'daki 16 P1 kaydının tamamı (#9–#24):
  - KOD-08, KOD-09, KOD-11, KOD-13
  - UX-01, UX-04, UX-05, UX-06
  - GUV-04/KOD-06/KOD-07/UX-11
  - GUV-06/KOD-23
  - KOD-10, KOD-12, KOD-15
  - UX-02/KOD-14, UX-03, UX-07

### Prod

- **NO-GO → KOŞULLU GO:** 8 P0 kaydı kapanmalı.
  - #1–#4 (#3 için Prod adımı, M)
  - #5–#8: GUV-B3, GUV-08/KOD-16/GUV-B5, GUV-B4, KOD-05/GUV-B1/GUV-B2
- **NO-GO → GO:** Bu 8 kayıt ve 19 P1 kaydı:
  - #9–#24
  - #25 UX-10, #26 GUV-11, #27 GUV-07

### Not: Prod'da tek başına yetmeyen düzeltmeler
- **#3 (GUV-05/KOD-04):** Host bağlama ve vite yükseltmesi Prod'u kurtarmaz. Bugün tek giriş noktası `dev.ts`. Prod derleme ve sunum yolu henüz yok.
- **#8 (KOD-05):** İmzalı mock token Prod'da yetmez. Giriş ucu hâlâ kimlik bilgisi istemeden kullanıcı seçtiriyor.

## 5. Kapsam boşlukları (karara güveni sınırlayanlar)

- **UI yeniden tasarımı birleştirilmedi:** `ui/secopsgrid` dalında bir UI redesign bekliyor.
  - Birleşince UX bulgularının bir kısmı geçersiz kalabilir. En çok görsel ve yerleşim bulguları etkilenir: UX-04, 05, 13, 14, 15, 17, 18, 20, 22, 23, 24.
  - Davranış kaynaklı olanlar (UX-01, 02, 03, 06, 07, 10) taşınmış da olabilir.
  - Redesign birleşince `ux` kontrolü yeniden çalıştırılmalı. Bu dal bu kararda incelenmedi.
- **Commit uyumu doğrulanmadı:**
  - `guvenlik` ve `kod` `9519f0e` üzerinde çalıştı.
  - `ux` main checkout'ta çalışan uygulamayı inceledi ve commit belirtmedi.
  - Üç kontrolün aynı kodu gördüğü doğrulanmadı.
- **Prod yolu yok:** Prod derleme ve dağıtım yolu yok. Prod sınıfları dev sunucusu (Vite middleware) üzerinden değerlendirildi. Gerçek dağıtım topolojisi (proxy, TLS, DB rolü) incelenemedi.
- **Uygulanmamış ticket'lar test edilemedi:**
  - Delegasyon ve Ekip havuzu (06)
  - Ekler (07)
  - Vekil ve eskalasyon (09)
  - Dış etkinlik onayı (11)
  - REST/MCP ajan token'ları (13/14)
  
  Bu yüzden şunlar hiç denenmedi: Vekil'in kendi talebini onaylaması, HTTP üzerinden ajan token kapsamı, ek dosyalarının tip ve boyutu.
- **Eşzamanlılık incelenmedi:** örneğin iki onaylayıcının aynı adımı aynı anda kabul etmesi.
- **Tarayıcı ve erişilebilirlik:**
  - XSS tarayıcıda denenmedi; yalnız kaynaktan bakıldı.
  - Klavye gezintisi ve ekran okuyucu gerçek cihazda denenmedi.
  - KOD-14 ve KOD-17'nin web kısmı kaynaktan izlendi.
- **Kısmen kod okumasıyla doğrulananlar:** KOD-08'in `unitHeadAta` ve `ekipOlustur` kısmı. KOD-24 ve KOD-26 PLAUSIBLE.
- **Rapor tarih aralığı filtresi:** henüz yok (ticket 12); sınır testleri yapılamadı.
- **Dev DB'si:** her başlangıçta yeniden kuruluyor. UX ekran görüntülerinde test sırasında yapılan değişiklikler görünüyor (bkz. `ux.md`).
- **`guvenlik.md`'nin kaynağı:** worktree'de yazılıp ana checkout'a kopyalandı. Bu kararda içeriğinin eksiksiz olduğu varsayıldı.
