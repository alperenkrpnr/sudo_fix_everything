# Devreye alım — Kod kontrolü (`review-code`)

- **Tarih:** 2026-11-18
- **Kapsam:** `main...HEAD`, entegrasyon dalının ucu `9519f0e`. 15 commit, 103 dosya, +10201/−6.
- **Hedef ortamlar:** **Demo** (iç demo veya pilot, mock giriş) ve **Prod** (gerçek kullanıcı ve veri).
- **Yöntem:** Değişen her dosya, `review-code` _Rules_ bölümündeki her kurala göre incelendi. İnceleme beş parçaya bölündü:
  - task, kabul ve yetki (ana oturum)
  - organizasyon, denetim ve db
  - etkinlik, duyuru, yetkinlik, bildirim ve bekleyen
  - rapor
  - http ve web
- **Doğrulama:** Her aday iki yoldan biriyle somutlaştırıldı:
  - bir probe seam testi (`useTestDb` ile, `F` aktörleri)
  - ya da çalışan uygulamaya (`PORT=5183`) atılan istek
  
  Probe testleri silindi. Sunucu durduruldu.
- **Sınıf gösterimi:** `Demo / Prod`. Effort: S < 1 saat, M < 1 gün, L daha uzun.

## Özet

| Sınıf | Demo | Prod |
|---|---|---|
| P0 | 4 | 5 |
| P1 | 10 | 11 |
| P2 | 13 | 11 |
| **Toplam** | 27 | 27 |

- Kapılar yeşil: `npm run typecheck` temiz, `npm test` 15 dosyada 121/121 geçti.
- Aşağıdaki bulguların hiçbirini mevcut testler yakalamıyor.

---

## P0

### KOD-01 — `teamHeadAta` mass assignment: Unit Head herhangi bir kullanıcıyı (kendisi dahil) Direktör yapabiliyor
- **Sınıf:** P0 / P0
- **Hüküm:** CONFIRMED (servis ve HTTP probe'u)
- **Konum:**
  - `src/server/modules/organizasyon/yonetim.ts:155-158`
  - `src/server/http/organizasyon.ts:10,18`: `req.body` olduğu gibi servise geçiyor.
- **Senaryo:** uhSavunma şu isteği gönderir: `POST /api/organizasyon/team-head-ata {ekipId:"ekip-waf", kullaniciId:"u-uh-savunma", tur:"DIREKTOR"}`.
  - **Gözlenen:**
    - Yanıt 200. `data: { tur: 'TEAM_HEAD', ...g }` yazımında `g.tur` sabit değeri eziyor.
    - Kullanıcının rolleri `['DIREKTOR','UNIT_HEAD']` oluyor.
    - Önce 403 dönen `/api/denetim` artık 200 dönüyor. `unitOlustur` 200.
  - **Varyant:** `{tur:'UNIT_HEAD', unitId:'unit-istihbarat'}` gönderilirse kullanıcı başka bir Unit'in Unit Head'i olur.
  - **Beklenen:** Yalnızca TEAM_HEAD satırı oluşmalı ya da 400 dönmeli.
- **Düzeltme:**
  - Serviste `data`, `where` ve denetim `veri` alanlarını açık alan listesiyle kur.
  - Router'da yalnızca `{ekipId, kullaniciId}` alanlarını seç.
  - Gövdeye `tur` koyan bir seam testi ekle.
- **Effort:** S

### KOD-02 — Team Head, başka Unit'in Unit Head'ini veya Direktör'ü kendi Ekibine ekleyip onların Üst yöneticisi oluyor
- **Sınıf:** P0 / P0
- **Hüküm:** CONFIRMED (yetki yükseltmesi ve görünürlük sızıntısı)
- **Konum:**
  - `src/server/modules/organizasyon/yonetim.ts:118-131`: `uyeEkle` yalnızca hedef Ekibi kontrol ediyor.
  - Etkisi `src/server/modules/yetki/cozumleme.ts:72-91` (`ustYoneticiler`) ve `yetki/gorunurluk.ts:16` üzerinden yayılıyor.
- **Senaryo:** thCti `uyeEkle({ekipId:'ekip-cti', kullaniciId:'u-uh-savunma'})` çağırır.
  - **Gözlenen:** Çağrı başarılı. `ustYoneticiler(uhSavunma) = ['u-th-cti','u-uh-istihbarat','u-direktor']`. thCti artık uhSavunma'yı görüyor. Aynı işlem Direktör için de çalışıyor.
  - **Beklenen:** Aktörün kapsamı dışındaki bir yönetici veya Direktör üye olarak eklenemez. Spec'in "Rol yönetimi" bölümü Team Head'e yalnızca kendi Ekibinin üyeliğini veriyor.
- **Düzeltme:**
  - `yetki/yonetim.ts` içine `uyeEklenebilir(...)` ekle. Kapsam dışındaki aktif Yoneticilik sahiplerini reddetsin.
  - Başka bir Ekipteki sıradan Çalışan'ın eklenip eklenemeyeceğine spec sahibi karar versin.
  - Seam testi ekle.
- **Effort:** M

### KOD-03 — Assignee veya yöneticileri, Kabul Bekliyor Task'ı reddetmek yerine gerekçesiz İptal edebiliyor
- **Sınıf:** P0 / P0
- **Hüküm:** CONFIRMED. Kabul zinciri atlanıyor ve ret gerekçesi kuralı deliniyor.
- **Konum:**
  - `src/server/modules/yetki/task-durum.ts:13-24`: Assignee'ye ve Üst yöneticilerine, Task'ın durumuna bakmadan 'TAM' yetki veriyor.
  - `src/server/modules/task/durum.ts:19-20`: `KABUL_BEKLIYOR: ['IPTAL']`.
- **Senaryolar:**
  - waf1 cti1'e Task açar (KABUL_BEKLIYOR). cti1 `durumDegistir(IPTAL)` çağırır ve Task İptal olur.
  - waf1 cti2'ye Task açar. thCti ilk halkayı (cti2) beklemeden İptal eder.
  - cti1 Task'ı TEAM-WAF'a atar. Task kabul beklerken thCoklu İptal eder.
- **Gözlenen:**
  - Kabul adımları `['BEKLIYOR','BEKLIYOR']` olarak öylece kalıyor.
  - Ret gerekçesi istenmiyor ve TASK_RET bildirimi gitmiyor.
  - Ret raporunda iz kalmıyor.
  - İptal son durum olduğu için Requester `yenidenAta` yapamıyor. İş kayboluyor.
- **Beklenen:** Kabul Bekliyor durumunda Assignee tarafı yalnızca kabul veya ret verebilir. İptal yalnızca Requester'ın (ve Direktör'ün) hakkıdır.
- **Düzeltme:**
  - `taskDurumYetkisi`, KABUL_BEKLIYOR ve TASLAK durumlarında Requester ve Direktör dışındaki herkes için `null` dönsün.
  - Seam testi ekle.
