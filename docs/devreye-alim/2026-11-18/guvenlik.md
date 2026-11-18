# Devreye alım — Güvenlik kontrolü (`guvenlik`)

- Tarih: 2026-11-18
- İncelenen kod: entegrasyon dalı ucu `9519f0e` (tüm kod tabanı; sabit nokta verilmedi)
- Skill: `review-security` (ADR-0001 tek yetki servis katmanı, ADR-0002 eklemeli denetim izi)
- Yöntem:
  - kaynak okuma
  - `useTestDb` ve `F` fixture ile kazıma (scratch) seam testi
  - `PORT=5181 npm run dev` üzerinde canlı istek

  Probe dosyası silindi, dev sunucusu durduruldu.

## Özet

| Sınıf | Demo | Prod |
|---|---|---|
| P0 | 2: GUV-01, GUV-03 | 3: GUV-01, GUV-03, GUV-05 (+ bilinen demo boşlukları) |
| P1 | 4: GUV-02, GUV-04, GUV-05, GUV-06 | 6: GUV-02, GUV-04, GUV-06, GUV-07, GUV-08, GUV-11 |
| P2 | 6: GUV-07, GUV-08, GUV-09, GUV-10, GUV-11, GUV-12 (+ bilinen demo boşlukları) | 3: GUV-09, GUV-10, GUV-12 |

En kötü bulgu **GUV-01**: bir Unit Head tek bir `POST /api/organizasyon/team-head-ata` isteğiyle kendini Direktör yapıyor.

---

## Bulgular

### GUV-01 — Team Head / Unit Head atamasında mass assignment: Unit Head kendini Direktör yapıyor
- **P sınıfı:** Demo **P0** / Prod **P0**
- **Önem:** critical · **Verdict:** CONFIRMED · **Tehdit:** mass assignment ile dikey yetki yükseltme
- **Yer:**
  - `src/server/modules/organizasyon/yonetim.ts:157` (`teamHeadAta`: `data: { tur: 'TEAM_HEAD', ...g, ... }`)
  - Aynı desen: `:93` (`unitHeadAta`) ile `where` içinde `...g` kullanan `:155`, `:91`, `:169`
  - Gövde `src/server/http/organizasyon.ts:18` üzerinden olduğu gibi geçiyor.
- **Senaryo:** Unit Head `uhSavunma` şu isteği gönderiyor: `POST /api/organizasyon/team-head-ata {"ekipId":"ekip-waf","kullaniciId":"u-uh-savunma","tur":"DIREKTOR","direktorlukId":"dir-siber"}`. Yetki kontrolü yalnızca `ekipId`'nin Unit'ine bakıyor (`unitYonetebilir`). Gövdedeki `tur`, sabit `'TEAM_HEAD'` değerinin üstüne yazılıyor.
  - Gözlenen:
    - 200 döndü ve `Yoneticilik{tur:'DIREKTOR'}` oluştu. `ben().roller` önce `['UNIT_HEAD']`, sonra `['DIREKTOR','UNIT_HEAD']`.
    - Aynı kullanıcı ardından `GET /api/denetim` için 200 aldı. Denetim izi yalnızca Direktör'e açık olmalı.
    - `POST /organizasyon/unit` için de 200 aldı.
    - Varyant: `tur:'UNIT_HEAD', unitId:'unit-istihbarat'` ile başka bir Unit'in Unit Head'i oluyor. CTI üyelerini görüyor, `yonetebilir=true` alıyor.
    - Denetim izine işlem `organizasyon.teamHeadAta` olarak yazılıyor. Yükseltme ancak `veri.tur` okunursa fark ediliyor.
  - Beklenen: 403 dönmeli ya da yalnızca bir `TEAM_HEAD` satırı oluşmalı. Spec'e göre Unit Head yalnızca kendi Unit'indeki Team Head atamasını yapar.
- **Düzeltme:**
  - Prisma `data` ve `where` içine alanları tek tek yaz: `{ tur: 'TEAM_HEAD', ekipId: g.ekipId, kullaniciId: g.kullaniciId, gecerliBaslangic: t }`.
  - Aynısını `unitHeadAta`, `ekipOlustur` (`...g`) ve `uyeEkle` (`...g`) için yap.
  - Gövde şeması doğrulaması ekle.
  - Seam testi ekle: mass assignment ile `tur` değiştirilemez.
  - **Efor: S**