- **Effort:** S

### KOD-04 — Sunucu tüm ağ arayüzlerinde dinliyor; kullanılan Vite sürümünde `server.fs.deny` atlatılabiliyor
- **Sınıf:** P0 / P0
- **Hüküm:** CONFIRMED. Erişilebilir bir high zafiyet. Bu uygulamada Vite fiilen runtime sunucusu.
- **Konum:**
  - `src/server/dev.ts:39-41`: `app.listen(PORT)` çağrısında host yok.
  - `package.json`: `vite 7.1.12`.
- **Kanıt:**
  - `lsof` çıktısı `TCP *:5183 (LISTEN)`.
  - `GET /@fs/<repo>/.git` 403 dönüyor. `GET /@fs/<repo>/.git?raw??` ise 200 ve dosya içeriği dönüyor (GHSA-v2wj-q39q-566r).
  - `?raw` ile sunucu kaynak kodunun tamamı okunabiliyor.
  - Aynı sürümde WebSocket üzerinden keyfi dosya okuma açığı da var (GHSA-p9ff-h696-f583).
- **Senaryo:** Aynı ağdaki biri `.env`, `*.pem` ve `.git/**` gibi deny listesindeki dosyaları okur. Beklenen: sunucu yalnızca localhost'tan erişilebilir olmalı ve Vite yamalı bir sürüm olmalı.
- **Düzeltme:**
  - `app.listen(PORT, '127.0.0.1')` (ya da bir `HOST` env değişkeni).
  - `vite` sürümünü 7.3.7 veya üstüne yükselt.
- **Ortam notu:** Prod için Vite middleware kullanmayan bir build/serve yolu gerekiyor. Şu an tek giriş noktası `dev.ts`.
- **Effort:** S (Prod için build yolu M)

### KOD-05 — Mock giriş token'ı sahtelenebiliyor; kullanıcı listesi kimlik doğrulamasız açık
- **Sınıf:** P2 / P0. Demo'da bilinen bir demo-only açık; Prod'da P0.
- **Hüküm:** CONFIRMED
- **Konum:**
  - `src/server/modules/oturum/index.ts:21-23`: `tokenCoz` her `mock:<id>` değerini kabul ediyor.
  - `src/server/http/app.ts:39-40`: `mock-kullanicilar` ve `giris` uçları herkese açık.
  - `src/server/modules/organizasyon/index.ts:137`: `mockKullanicilar` Actor almıyor ve `oku` kapısından geçmiyor.
- **Senaryo:**
  - Hiç giriş yapmamış biri `Authorization: Bearer mock:u-direktor` ile `/api/denetim` çağırır. Yanıt 200, `oturum.ac` kaydı yazılmıyor.
  - Anonim `GET /api/oturum/mock-kullanicilar` 200 dönüyor ve 13 kullanıcıyı rolleriyle listeliyor.
- **Ortam notu:**
  - REST tarafında henüz ajan token kavramı yok (ticket 13). `ajanKapsaminiDenetle` HTTP üzerinden hiç çalışmıyor.
  - Demo'da KOD-04'teki host bağlama düzeltmesi yapılmazsa, ağdaki herkes Direktör olarak işlem yapabilir.
- **Düzeltme:**
  - `girisYap` imzalı veya rastgele bir oturum kimliği üretsin, `tokenCoz` bunu doğrulasın.
  - `mockKullanicilar` bir config bayrağının arkasına alınsın.
- **Effort:** S

---

## P1

### KOD-06 — Hata işleyici, 500 yanıtlarında iç ayrıntıları sızdırıyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/http/app.ts:56-60`. `status === 500` olduğunda bile `mesaj: err.message` dönüyor.
- **Senaryo:** waf1 `POST /api/tasks {baslik:'x', bitisTarihi:'garbage'}` gönderir.
  - Gözlenen: 500 yanıtında Prisma mesajı geliyor. Mesajda mutlak dosya yolu, kaynak satırları ve insert verisi var.
  - `GET /api/tasks?durum=FOO` isteğinde görünürlük `where` filtresi de yanıta basılıyor.
  - Beklenen: 400 ya da genel bir 500 mesajı.
- **Düzeltme:** 500'de `{hata:'SUNUCU', mesaj:'Sunucu hatası'}` dön, ayrıntıyı yalnızca logla.
- **Effort:** S

### KOD-07 — Geçersiz girdi 400 yerine 500 dönüyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:**
  - `src/server/http/app.ts:56-58`: body-parser'ın 400'ünü yok sayıyor.
  - `http/task.ts:9`, `http/kabul.ts:19`, `http/etkinlik.ts:6`, `app.ts:45`: ham girdiye kontrolsüz `new Date(...)` uygulanıyor.
  - `modules/etkinlik/index.ts:76-85`: `bitis` NaN olunca kontrol geçiyor (`bitis < baslangic` false dönüyor). `.trim` ve `.some` tip kontrolü yapılmadan çağrılıyor.
  - `modules/duyuru/index.ts:67`
  - `modules/organizasyon/yonetim.ts:51-58`: `ekipDuzenle` geçersiz `unitId` alınca Prisma hatası fırlatıyor; boş `ad` kabul ediliyor.
- **Senaryo (hepsi 500 dönüyor):**
  - Bozuk JSON `'{bad'`
  - `{baslik:5}`
  - Ret isteğinde `{gerekce:5}`: ret gerekçesi kuralı 400 yerine 500 ile yanıt veriyor.
  - `/etkinlik/ic {bitis:'garbage'}`
  - `GET /api/organizasyon?tarih=garbage`
- **Düzeltme:**
  - body-parser'ın 4xx hatalarını 400'e eşle.
  - Tarih dönüşümü için `DogrulamaHatasi` fırlatan bir yardımcı kullan.
  - Servis girişinde `typeof` / `Array.isArray` kontrolleri ekle.
- **Effort:** S