### GUV-02 — Team Head herhangi bir kullanıcıyı (başka Unit'in Çalışanı, Unit Head, Direktör) kendi Ekibi'ne ekleyip Üst yönetici yetkisi kazanıyor
- **P sınıfı:** Demo **P1** / Prod **P1**
  - Taban sınıf P1. CONFIRMED yetki bulgusu olduğu için P0'a çıkıyor.
  - Gerekçeyle bir sınıf iniyor: spec "Team Head kendi Ekibi'ne onay gerektirmeden üye ekler/çıkarır" diyor. Kimin eklenebileceği bir ürün kararı.
- **Önem:** high · **Verdict:** CONFIRMED · **Tehdit:** dikey yükseltme / liste sızıntısı / zincir bypass
- **Yer:**
  - `src/server/modules/organizasyon/yonetim.ts:120-131` (`uyeEkle`): yalnızca `ekipYonetebilir(ekipId)` kontrol ediliyor, eklenen kişi kontrol edilmiyor.
  - Etki şu yollardan yayılıyor: `yetki/task.ts:25-31` (`altKullanicilar`), `yetki/cozumleme.ts:75-78` (`ustYoneticiler`), `yetki/kabul.ts:46` (direkt kabul).
- **Senaryo:** `thCoklu` (WAF/SOC Team Head'i, Savunma) şu isteği gönderiyor: `POST /api/organizasyon/uye-ekle {"ekipId":"ekip-waf","kullaniciId":"u-cti1"}`.
  - Gözlenen:
    - 200 döndü.
    - `cti1`'in (İstihbarat) kendine açtığı Task, `thCoklu`'nun listesinde önce görünmüyordu (0), sonra göründü (1).
    - `thCoklu` → `cti1` ataması **KABUL_EDILDI** oldu. cti1'in kabul adımı ve CTI Sorumlu yöneticisinin onayı atlandı.
    - `thCoklu` aynı yolla Unit Head `uhIstihbarat`'ı da WAF'a ekleyebildi (200). Böylece onun Task, Etkinlik ve Yetkinlik kayıtlarını görüyor ve Task durumunu değiştirebiliyor.
  - Beklenen: Başka bir Ekip ya da Unit'e bağlı kişi, onun yöneticisinin katılımı olmadan sahiplenilememeli. `calisanTasi` iki Ekibi de yönetmeyi zaten şart koşuyor.
- **Düzeltme:**
  - Seçenek (a): eklenen kişinin aktif bir üyeliği varsa, o Ekip de çağıranın kapsamında olsun. Değilse `calisanTasi` kullanılsın.
  - Seçenek (b): yönetici rolündeki kullanıcılar üye olarak eklenemesin.
  - Hangi seçeneğin uygulanacağına ürün karar vermeli. Seam testi ekle.
  - **Efor: M**

### GUV-03 — Assignee ve onun Üst yöneticisi, Kabul Bekliyor bir Task'ı reddetmek yerine İptal edebiliyor: Ret gerekçesi ve yeniden atama atlanıyor
- **P sınıfı:** Demo **P0** / Prod **P0**. CONFIRMED kabul zinciri bypass'ı, çekirdek accept/refuse akışında.
- **Önem:** medium · **Verdict:** CONFIRMED · **Tehdit:** zincir bypass
- **Yer:**
  - `src/server/modules/task/durum.ts:20` (`KABUL_BEKLIYOR: ['IPTAL']`) ve `:74-78`
  - `src/server/modules/yetki/task-durum.ts:14-17`: Assignee ve Üst yöneticiler `TAM` yetki alıyor, Task'ın durumuna bakılmıyor.
- **Senaryo:** `waf1` → `cti1` Task'ı açılıyor (KABUL_BEKLIYOR). `cti1` şunu gönderiyor: `POST /api/tasks/:id/durum {"durum":"IPTAL"}`.
  - Gözlenen:
    - 200 döndü, Task IPTAL oldu.
    - Ret gerekçesi alınmadı, `KabulAdimi` BEKLIYOR kaldı, ret raporuna hiçbir şey düşmedi.
    - Requester'ın `POST /api/kabul/tasks/:id/yeniden-ata` isteği 400 aldı ("Task reddedilmiş değil").
    - Ayrıca `thCti` (cti2'nin Team Head'i), başka bir Unit'in kendi ekibine açtığı kabul bekleyen Task'ı tek başına iptal edebildi (200).
  - Beklenen: Kabul Bekliyor'da İptal yalnızca Requester ve Direktör'e açık olmalı. Onaylayıcı yalnızca kabul ya da ret ile karar vermeli. Spec: "Ret gerekçesi zorunludur."
- **Düzeltme:**
  - `durumDegistir` içinde, `mevcut.durum` `KABUL_BEKLIYOR` ya da `TASLAK` iken yalnızca `yetki === 'IPTAL'` (Requester) veya Direktör kabul edilsin.
  - Kural `yetki/task-durum.ts` içinde yaşasın. Seam testi ekle.
  - **Efor: S**

### GUV-04 — Hata işleyici iç bilgileri sızdırıyor (Prisma sorgusu, dosya yolu, kaynak satırları); doğrulanmayan girdi 500'e dönüyor
- **P sınıfı:** Demo **P1** / Prod **P1**
- **Önem:** medium · **Verdict:** CONFIRMED · **Tehdit:** çıktı (iç bilgi sızıntısı) + girdi doğrulama
- **Yer:**
  - `src/server/http/app.ts:56-61`: 500'de `err.message` olduğu gibi dönüyor.
  - Tetikleyiciler:
    - `http/task.ts:16`: `req.query.durum` dizi olabiliyor.
    - `modules/task/index.ts:117-120`: enum doğrulaması yok.
    - `modules/task/durum.ts:79`: `d.neden?.trim`.
    - `modules/kabul/index.ts:191`.
    - `http/app.ts:45` ve `http/dashboard.ts:13-14`: `?tarih=xyz`, `?ekipId=a&ekipId=b`.
- **Senaryo:**
  - `waf1` → `PATCH /api/tasks/:id {"oncelik":"HACK"}`: 500. Gövdede `Invalid tx.task.update() invocation in /Users/.../src/server/modules/task/index.ts:120:36`, kaynak satırları ve sorgunun yapısı var.
  - `GET /api/tasks?durum=A&durum=B`: 500. Görünürlük filtresinin tüm `where` ağacı sızıyor (`requesterId`, ekip id'leri).
  - `POST /tasks/:id/durum {"durum":"BLOKLU","neden":5}`: 500, mesaj `d.neden?.trim is not a function`.
  - `GET /api/organizasyon?tarih=xyz`: 500, `cozumleme.ts` kaynağı görünüyor.
  - Beklenen: Geçersiz girdide 400 `DOGRULAMA`, 500'de genel bir mesaj.
- **Düzeltme:**
  - 500'de `{hata:'SUNUCU', mesaj:'Beklenmeyen hata'}` dön, ayrıntıyı yalnızca logla. `PrismaClientValidationError` → 400.
  - Adaptörlerde sorgu ve gövde için tip/enum doğrulaması ekle.
  - **Efor: S** (handler) + **M** (doğrulama)

### GUV-05 — Demo Vite dev sunucusundan, tüm arayüzlerde yayınlanıyor: kaynak kod ve ham DB dosyaları kimlik doğrulamasız okunabiliyor
- **P sınıfı:** Demo **P1** / Prod **P0**
  - Demo'da bir sınıf aşağı: mock login zaten herkese tüm veriyi açıyor (bilinen boşluk). Buradaki ek etki kaynak kod ve DB dosyalarının açılması.
  - Prod'da bu, kimlik doğrulamasız tam veri okuma demek.
- **Önem:** high · **Verdict:** CONFIRMED · **Tehdit:** web yapılandırması / bağımlılık (vite 7.1.12, `npm audit` high)
- **Yer:**
  - `src/server/dev.ts:38-41`: `app.listen(PORT)` host vermiyor; `lsof` `*:5181` gösteriyor.
  - `vite.config.ts`: `root: 'src/web'`; `server.fs.allow` varsayılan olarak repo kökü. `.pgdata/` repo kökünün içinde.
- **Senaryo (token'sız):**
  - `GET /@fs/<repo>/src/server/db/postgres.ts` → 200: sunucu kaynağı ve DB parolası `postgres`.
  - `GET /@fs/<repo>/.pgdata/postgresql.conf` → 200.
  - `GET /@fs/<repo>/.pgdata/base/16384/16531?raw` → 200. Bu `"Kullanici"` tablosunun dosyası; checkpoint sonrası içinde `direktor@siber.example`, `cti1@siber.example` vb. var. `DenetimKaydi` ve `Task` dosyaları da aynı yolla okunabilir.
  - `/@fs/etc/passwd` (repo dışı) → 403.
  - Beklenen: Sunucu dosyaları ve DB verisi HTTP üzerinden hiç sunulmamalı.
- **Düzeltme:**
  - Demo: `app.listen(PORT, '127.0.0.1')` ve `server.fs.deny` listesine `.pgdata/**` ekle (S).
  - Prod: `vite build` çıktısını statik sun, Vite middleware'ini kaldır, `.pgdata`'yı repo dışına taşı (M).
  - vite ≥ 7.3.7 (S).

### GUV-06 — Kabul edilmiş Task'ın içeriğini Requester ve Ekip üyeleri sonradan değiştirebiliyor
- **P sınıfı:** Demo **P1** / Prod **P1**. Taban P2 (tasarım boşluğu); CONFIRMED yetki/kabul bütünlüğü bulgusu olduğu için bir sınıf yukarı.
- **Önem:** medium · **Verdict:** CONFIRMED · **Tehdit:** zincir bütünlüğü
- **Yer:** `src/server/modules/task/index.ts:113-122` (`guncelle`: Task'ı gören herkes, durumdan bağımsız)
- **Senaryo:** `waf1` → `cti1` Task'ını `cti1` ve `thCti` kabul ediyor (KABUL_EDILDI). Ardından `waf1` şunu çağırıyor: `guncelle {baslik:'Tüm sunucuları yeniden kur', oncelik:'KRITIK'}`.
  - Gözlenen:
    - İstek başarılı. Kabul artık farklı bir iş için geçerli görünüyor, onaylayıcılara bildirim gitmiyor.
    - `waf2`, Ekip'e atanmış bir Task'ın başlığını değiştirebiliyor.
    - IPTAL, REDDEDILDI ve TAMAMLANDI durumundaki Task'lar da düzenlenebiliyor.
  - Beklenen:
    - Kabulden sonra kapsamı değiştiren alanlar (başlık, açıklama, öncelik, termin) ya kilitlenmeli ya da yeniden kabul ve bildirim tetiklemeli.
    - Kapalı Task'lar düzenlenmemeli.
    - Değişikliğin denetim izine yazılması doğru, bu kısım kalmalı.
- **Düzeltme:**
  - Düzenleme kuralını `yetki/` altına taşı (rol × durum matrisi).
  - Requester kabulden sonra kapsamı değiştirirse Assignee'ye bildirim git ya da yeniden kabul iste.
  - **Efor: M**

### GUV-07 — Girdi boyutu ve tipi sınırsız; ham istek gövdesi denetim izine yazılıyor
- **P sınıfı:** Demo **P2** / Prod **P1**. Demo'da bir sınıf aşağı: iç pilot, kullanıcılar tanınıyor, mock login zaten tam erişim veriyor.
- **Önem:** low · **Verdict:** CONFIRMED · **Tehdit:** girdi
- **Yer:**
  - `src/server/http/app.ts:36`: gövde sınırı 1 MB.
  - `modules/task/index.ts:62-84`: `baslik`, `aciklama` ve `etiketler` için uzunluk ya da adet sınırı yok.
  - `modules/organizasyon/yonetim.ts:34,46,56,68,115,129,144`: `veri: g` ile gövdenin tamamı denetim izine yazılıyor.
- **Senaryo:**
  - `waf1` → `POST /api/tasks {baslik: 900 000 karakter, etiketler: 5000 öğe}` → 200.
  - Yönetim uçlarına gönderilen rastgele JSON alanları `DenetimKaydi.veri`'ye kalıcı olarak yazılıyor. Kayıt silinemediği için tablo kalıcı olarak şişiyor.
- **Düzeltme:** Alan başına uzunluk ve adet sınırı koy, şema doğrulaması yap. Denetim `veri`'sine yalnızca doğrulanmış alanları yaz. **Efor: M**

### GUV-08 — Denetim izi koruması TRUNCATE'i kapsamıyor; uygulama DB'ye superuser olarak bağlanıyor
- **P sınıfı:** Demo **P2** / Prod **P1**
  - Taban P2; CONFIRMED denetim bulgusu olduğu için bir sınıf yukarı.
  - Demo'da gerekçeyle geri iniyor: uygulama kodunda TRUNCATE ya da kullanıcı girdisiyle çalışan ham SQL yolu yok; açık ancak DB erişimiyle kullanılabilir (bilinen demo boşluğu).
- **Önem:** low · **Verdict:** CONFIRMED · **Tehdit:** denetim bütünlüğü
- **Yer:**
  - `prisma/sql/denetim.sql:16-19`: yalnızca `BEFORE UPDATE OR DELETE ... FOR EACH ROW`.
  - `src/server/db/postgres.ts:33-34,53`: `postgres` superuser'ı ile bağlanıyor.
- **Senaryo:**
  - `girisYap` sonrası `TRUNCATE "DenetimKaydi"` başarılı, kayıt sayısı 0 oluyor.
  - `select rolsuper ... current_user` → `true`. Superuser ayrıca `ALTER TABLE ... DISABLE TRIGGER` çalıştırabilir.
  - Beklenen: Uygulama rolü DenetimKaydi'yi silememeli ya da boşaltamamalı.
- **Düzeltme:**
  - Tablonun sahibi olmayan ayrı bir uygulama rolü kullan.
  - Bu rolden `REVOKE TRUNCATE, DELETE, UPDATE ON "DenetimKaydi"`. Arşivleme için yalnızca kolon bazlı `UPDATE(arsivlendi)` ver.
  - `BEFORE TRUNCATE` deyim tetikleyicisi ekle.
  - **Efor: S**

### GUV-09 — Başarısız ajan işlemleri denetim izine yazılmıyor; REST/MCP ajan token yolu henüz yok
- **P sınıfı:** Demo **P2** / Prod **P2**. Denetim bulgusu olarak yukarı çıkıyor, gerekçeyle geri iniyor: HTTP katmanında ajan token'ı çözülmüyor (`oturum.tokenCoz` her zaman insan Actor döndürüyor), yani bu yol şu an dışarıdan erişilemez.
- **Önem:** low · **Verdict:** CONFIRMED · **Tehdit:** ajan kapsamı / denetim
- **Yer:**
  - `src/server/modules/yetki/index.ts:54-58`: `oku` ajan kaydını yalnızca gövde başarılı olursa yazıyor.
  - `:72`: kapsam reddi kaydedilmiyor.
  - `src/server/modules/oturum/index.ts:21-24`.
- **Senaryo:**
  - `ajan(waf1)` → `denetim.listele`: YETKI hatası, `denetim.listele` kayıt sayısı 0.
  - Salt okunur ajanın yazma denemesi doğru şekilde reddediliyor (YETKI).
  - Başarılı ajan işlemleri `ajan:true` olarak işaretleniyor (mevcut test).
- **Düzeltme:** Ajanın reddedilen ve başarısız işlemlerini de bir sonuç alanıyla denetim izine yaz. Ticket 13'te token → `ajan()` çözümü için seam testi ekle. **Efor: S**

### GUV-10 — Geçmiş tarihli organizasyon görünümü, eski üyelik üzerinden üye listelerini açıyor
- **P sınıfı:** Demo **P2** / Prod **P2**
- **Önem:** low · **Verdict:** CONFIRMED · **Tehdit:** liste sızıntısı
- **Yer:** `src/server/modules/organizasyon/index.ts:63-67`: kapsam `t = opts.tarih` anına göre çözülüyor.
- **Senaryo:**
  - SOC'a taşınan `waf1`, `GET /api/organizasyon?tarih=2025-06-01` ile WAF üyelerini (2 kişi) hâlâ görüyor.
  - Eski bir Team Head de eski Ekibinin geçmiş üye listesini görebilir.
  - ADR-0002 tarihsel yapıyı istiyor, ama erişim yetkisi bugünkü kapsamdan çözülmeli.
- **Düzeltme:** Görünürlüğü `kimlik.zaman` anındaki kapsamla çöz, yapıyı `tarih` anına göre göster. **Efor: S**

### GUV-11 — Güvenlik başlıkları yok, `x-powered-by` açık, token localStorage'da
- **P sınıfı:** Demo **P2** / Prod **P1**
- **Önem:** low · **Verdict:** CONFIRMED · **Tehdit:** web yapılandırması
- **Yer:** `src/server/http/app.ts:34-37`, `src/web/api.ts:1-19`
- **Senaryo:**
  - `GET /api/ben` yanıtında CSP, `X-Frame-Options`/`frame-ancestors` ve `X-Content-Type-Options` yok; `x-powered-by: Express` var.
  - Token `localStorage['siber-task-token']`'da duruyor; herhangi bir XSS onu çalabilir.
  - CORS middleware'i yok. Uygulama aynı origin'den sunulduğu için bu doğru.
  - `dangerouslySetInnerHTML` ya da kullanıcıdan gelen `href` bulunmadı; React çıktıyı kaçışlıyor.
- **Düzeltme:** `app.disable('x-powered-by')`. CSP, `nosniff` ve `frame-ancestors 'none'` ekle. SSO ile birlikte HttpOnly + SameSite çerezli oturuma geç. **Efor: S** (başlıklar) / **M** (oturum)

### GUV-12 — Bağımlılık açıkları (çalışma zamanında erişilemez)
- **P sınıfı:** Demo **P2** / Prod **P2**. Erişilemedikleri için bir sınıf aşağı. Vite açıkları GUV-05'te sınıflandırıldı.
- **Önem:** advisory'de high/critical · **Verdict:** PLAUSIBLE (erişim yolu bulunamadı) · **Tehdit:** bağımlılık
- **Yer:** `package.json`
- **Senaryo:**
  - `npm audit --omit=dev`: 3 high. `prisma` → `@prisma/config` → `deepmerge-ts@7.1.5`: özyinelemeli nesne birleştirmede stack exhaustion. Yalnızca CLI yapılandırması yüklenirken kullanılıyor, kullanıcı girdisi bu koda ulaşmıyor.
  - `npm audit`: toplam 10 (1 moderate, 7 high, 2 critical).
    - `vitest@3.2.4`/`tinypool` critical: yalnızca test ve Vitest UI.
    - `vite@7.1.12` high: GUV-05.
    - `picomatch`: ReDoS.
- **Düzeltme:** `vitest` ≥ 3.2.7, `vite` ≥ 7.3.7. Prisma 7 geçişini ayrıca planla. **Efor: S** (vite/vitest) / **L** (Prisma 7)

---

## Bilinen demo boşlukları (bulgu değil; Prod'da P0)

- **Taklit edilebilir mock login:** `Authorization: Bearer mock:<kullaniciId>` herkes adına kullanılabiliyor. `POST /api/oturum/giris {"kullaniciId":"u-direktor"}` kimlik bilgisi olmadan 200 ve Direktör token'ı döndü (`src/server/modules/oturum/index.ts:13-24`).
- **Token'sız kullanıcı listesi:** `GET /api/oturum/mock-kullanicilar` 13 kullanıcıyı ad, unvan ve rolleriyle listeledi (`src/server/http/app.ts:39`).
- **Rate limiting yok:** giriş ucu dahil.
- **Dev'de TLS yok.**
- **Gömülü Postgres:** varsayılan `postgres/postgres` kimlik bilgileri, superuser (`src/server/db/postgres.ts:33-34`).

---

## Erişim matrisi

Tüm rotalar actor'ı `handler(...)` üzerinden çözüyor. `public: true` olan yalnızca iki rota var: `GET /api/oturum/mock-kullanicilar` (giriş ekranı, demo boşluğu) ve `POST /api/oturum/giris` (mock giriş). Diğer tüm rotalar Bearer token istiyor.

| Rota | Servis.metot | Kapı | Kim çağırabilir | Satırlar | Bulgu |
|---|---|---|---|---|---|
| GET /api/oturum/mock-kullanicilar | organizasyon.mockKullanicilar | yok (doğrudan `ctx.db`) | herkes, token'sız | tüm kullanıcılar + roller | demo boşluğu |
| POST /api/oturum/giris | oturum.girisYap | yaz | herkes | token `mock:<id>` | demo boşluğu |
| (adaptör) | oturum.tokenCoz | — | — | Actor; ajan çözümü yok | GUV-09 |
| GET /api/ben | organizasyon.ben | oku | herkes | kendi profili | — |
| GET /api/organizasyon | organizasyon.yapiyiGetir | oku | herkes | iskelet; üyeler yalnızca kendi/yönettiği Ekip için | GUV-04, GUV-10 |
| POST /api/organizasyon/unit | unitOlustur | yaz | Direktör | Unit | — |
| POST /api/organizasyon/ekip | ekipOlustur | yaz | Direktör | Ekip (`...g`) | GUV-01 (desen) |
| PATCH /api/organizasyon/ekip/:ekipId | ekipDuzenle | yaz | Direktör | Ekip ad/unitId | GUV-04 (FK hatası → 500) |
| POST /api/organizasyon/kullanici | kullaniciOlustur | yaz | Direktör | Kullanici | — |
| POST /api/organizasyon/uye-ekle | uyeEkle | yaz | Ekibi yöneten (TH/UH/Dir) | Uyelik (`...g`) | **GUV-02** |
| POST /api/organizasyon/uye-cikar | uyeCikar | yaz | Ekibi yöneten | Uyelik bitişi | — |
| POST /api/organizasyon/calisan-tasi | calisanTasi | yaz | iki Ekibi de yöneten | Uyelik | — |
| POST /api/organizasyon/team-head-ata | teamHeadAta | yaz | Unit'in UH'si, Dir | Yoneticilik (`...g`) | **GUV-01** |
| POST /api/organizasyon/team-head-kaldir | teamHeadKaldir | yaz | Unit'in UH'si, Dir | Yoneticilik bitişi (`where ...g`) | GUV-01 (desen) |
| POST /api/organizasyon/unit-head-ata | unitHeadAta | yaz | Direktör | Yoneticilik (`...g`) | GUV-01 |
| PATCH /api/organizasyon/profil | profilGuncelle | yaz | herkes, yalnızca kendisi | ad/unvan | — |
| GET /api/denetim | denetim.listele | oku | Direktör | arşivlenmemiş DenetimKaydi | GUV-01 ile aşılıyor |
| GET /api/tasks/rehber | task.rehber | oku | herkes | aktif kullanıcılar (id, ad, unvan, ekipler) + Ekipler | — (Assignee seçici için makul) |
| GET /api/tasks | task.listele | oku | herkes | `taskGorunurluk` | GUV-04 |
| POST /api/tasks | task.olustur | yaz | herkes | Task + kabul zinciri | GUV-07 |
| GET /api/tasks/:id | task.getir | oku | görebilen | Task, görünmüyorsa 404 | — |
| PATCH /api/tasks/:id | task.guncelle | yaz | Task'ı gören herkes | Task alanları | **GUV-06**, GUV-04 |
| POST /api/tasks/:id/gonder | task.gonder | yaz | Requester (Taslak) | Task durumu + zincir | — |
| POST /api/tasks/:id/durum | task.durumDegistir | yaz | TAM: Assignee, Ekip üyesi, Üst yönetici, Dir. IPTAL: Requester | Task durumu + tarihçe | **GUV-03**, GUV-04 |
| GET /api/tasks/:id/gecmis | task.durumGecmisi | oku | görebilen | TaskDurumGecisi | — |
| GET /api/kabul/bekleyen | kabul.bekleyenler | oku | herkes | kendi bekleyen adımları | — |
| GET /api/kabul/tasks/:id/zincir | kabul.zincir | oku | görebilen | KabulAdimi | — |
| POST /api/kabul/tasks/:id/kabul | kabul.kabulEt | yaz | aktif adımın onaylayıcısı | KabulAdimi, Task | — |
| POST /api/kabul/tasks/:id/ret | kabul.reddet | yaz | aktif adımın onaylayıcısı, gerekçe zorunlu | KabulAdimi, Task | GUV-04 (gerekçe tipi) |
| POST /api/kabul/tasks/:id/yeniden-ata | kabul.yenidenAta | yaz | Requester (REDDEDILDI) | Task + yeni deneme | — |
| POST /api/kabul/tasks/:id/iptal | kabul.iptalEt | yaz | Requester (REDDEDILDI) | Task | — |
| GET /api/bildirim | bildirim.listele | oku | herkes | kendi bildirimleri | — |
| POST /api/bildirim/:id/okundu | bildirim.okunduIsaretle | yaz | sahibi, değilse 404 | Bildirim.okundu | — (IDOR yok) |
| GET /api/etkinlik | etkinlik.listele | oku | herkes | `gorebildigiKullanicilar` | — |
| GET /api/etkinlik/bekleyen-davetler | etkinlik.bekleyenDavetler | oku | herkes | kendi davetleri | — |
| POST /api/etkinlik/ic | etkinlik.icEtkinlikOlustur | yaz | Yönetici; ekipIds kapsamında olmalı | Etkinlik + davetler | — |
| POST /api/etkinlik/:id/yanit | etkinlik.yanitla | yaz | davetli | kendi daveti | — (IDOR yok) |
| GET /api/duyuru | duyuru.listele | oku | herkes | hedef kitlesinde olduğu + kendi yayınladığı | — |
| POST /api/duyuru | duyuru.yayinla | yaz | hedefi yöneten / Dir | Duyuru + bildirim | — |
| GET /api/yetkinlik | yetkinlik.listele | oku | herkes | kendi + yönettiği kişiler | — |
| POST /api/yetkinlik | yetkinlik.ekle | yaz | herkes, yalnızca kendisi | Yetkinlik | — |
| (HTTP yok; seed) | yetkinlik.yaklasanBitisleriBildir | sistem işi (`$transaction`, denetim kaydı yazıyor) | — | Bildirim, Yetkinlik | — |
| GET /api/bekleyen | bekleyen.listele | oku | herkes | kendi kabul adımları + davetleri | — |
| GET /api/rapor | rapor.ozet | oku | Çalışan: kendine atananlar. Yönetici: kapsam ∩ filtre. Dir: hepsi | metrikler; sıralama yalnızca yöneticilere | GUV-04 (dizi parametresi) |

## Tehdit kontrol listesi

| Tehdit | Sonuç |
|---|---|
| IDOR | Bulunmadı. `GET/PATCH /tasks/:id`, `/durum`, `/gecmis` ve `/kabul/tasks/:id/*` görünürlük ya da onaylayıcı kontrolü yapıyor. `/bildirim/:id/okundu` sahibi kontrol ediyor. `/etkinlik/:id/yanit` yalnızca kişinin kendi davetine izin veriyor. Yetkinlik ve Etkinlik için id ile okuma ucu yok. |
| Liste sızıntısı | Kabul bekleyen Ekip ataması Ekip arkadaşlarından gizli. Çalışan raporunda sıralama ve Ekipler `null`. Rehber seçici için makul. Sızıntılar: GUV-02, GUV-10. |
| Dikey yükseltme | **GUV-01** (UH → Direktör) ve **GUV-02** (TH başka Unit'in kullanıcısını sahipleniyor). Vekil henüz uygulanmadığı için (ticket 09) test edilemedi. |
| Zincir bypass | Kabulde adım atlanamıyor, başkasının adımında işlem yapılamıyor, retten sonra kabul edilemiyor (hepsi doğrulandı). Bypass'lar: **GUV-03** (İptal ile ret atlanıyor), GUV-02 (sahiplenip direkt kabul), GUV-06 (kabulden sonra içerik değişikliği). |
| Ajan kapsamı | Salt okunur ajan yazamıyor; ajan işlemleri `ajan:true` ile işaretleniyor. Eksik: GUV-09. HTTP tarafında ajan token'ı yok. |
| Denetim bütünlüğü | Tüm iş yazmaları `yaz` üzerinden geçiyor. Tek istisna `yaklasanBitisleriBildir` sistem işi; o da kendi denetim kaydını yazıyor. Tetikleyici UPDATE ve DELETE'i engelliyor. DenetimKaydi'yi değiştiren bir uygulama yolu yok. Eksik: GUV-08 (TRUNCATE ve superuser). |
| Mass assignment | **GUV-01** (`yonetim.ts` içindeki `...g`). Task, kabul, etkinlik, yetkinlik ve duyuru alanları tek tek seçiyor. |
| Girdi | GUV-04, GUV-07. Dosya eki henüz yok. |
| Çıktı | GUV-04. `dangerouslySetInnerHTML` ya da `javascript:` href yok. |
| Web yapılandırması | GUV-05, GUV-11. CORS middleware'i yok; aynı origin olduğu için doğru. |

## Çalıştırılan komutlar ve sonuçlar

- `npm install`: tamam (`fsevents` için install-script uyarısı).
- `npm audit --omit=dev`: **3 high** (prisma → @prisma/config → deepmerge-ts).
- `npm audit`: **10 açık**: 1 moderate, 7 high, 2 critical (vitest/tinypool, vite, picomatch, deepmerge-ts).
- `src/` grep taraması:
  - `$queryRaw`, `$executeRaw`, `Unsafe`, `dangerouslySetInnerHTML`, `eval(`: **yok**.
  - `child_process`: yalnızca `db/postgres.ts`; prisma CLI'yi sabit argümanlarla çalıştırıyor.
  - Hard-coded sır: yalnızca gömülü PG parolası `postgres` (demo boşluğu).
- Git'te `.env`: izlenmiyor ve geçmişte de yok. `.gitignore` `.env` ile `.pgdata/`'yı kapsıyor.
- Kazıma seam testi (`src/server/zz-guvenlik-probe.test.ts`, 10 senaryo): 10/10 geçti, bulguları yeniden üretti. **Silindi.**
- Canlı probe (`PORT=5181 npm run dev` + `curl /@fs/...`): GUV-05 doğrulandı. Sunucu durduruldu; `dev.ts` ya da gömülü postgres süreci kalmadı (5181 ve 51308 portları boş).
- `npm test` (probe silindikten sonra): **15 dosya / 121 test geçti**.
- `npm run typecheck`: **temiz**.

## Kapsam dışı / erişilemeyen

- Henüz uygulanmamış ticket'lar: Vekil ve eskalasyon (09), REST/MCP ajan token'ları (13/14), dış etkinlik onayı (11), ekler (07). Bu yüzden şu tehditler test edilemedi: Vekil'in kendi talebini onaylaması, HTTP üzerinde ajan token kapsamı, ek dosyalarının tip ve boyutu.
- Eşzamanlılık incelenmedi (iki onaylayıcının aynı adımı aynı anda kabul etmesi).
- Tarayıcıda XSS denemesi yapılmadı. Web kaynak koddan incelendi: React kaçışlıyor, `href`/`innerHTML` kullanımı yok.
- Not: Bu dosya worktree'ye yazıldı. Worktree izolasyonu ana checkout'a (`/Users/TCANBAS/Desktop/AI_Hackathon/.scratch/devreye-alim/2026-11-18/`) yazmayı engelledi; oraya kopyalanması gerekiyor.