### KOD-08 — Diğer organizasyon yazımlarında mass assignment; `calisanTasi` çakışan üyelik üretiyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED (`uyeEkle`, `calisanTasi`). `unitHeadAta` ve `ekipOlustur` yalnızca kod okunarak doğrulandı.
- **Konum:** `src/server/modules/organizasyon/yonetim.ts:45,93,128,169` (`...g` yayılımı) ve `:98-115`.
- **Senaryo:**
  - thCoklu `uyeEkle({..., gecerliBitis:'2020-01-01'})` çağırır. 200 dönüyor ve `gecerliBaslangic` değerinden önce bitmiş bir üyelik oluşuyor (ADR-0002 tarih aralığı bozuluyor).
  - `ekipOlustur` gövdeden gelen `id` ve `arsivlendi` alanlarını kabul ediyor.
  - `uyeEkle(SOC, waf1)` ardından `calisanTasi(WAF→SOC)` yapılınca waf1'in iki aktif SOC üyeliği oluyor.
  - `calisanTasi(WAF→WAF)` da kabul ediliyor.
  - Taşınan kullanıcının arşivlenmiş olup olmadığına bakılmıyor.
- **Düzeltme:**
  - Açık alan listesi kullan.
  - `eski === yeni` durumunu ve yeni Ekipte zaten aktif üyelik olmasını reddet.
  - `kullaniciBul` çağır.
- **Effort:** S

### KOD-09 — Etkinlik davetinde kapsam kontrolü yalnızca `ekipIds` için yapılıyor; `davetliIds` ile herkes davet edilebiliyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/modules/etkinlik/index.ts:94-98`
- **Senaryo:** thCoklu `davetliIds:[cti1, osint1]` ile etkinlik oluşturur (ikisi de başka Unit'te).
  - Gözlenen: Etkinlik oluşuyor. cti1'e ETKINLIK_DAVETI bildirimi gidiyor ve etkinlik uhIstihbarat'a görünür hale geliyor.
  - Beklenen: `ekipIds:[ekipCti]` için olduğu gibi YETKI hatası.
- **Düzeltme:** yetki/ içinde `davetEdebilir(...)` tanımla, davetlilerin her biri için uygula. Seam testi ekle.
- **Effort:** S

### KOD-10 — Taşınan Çalışan'ın açık Task'ları eski Ekipte kalmıyor: eski Team Head görmüyor, yeni Team Head yönetiyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:**
  - `src/server/modules/yetki/task.ts:15-33`: `taskGorunurluk`, `task.ekipId` alanına hiç bakmıyor.
  - `yetki/task-durum.ts:15-17`: Assignee'nin o anki Üst yöneticilerini kullanıyor.
- **Senaryo:** waf1 kendine bir Task açar (`ekipId = WAF`). Ardından Direktör waf1'i WAF'tan CTI'ya taşır.
  - Gözlenen: thCoklu Task'ı görmüyor; `durumDegistir` çağrısı BULUNAMADI dönüyor. thCti ise Task'ı görüyor.
  - Beklenen: Spec'in "Organizasyon değişimi" bölümüne göre açık Task'lar eski Ekipte kalır.
- **Sınıf gerekçesi:** CONFIRMED ve yetkiyle ilgili olduğu için kural gereği P0'a yükselir. Ancak sorun bir sızıntı değil, eski yöneticinin görünürlüğü kaybetmesi; bu yüzden bir sınıf indirildi.
- **Düzeltme:**
  - Görünürlük ve durum yetkisine "Task'ın Ekibini (`task.ekipId`) yöneten" koşulunu ekle.
  - Spec'teki iki cümle arasındaki çelişkiyi spec sahibine netleştirt.
- **Effort:** M

### KOD-11 — `ekipDuzenle` Ekip→Unit bağını yerinde değiştiriyor; geçmiş yapı ve raporlar yeniden yazılıyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:**
  - `src/server/modules/organizasyon/yonetim.ts:51-58`
  - `prisma/schema/organizasyon.prisma`: Ekip→Unit bağı tarih aralıklı değil.
  - `src/server/modules/rapor/index.ts:138`: güncel `Ekip.unitId` kullanılıyor.
- **Senaryo:** t2 anında Direktör PENTEST'i İstihbarat'a taşır. Ardından geçmişteki t1 anı sorgulanır.
  - Gözlenen:
    - `sorumluYonetici(PENTEST, t1) = [uhIstihbarat]` dönüyor.
    - OSINT bir Task tamamladıktan sonra Unit değiştirince uhIstihbarat raporunda `tamamlanan` 1'den 0'a düşüyor, uhSavunma'nın raporunda 1 görünüyor.
  - Beklenen: ADR-0002 gereği geçmiş, olay tarihindeki yapıya göre çözülmeli.
- **Sınıf gerekçesi:** Denetim ve tarihçe kuralını ihlal ettiği için P0'a yükselir. Ancak işlemi yalnızca Direktör yapabiliyor ve DenetimKaydi kaybı yok; bu yüzden bir sınıf indirildi.
- **Düzeltme:**
  - Kısa vadede Unit değişikliğini yasakla ve girdi doğrulaması ekle (S).
  - Kalıcı çözüm: Ekip→Unit bağını tarih aralıklı yap (L).

### KOD-12 — Ret raporu ve kabul bekleme süresi, kararı veren Ekibe değil Task'ın o anki Ekibine yazılıyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:**
  - `src/server/modules/rapor/index.ts:145-156` ve `src/server/modules/kabul/rapor.ts:8-11`
  - `kabul.yenidenAta` `task.ekipId` alanını yeniden yazıyor (`kabul/index.ts:236,252`).
- **Senaryo:** osint1 cti1'e Task açar, cti1 reddeder, osint1 Task'ı waf1'e yeniden atar.
  - Gözlenen:
    - thCti raporunda ret raporu `null` oluyor.
    - thCoklu'nun raporunda `akis [{osint→cti,1}]` ve `retOrani 1` görünüyor.
  - Beklenen: Ret kaydı CTI'da ve OSINT tarafında kalmalı.
- **Sınıf gerekçesi:** P0'a yükseltilmedi, çünkü aynı ret bilgisi yeni Assignee tarafına `kabul.zincir` üzerinden zaten görünüyor.
- **Düzeltme:** Adımları kendi `kararVerenEkipId` / `requesterEkipId` alanlarına göre kapsamla. Seam testi ekle.
- **Effort:** M

### KOD-13 — Rapor eksik sayıyor: yöneticiye atanan Task'lar kayboluyor, bekleyen kabul adımları ölçülmüyor
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED
- **Konum:**
  - `src/server/modules/task/index.ts:55`: yöneticinin üyeliği olmadığından `ekipId = null`.
  - `rapor/index.ts:148-150`
  - `kabul/rapor.ts:20-22`: yalnızca KABUL ve RET adımları sayılıyor.
- **Senaryo:**
  - cti1 thCti'ye Task açar, thCti tamamlar. thCti ve uhIstihbarat raporlarında `tamamlanan` 0 görünüyor. Direktör'ün `genel` görünümünde 1 var, Ekip toplamlarında 0.
  - 5 gündür kabul bekleyen bir Task için `kabulBekleme {adet 0}` dönüyor; beklenen yaklaşık 120 saat. Oysa blok süresi devam eden aralıkları sayıyor (spec, kullanıcı hikâyesi 73).
- **Düzeltme:**
  - Task açılırken `ekipId` için `kullaniciEkibi` fallback'ini kullan.
  - Yönetici için `assigneeKullaniciId = kendisi` koşulunu ekle.
  - BEKLIYOR adımlarda süreyi `simdi − baslangic` olarak say.
- **Effort:** S

### KOD-14 — Ret gerekçesi ve Bloklu nedeni `window.prompt` ile soruluyor
- **Sınıf:** P1 / P1. Rubrik bunu açıkça sayıyor: çekirdek akışta `window.prompt` ile gerekçe almak.
- **Hüküm:** PLAUSIBLE (kaynaktan izlendi)
- **Konum:** `src/web/pages/KabulKontrolleri.tsx:34-36`, `src/web/pages/Tasklar.tsx:122-123`
- **Senaryo:** Bloklu nedeni boş bırakılınca tıklama sessizce hiçbir şey yapmıyor. Satır içi doğrulama ve erişilebilir bir form yok.
- **Düzeltme:** Hata mesajı gösteren, zorunlu bir textarea veya modal kullan.
- **Effort:** S

### KOD-15 — Güvenlik ve iş kurallarının seam testleri eksik
- **Sınıf:** P1 / P1
- **Hüküm:** CONFIRMED (test dosyaları grep ile tarandı; ilgili assert'ler yok)
- **Test edilmeyenler:**
  - Reddedilmesi gereken durumlar: Team Head veya başka Unit'in Unit Head'i tarafından `uyeCikar`, `teamHeadKaldir`, `calisanTasi`.
  - Fazladan gövde alanları (KOD-01, KOD-08).
  - Etkinlik ve Duyuru doğrulama kuralları: `etkinlik.test.ts` ve `duyuru.test.ts` içinde hiç `DOGRULAMA` testi yok.
  - Raporun olay tarihindeki yapıya göre hesaplanması (hikâye 81), rol bazında ret raporu, geciken sınırı.
  - KOD-03'teki Kabul Bekliyor iptali.
- **Düzeltme:** Her kural için, kural kaldırılınca kırmızıya dönen bir test yaz.
- **Effort:** M

### KOD-16 — Denetim izinin ekleme-tabanlı olma koruması atlatılabiliyor
- **Sınıf:** P2 / P1. İkisi de doğrudan DB erişimi gerektiriyor; servis üzerinden yolu yok.
- **Hüküm:** CONFIRMED
- **Konum:** `prisma/sql/denetim.sql:16-19` (yalnızca satır düzeyinde `BEFORE UPDATE OR DELETE`), `modules/denetim/index.ts:33`
- **Senaryo:**
  - Uygulamanın kendi bağlantısıyla `TRUNCATE "DenetimKaydi"` çalışınca tüm kayıtlar siliniyor (1 → 0).
  - `arsivlendi` alanı saklama süresine bakılmadan doldurulabiliyor. Doldurulan kayıt `listele` çıktısından kayboluyor.
- **Sınıf gerekçesi:** Denetim izini değiştirmek kural gereği P0. Ancak servis yolu olmadığı için bir sınıf indirildi.
- **Düzeltme:**
  - Bir `BEFORE TRUNCATE` trigger'ı ekle ya da uygulama rolünden TRUNCATE yetkisini kaldır.
  - Arşivlemeye yalnızca `zaman < now() - saklama` koşulunda izin ver.
- **Effort:** M

---

## P2

### KOD-17 — İzin kararları `yetki/` dışında yazılmış (ADR-0001)
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED (kod okunarak)
- **Sunucu tarafı:**
  - `etkinlik/index.ts:83-87` (`ekipYonetebilir`'in elle kopyası)
  - `duyuru/index.ts:71-76,108-123`
  - `organizasyon/index.ts:103-104`
  - `organizasyon/yonetim.ts` içinde `rolVar('DIREKTOR')`
  - `denetim/index.ts:31`
  - `rapor/index.ts:130-150,166`
  - `task/index.ts:101`
  - `kabul/index.ts:280`
- **Web tarafı:**
  - `src/web/pages/Duyuru.tsx:13,24-27`
  - `Etkinlik.tsx:15`
  - `Organizasyon.tsx:31`
  - `Tasklar.tsx:52,108-115` (`SONRAKI`, `GECISLER`'in kopyası)
  - `KabulKontrolleri.tsx:30-31,51`
- **Senaryo:**
  - Kural değişirse (örneğin Vekil eklenince) kopyalar ayrışır.
  - Requester'a şimdiden sunucunun 403 döndüğü "Devam Ediyor" düğmesi gösteriliyor.
  - thCoklu kendi Unit'i olan SAVUNMA ile filtreleyince kesişim yerine YETKI hatası alıyor.
- **Düzeltme:**
  - Kuralları yetki/ altına taşı.
  - Servisler istemciye yetenek bayrakları (`izinler`) ve izinli sonraki durumları dönsün.
- **Effort:** M

### KOD-18 — Arşivlenmiş Ekip ve Kullanıcı hâlâ yetki çözümlemesinde ve hedeflemede sayılıyor
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED (arşivleme `t.db` ile kuruldu)
- **Konum:**
  - `yetki/cozumleme.ts:14-67`, `yetki/gorunurluk.ts:20-26`
  - `duyuru/index.ts:41-60`, `etkinlik/index.ts:82-98`, `yetkinlik/index.ts:93-95`
  - `rapor/index.ts:169`
- **Senaryo:**
  - CTI arşivliyken thCti hâlâ TEAM_HEAD rolünde.
  - thCoklu arşivliyken `sorumluYonetici(WAF)` yine thCoklu dönüyor. Onaylar giriş yapamayan birine düşüyor.
  - Arşivli Ekibe Duyuru yayınlanabiliyor.
  - Arşivli bir üye bulunan Ekibe toplu davet `DOGRULAMA` hatasıyla tamamen başarısız oluyor.
  - Arşivli kullanıcıya bildirim gidiyor.
  - Raporda `genel` toplamı Ekip toplamlarıyla tutmuyor.
- **Sınıf gerekçesi:** Yetkiyle ilgili ve CONFIRMED olduğu için P1'e yükselir. Ancak henüz arşivleyen bir servis yok, sorun gizli kalıyor; bu yüzden bir sınıf indirildi. Arşivleme özelliği geldiğinde P1 olur.
- **Düzeltme:** Tarih aralığı sorgularına `arsivlendi: null` koşulunu ekle. `bildirimGonder` arşivli alıcıları atlasın.
- **Effort:** M

### KOD-19 — Bekleyen işlerim'de davetin bekleme yaşı etkinlik başlangıcından hesaplanıyor
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/modules/bekleyen/index.ts:73`
- **Senaryo:** 2026-03-02'de, 2026-03-10'da başlayacak bir etkinliğe davet gönderilir. `beklemeBaslangici = 2026-03-10` çıkıyor; yaş negatif, yaşa göre sıralama çalışmıyor.
- **Düzeltme:** Davet zamanını kullan (`olusturma` ya da yeni bir `davetZamani` alanı).
- **Effort:** S

### KOD-20 — Team Head'siz Ekibe yayınlanan Duyuru, Sorumlu yöneticiye bildirim göndermiyor
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/modules/duyuru/index.ts:43-50`
- **Senaryo:** Direktör PENTEST'e Duyuru yayınlar. uhSavunma 0 bildirim alıyor, oysa `listele` çıktısında Duyuru'yu görüyor.
- **Düzeltme:** Hedef kitleye `sorumluYonetici` ekle.
- **Effort:** S

### KOD-21 — Sertifika hatırlatma işi `yaz` dışından yazıyor
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED (kod okunarak)
- **Konum:** `src/server/modules/yetkinlik/index.ts:90-115`. Kendi `$transaction`'ını açıyor ve DenetimKaydi'ni elle, `kullaniciId: null` ile yazıyor.
- **Sınıf gerekçesi:** Denetimle ilgili olduğu için yükselir. Ancak kayıt yine de yazılıyor; bu yüzden indirildi.
- **Düzeltme:** Sistem işleri için `sistemYaz` kapısı ekle ya da bunu bir ADR'ye bağla.
- **Effort:** M

### KOD-22 — `kabulEt` / `reddet`, görünmeyen bir Task'ın varlığını ve durumunu sızdırıyor
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/modules/kabul/index.ts:105-117`. `findUnique` görünürlük filtresi uygulamadan çalışıyor.
- **Senaryo:** osint1 waf1'in Task'ını `getir` ile ister: BULUNAMADI. Aynı Task için `kabulEt` çağırınca "Task kabul beklemiyor" (DOGRULAMA) dönüyor; var olmayan id için ise BULUNAMADI.
- **Sınıf gerekçesi:** Yetkiyle ilgili olduğu için yükselir. Ancak id'ler tahmin edilemeyen cuid değerleri ve yalnızca varlık ile durum bilgisi sızıyor; bu yüzden indirildi.
- **Düzeltme:** `aktifAdim` önce görünürlüğü kontrol etsin.
- **Effort:** S

### KOD-23 — Reddedilen Task'ı reddeden Assignee düzenleyebiliyor; son durumdaki Task'lar düzenlenebiliyor
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/modules/task/index.ts:114-123`. Task'ı gören herkes düzenleyebiliyor ve durum kontrolü yok.
- **Senaryo:** waf2 Task'ı reddeder, sonra `guncelle({baslik:'değiştirildi'})` çağırır ve başarılı olur. Reddedilen içerik değişiyor; spec bu işi Requester'ın `yenidenAta` akışına veriyor.
- **Düzeltme:**
  - REDDEDILDI ve IPTAL durumlarında düzenlemeyi yalnızca Requester'a (yeniden atama yoluyla) bırak.
  - Düzenleme yetkisini yetki/ altına taşı.
- **Effort:** S

### KOD-24 — Çok Ekipli Çalışan'ın Sorumlu yöneticisi belirsiz
- **Sınıf:** P2 / P2
- **Hüküm:** PLAUSIBLE
- **Konum:** `yetki/cozumleme.ts:23-26` (`uyeOlduguEkipler` sıralama içermiyor), `yetki/kabul.ts:61,97`
- **Senaryo:** pentest1 CTI'ya da eklenir. SORUMLU adımı `[0]` elemanına, yani ilk üyeliğe göre çözülüyor (uhSavunma). Sorgu sırası garanti değil; aynı Task'ın onaylayıcısı değişebilir.
- **Düzeltme:** Belirli bir sıralama kur ya da Task'ın `ekipId` alanını kullan.
- **Effort:** S

### KOD-25 — Rapor hesaplarında küçük hatalar
- **Sınıf:** P2 / P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/server/modules/rapor/index.ts:55,101,109`
- **Senaryo:**
  - Termini bugün olan Task, 00:00 UTC'den itibaren geciken sayılıyor (`geciken 1`, beklenen 0).
  - REDDEDILDI, reddeden Ekip ve Çalışan için "kapalı" sayılıyor; reddetmek kapanma oranını yükseltiyor.
- **Düzeltme:**
  - Termin için gün sonunu baz al.
  - Reddedilenleri Assignee sayımlarından çıkar.
- **Effort:** S

### KOD-26 — GLOSSARY'de _Avoid_ listesindeki "Oluşturan" kullanılıyor
- **Sınıf:** P2 / P2
- **Hüküm:** PLAUSIBLE
- **Konum:** `src/server/modules/etkinlik/index.ts:33,37,54,108,159-169` (`olusturanId` / `olusturanAd`), `prisma/schema/etkinlik.prisma:24`
- **Düzeltme:** UI ile uyumlu olarak `duzenleyenId` yap.
- **Effort:** S

### KOD-27 — Geliştirme araçlarında bağımlılık zafiyetleri
- **Sınıf:** P2 / P2. Yalnızca geliştirme ortamını etkiliyor.
- **Hüküm:** CONFIRMED (`npm audit`)
- **Zafiyetler:**
  - `vitest 3.2.4` (critical, UI sunucusu), `tinypool` (critical), `picomatch`, `fdir`, `tinyglobby` (high). Bunlar test ve araç zincirinde; runtime'da yer almıyor.
  - `prisma` → `@prisma/config` → `deepmerge-ts` (high). Yalnızca CLI'da, generate sırasında çalışıyor; istek yolunda yok.
  - Vite runtime'da erişilebilir olduğu için ayrıca KOD-04'te ele alındı.
- **Düzeltme:** `vitest ≥ 3.2.6` (ideal olarak 4.1.11+), prisma için yükseltme planı.
- **Effort:** S

---

## Çalıştırılan komutlar ve sonuçlar

| Komut | Sonuç |
|---|---|
| `git diff main...HEAD --stat`, `git log main..HEAD --oneline` | 15 commit, 103 dosya |
| `npm install` | tamam (postinstall `prisma generate`) |
| `npm run typecheck` | yeşil (exit 0) |
| `npm test` | 15 dosya, 121/121 geçti (28.5 sn) |
| `npm audit` | 10 zafiyet: 1 moderate, 7 high, 2 critical |
| `npm audit --omit=dev` | 3 high (prisma CLI zinciri, deepmerge-ts) |
| Probe seam testleri (task/kabul, org, etkinlik, rapor, http) | KOD-01…KOD-25 arasındaki CONFIRMED bulguları üretti; hepsi silindi |
| `PORT=5183 npm run dev` + `curl` | `*:5183` üzerinde dinliyor; `/@fs/...?raw??` ile deny atlatıldı (KOD-04); sunucu durduruldu |

## Erişilemeyenler / kapsam dışı

- **Tarayıcı:** Web bulguları (KOD-14, KOD-17'nin web kısmı) kaynaktan izlendi; tarayıcıda yürünmedi.
- **Kodda henüz olmayan ticket'lar:** Delegasyon ve Ekip havuzuna dönüş (06), Vekalet ve eskalasyon (09), REST/MCP ve ajan token'ları (13, 14). Bu kuralların ihlali aranmadı; ilgili ticket'lar açık.
- **Rapor tarih aralığı filtresi:** Henüz uygulanmamış (ticket 12'de açık), sınır testi yapılamadı.
- **Prod derleme ve dağıtım yolu yok.** Prod değerlendirmesi dev sunucusu üzerinden yapıldı.
