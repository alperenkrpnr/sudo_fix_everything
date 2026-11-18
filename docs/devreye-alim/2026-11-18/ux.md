# Devreye alım: UX kontrolü (review-ux)

- Tarih: 2026-11-18
- Kapsam: `SAYFALAR` içindeki tüm sayfalar (`src/web/App.tsx:16-26`) ve skill'deki tüm akışlar.
- Yöntem: **Canlı uygulama + tarayıcı.** `PORT=5182 npm run dev` (main checkout) çalıştırıldı. Headless Chrome, CDP ile sürüldü: her rol olarak girildi, düğmelere tıklandı, `window.prompt` diyalogları yanıtlandı, 1280px ve 800px genişlikte ekran görüntüsü alındı (`/tmp/ux-cdp/shots/*.png`). Bazı ön koşul veriler REST API ile hazırlandı (`POST /api/oturum/giris` → `mock:<id>` token).
- Sayfalar ve onları ziyaret eden roller: Giriş (hepsi), Bekleyen işlerim (waf1, cti1, thCti, thCoklu), Organizasyon (waf1, uhSavunma, Direktör), Task'lar pano/liste (waf1, cti1, thCti, thCoklu), Etkinlikler (waf1), Duyurular (waf1, uhSavunma, Direktör), Yetkinlikler (waf1), Bildirimler (waf1), Rapor (waf1, thCoklu, uhSavunma, Direktör).

## Canlı demoya en çok zarar veren beş sorun

1. **UX-01:** Assignee "Kabul et"e basınca kart hiç değişmiyor. Düğmeler yerinde kalıyor, ikinci tıklama "Bu kabul adımının onaylayıcısı değilsiniz" hatası veriyor. Akışın kalbi bozuk görünüyor.
2. **UX-02:** Ret gerekçesi ve Bloklu nedeni `window.prompt` ile soruluyor. Boş Bloklu nedeni girilirse hiçbir geri bildirim olmadan işlem iptal ediliyor.
3. **UX-03:** Her role her durum düğmesi gösteriliyor. Requester "→ Tamamlandı" ya da "Yeniden aç"a basınca sayfanın en üstünde "Requester yalnızca İptal edebilir" çıkıyor.
4. **UX-04 / UX-05:** Pano 1280px'te sığmıyor. Reddedildi ve İptal sütunları ekran dışında kalıyor, düğmeler kart dışına taşıyor. Açılan Tarihçe ise kart içinde okunamayacak kadar dar bir sütuna sıkışıyor.
5. **UX-06 / UX-07:** Bekleyen işlerim'de Task kabulü için yalnızca "Kabul/ret: Task'lar sayfası" yazıyor; bağlantı ya da düğme yok. Direktör'ün denetim izi ekranı da hiç yok.

## Bulgular

### UX-01: Kabul et sonrası kabul zinciri yenilenmiyor, kart eski durumda kalıyor
- **P sınıfı:** Demo P1 · Prod P1 (temel akışta büyük UX sorunu; işlem sunucuda başarılı olduğu için P0 değil)
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/KabulKontrolleri.tsx:21-23` (useEffect bağımlılıkları `[task.id, task.durum, acik]`), `:26-27`
- **Senaryo:** cti1 olarak "Stale test" kartında "Kabul et"e basıldı. Zincirde sırada Sorumlu yönetici olduğundan Task `KABUL_BEKLIYOR` durumunda kalıyor (`guncelleme` de değişmiyor). Bu yüzden zincir yeniden çekilmiyor. Kart hâlâ "Kabul et / Reddet" ve "Assignee: Kerem Özdemir · bekliyor" gösteriyor. Tekrar tıklanınca sayfa üstünde "Bu kabul adımının onaylayıcısı değilsiniz" çıkıyor. Beklenen: kart "Assignee: kabul · Sorumlu yönetici: Ece Arslan · bekliyor" göstermeli, düğmeler kaybolmalı ve kısa bir başarı mesajı çıkmalı.
- **Düzeltme:** `islem()` başarılı olunca zinciri `KabulKontrolleri` içinde yeniden çek (ya da `onDegisti` sonrası artan bir `surum` sayacını effect bağımlılığına ekle). İşlem sürerken düğmeleri devre dışı bırak. Efor S.

### UX-02: Ret gerekçesi ve Bloklu nedeni için `window.prompt`
- **P sınıfı:** Demo P1 · Prod P1
- **Hüküm:** CONFIRMED (iki prompt diyaloğu CDP ile yakalandı)
- **Konum:** `src/web/pages/KabulKontrolleri.tsx:33-38`, `src/web/pages/Tasklar.tsx:119-124`
- **Senaryo:** cti1 "Reddet"e basıyor, tarayıcının yerel prompt'u açılıyor; Task başlığı ya da bağlam görünmüyor. thCti "→ Bloklu"ya basıp boş bırakınca işlem **sessizce** iptal oluyor, hiçbir mesaj çıkmıyor (`Tasklar.tsx:123`). Boş ret gerekçesinde ise hata gösteriliyor; iki akış tutarsız. Beklenen: kart içinde açılan, etiketli ve zorunlu alan doğrulaması olan bir gerekçe formu.
- **Düzeltme:** Ortak bir `GerekceFormu` bileşeni yaz: satır içi textarea, Gönder ve Vazgeç düğmeleri, boşken Gönder devre dışı, hata alanın yanında. Bunu Reddet ve Bloklu akışlarında kullan. Efor M.

### UX-03: Durum düğmeleri role göre filtrelenmiyor, yetkisiz geçişler deneniyor
- **P sınıfı:** Demo P1 · Prod P1
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:108-115` (`SONRAKI` role bakmıyor), `:131-135`, hatanın gösterildiği yer `:61`
- **Senaryo:** waf1 (Requester) kendi açtığı Tamamlandı durumdaki Task'ta "Yeniden aç"ı görüyor; Devam Ediyor durumundaki başka bir Task'ta da "→ Bloklu" ve "→ Tamamlandı"yı görüyor. Tıklayınca hata sayfanın üstünde, karttan uzakta çıkıyor (`top ≈ 129px`); kart aşağıdaysa kullanıcı görmüyor. Beklenen: yalnızca izinli geçişlerin gösterilmesi, hatanın da kartın yanında çıkması.
- **Düzeltme:** `TaskGorunumu`'ya sunucunun hesapladığı `izinliGecisler` alanını ekle (ADR-0001 servis katmanı `taskDurumYetkisi`) ve düğmeleri buna göre çiz. Hatayı kart içinde göster. Efor M.

### UX-04: Pano 1280px'te sığmıyor, Reddedildi ve İptal ekran dışında, düğmeler taşıyor
- **P sınıfı:** Demo P1 · Prod P1
- **Hüküm:** CONFIRMED (ölçüm: `.pano` scrollWidth 1416px, görünen 1100px)
- **Konum:** `src/web/styles.css:6` (`main max-width:1100px`), `:15` (8 × min 170px), `:14` (`.arac` sarmıyor), `src/web/pages/Tasklar.tsx:70-80`
- **Senaryo:** waf1 Task'lar sayfasını açıyor. Reddedilen Task'larını (yeniden atama ya da iptal kararı onu bekliyor) yalnızca pano içinde yatay kaydırınca görebiliyor; Reddedildi başlığı "Red…" diye kesik. Devam Ediyor kartında "→ İptal" düğmesi kartın dışına taşıyor. "→ Tamamlandı" ve "Yeniden aç" iki satıra kırılıyor. Beklenen: 1280–1440px'te bütün sütunların görünmesi.
- **Düzeltme:** Pano sayfasında `main` genişliğini kaldır. Terminal durumları (Reddedildi, İptal, Tamamlandı) daraltılabilir ya da ayrı bir şerit yap. `.arac { flex-wrap: wrap }` ekle. Efor S.

### UX-05: Tarihçe kart içinde okunamıyor; aktör gösterilmiyor
- **P sınıfı:** Demo P1 · Prod P1
- **Hüküm:** CONFIRMED (ekran görüntüsü `15-thcti-tarihce.png`)
- **Konum:** `src/web/pages/Tasklar.tsx:129-149` (tarihçe `.arac` flex satırının içinde çiziliyor), `:142` (`kullaniciId` gösterilmiyor), `:146`
- **Senaryo:** thCti "Zincir demo" kartında Tarihçe'ye basıyor. Geçişler yaklaşık 20px'lik bir sütuna kırılıyor, "Yeniden aç" ve "Tarihçe" düğmeleri yüzlerce piksel uzuyor. Kimin hangi geçişi yaptığı görünmüyor. "Blok süresi: 0.0 saat" anlamsız. Kabul tarihçesi ayrı bir düğmenin arkasında. Beklenen: kartın altında tam genişlikte, kişi adıyla birleşik bir tarihçe (durum ve kabul).
- **Düzeltme:** Tarihçeyi `.arac` dışına, kartın altına taşı. `kisiAdi(g.kullaniciId)` ekle. 1 saatin altındaki süreleri dakika olarak göster. İki tarihçeyi tek bir zaman çizelgesinde birleştir. Efor S.

### UX-06: Bekleyen işlerim'den Task kabulüne ulaşılamıyor
- **P sınıfı:** Demo P1 · Prod P1
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/BekleyenIslerim.tsx:57`
- **Senaryo:** thCti ve cti1 Bekleyen işlerim'de Task kabulü satırını görüyor, yanında düz metin olarak "Kabul/ret: Task'lar sayfası" yazıyor. Kullanıcı Task'lar'a geçip, arama ya da filtre olmayan 8 sütunlu panoda Task'ı aramak zorunda kalıyor. GLOSSARY tanımı "tüm onayları tek yerde gösteren pano" diyor. Beklenen: satırda Kabul et ve Reddet düğmeleri, ya da en azından Task'ı açan bir bağlantı.
- **Düzeltme:** Satırda `KabulKontrolleri`'ni yeniden kullan, ya da `setSayfa('tasklar')` ile Task'a odaklanan bir bağlantı ekle (vurgulu kart). Efor S (bağlantı) ya da M (satır içi işlem).

### UX-07: Denetim izi için arayüz yok
- **P sınıfı:** Demo P1 · Prod P1
- **Hüküm:** CONFIRMED (`/api/denetim` Direktör için veri döndürüyor; menüde karşılığı yok)
- **Konum:** `src/web/App.tsx:16-26`, API `src/server/http/app.ts:49`
- **Senaryo:** Direktör'ün "denetim izi" akışı arayüzden yapılamıyor; menüde sayfa yok. Beklenen: yalnızca Direktör'e görünen, işleme ve kişiye göre filtrelenebilen, ajan işlemini işaretleyen bir liste.
- **Düzeltme:** `src/web/pages/Denetim.tsx` sayfasını yaz ve `SAYFALAR`'a ekle. Sayfa yalnızca `DIREKTOR` rolünde görünsün; `islem` filtresi olsun, ajan işlemi etiketlensin. Efor M.

### UX-08: Rapor filtresi kapsam dışı Unit'leri sunuyor; hata çıkınca eski veri yerinde kalıyor
- **P sınıfı:** Demo P2 · Prod P2 (önem derecesi büyük ama temel akış dışında)
- **Hüküm:** CONFIRMED (ekran görüntüsü `18-uh-rapor-kapsam-disi.png`)
- **Konum:** `src/web/pages/Rapor.tsx:53-55` (tüm Unit'ler), `:71-74`, `:58-60` (hata gelince `r` temizlenmiyor)
- **Senaryo:** uhSavunma Unit filtresinde UNIT-ISTIHBARAT'ı seçiyor. "Bu Ekip/Unit raporu kapsamınız dışında" çıkıyor, ama tablo filtresiz Savunma verisini (Toplam 12) göstermeye devam ediyor ve filtre ISTIHBARAT'ta kalıyor. Sonuç yanıltıcı bir rapor. Beklenen: yalnızca `yonetebilir` Unit'ler ve Ekipler seçenek olarak sunulmalı; hata durumunda tablo gizlenmeli.
- **Düzeltme:** Seçenekleri `u.yonetebilir` ve `e.yonetebilir` ile filtrele. Hata gelince `setR(null)` yap. Efor S.

### UX-09: Assignee, Kabul Bekliyor'daki Task'ı tek tıkla İptal edebiliyor (ret gerekçesi atlanıyor)
- **P sınıfı:** Demo P1 · Prod P1 (PLAUSIBLE kabul zinciri sorunu. Kural ihlali teyit edilirse CONFIRMED + yetki → P0. GUV/KOD kontrolleri doğrulamalı.)
- **Hüküm:** PLAUSIBLE (davranış gözlendi; spec 04 "Requester yalnızca iptal eder" diyor, Assignee'nin iptali hakkında açık değil)
- **Konum:** `src/web/pages/Tasklar.tsx:110,131-135` (Assignee'ye "→ İptal" gösteriliyor), sunucu `src/server/modules/task/durum.ts:76` (yalnızca Requester kısıtlanıyor)
- **Senaryo:** cti1 (Assignee), waf1'in açtığı "Kabul UI testi" ve "Stale test" Task'larında "→ İptal"e bastı. Onay sorulmadı, Task İptal oldu (`IPTAL: []` olduğu için geri dönüşü yok). Reddet yolundaki zorunlu ret gerekçesi ve Requester'ın yeniden atama hakkı atlanmış oldu. Beklenen: Assignee Kabul Bekliyor'da yalnızca Kabul et ve Reddet görmeli.
- **Düzeltme:** İptal'i Requester, Sorumlu yönetici ve Direktör ile sınırla (sunucu + UX-03'teki `izinliGecisler`), bunun için seam testi ekle. Arayüzde iptal için onay iste. Efor S.

### UX-10: Geri alınamaz işlemler onay istemiyor
- **P sınıfı:** Demo P2 · Prod P1 (gerçek kullanıcıda yanlış tık geri dönüşü olmayan İptal'e ya da yanlış organizasyon değişikliğine yol açar)
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:131-135` (İptal), `src/web/pages/KabulKontrolleri.tsx:57` (İptal et), `src/web/pages/Organizasyon.tsx:75` (Team Head "×"), `:95` (Çıkar), `:127` ("Taşı →" seçildiği anda taşıyor)
- **Senaryo:** Direktör ya da Unit Head "Taşı →" listesinden yanlışlıkla bir Ekip seçerse Çalışan anında taşınıyor. "×" Team Head'i tek tıkla kaldırıyor. Beklenen: işlemin sonucunu anlatan bir onay adımı, ya da geri al seçeneği.
- **Düzeltme:** Ortak bir `OnayDugmesi` bileşeni yaz (satır içi "Emin misiniz? Evet / Vazgeç"). "Taşı" için seç ve sonra onayla. Efor S.

### UX-11: Sunucu hataları ham hâliyle gösteriliyor (Prisma çıktısı, dosya yolu)
- **P sınıfı:** Demo P1 · Prod P1 (rubrik: hatalarda iç detay sızması)
- **Hüküm:** PLAUSIBLE (arayüzden tetiklenmesi gözlenmedi; API'de görüldü)
- **Konum:** `src/web/api.ts:32` (`data.mesaj` olduğu gibi gösteriliyor); kaynak `src/server/http/app.ts:56` sonrası hata işleyici
- **Senaryo:** `POST /api/tasks` ile `bitisTarihi:"abc"` gönderilince `{"hata":"SUNUCU","mesaj":"\nInvalid \`tx.task.create()\` invocation in /Users/.../task/index.ts:67..."}` dönüyor. Arayüz bunu kırmızı metin olarak olduğu gibi basar. Tarih input'u bu girdiyi engellediği için arayüzden tetiklenmesi zor, ama başka her 5xx aynı yoldan ekrana gelir. Beklenen: "Beklenmeyen bir hata oluştu, tekrar deneyin" türünden bir mesaj.
- **Düzeltme:** `api.ts` içinde `hata === 'SUNUCU'` ya da `status >= 500` ise genel bir Türkçe mesaj göster; sunucuda `mesaj`'ı maskele. GUV/KOD bulgularıyla mükerrer olabilir. Efor S.

### UX-12: Hata mesajları işlemin yanında değil ve her zaman temizlenmiyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:61`, `src/web/pages/BekleyenIslerim.tsx:18-19` (başarıda `setHata(null)` yok), `src/web/pages/Etkinlik.tsx:26-27`, `src/web/pages/Bildirimler.tsx:13`
- **Senaryo:** Hatalar tek bir sayfa üstü `<p className="hata">` alanında çıkıyor. Bekleyen işlerim ve Etkinlikler'de bir hatadan sonra başarılı bir yanıt verilse bile hata metni ekranda kalıyor. Başarı geri bildirimi hiçbir sayfada yok.
- **Düzeltme:** Hata ve başarı mesajlarını işlem bileşeninin yanında tut; her başarılı işlemde temizle; kısa bir "Kaydedildi" bildirimi göster. Efor S.

### UX-13: Öncelik ham enum olarak gösteriliyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:43`, `:93`, `:198`
- **Senaryo:** Kartlarda, listede ve formda "YUKSEK", "DUSUK", "KRITIK" yazıyor. Durumlar Türkçeleştirildiği hâlde (`DURUMLAR`) öncelikler değil; Türkçe karakter de yok.
- **Düzeltme:** `ONCELIK_ADI = { DUSUK:'Düşük', ORTA:'Orta', YUKSEK:'Yüksek', KRITIK:'Kritik' }` tanımla (`format.ts`); KRITIK'e ayrıca bir simge ya da metin vurgusu ekle. Efor S.

### UX-14: Gecikme yalnızca renkle belirtiliyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/styles.css:18`, `src/web/pages/Tasklar.tsx:42,90`, `src/web/pages/BekleyenIslerim.tsx:48`, `src/web/pages/Rapor.tsx:31`
- **Senaryo:** "Tehdit aktörü profili: APT-X" ile "SIEM korelasyon kuralı" kırmızı kenar ve açık kırmızı zeminle işaretli; metin olarak "Gecikti" yazmıyor. Renk körü kullanıcı ve projektör ayrımı göremez. Kartta "kimi bekliyor" bilgisi de yalnızca Kabul Bekliyor'da var.
- **Düzeltme:** Geciken öğeye "Gecikti · N gün" etiketi ve simge ekle. Efor S.

### UX-15: Form alanlarının etiketi yok; yer tutucu metin etiket yerine kullanılıyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED (Yeni Task formunda 7 alandan 4'ünün etiketi yok)
- **Konum:** `src/web/pages/Tasklar.tsx:178-179,202-203`, `src/web/pages/Duyuru.tsx:50-60`, `src/web/pages/Etkinlik.tsx:58-60`, `src/web/pages/Yetkinlik.tsx:33-34`, `src/web/pages/Organizasyon.tsx:12,127,144-145,170-188` ("×" için `aria-label` yok), `src/web/pages/KabulKontrolleri.tsx:53`, `src/web/pages/Rapor.tsx:71,75`
- **Senaryo:** Ekran okuyucu "Başlık", "Kurum" gibi alanları adlandıramıyor; yazmaya başlayınca kullanıcı da alanın ne olduğunu unutuyor. Yazı boyutları karışık (etiket 16px, input 13px).
- **Düzeltme:** Her alana görünür bir `<label>` ekle; ikon düğmelere `aria-label` ver. Efor S.

### UX-16: İstemci tarafında doğrulama yok; bazı işlemler sessizce yok sayılıyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Yetkinlik.tsx:42`, `src/web/pages/Duyuru.tsx:62`, `src/web/pages/Etkinlik.tsx:78` (sıfır Ekip ile davetsiz etkinlik oluşuyor), `src/web/pages/Organizasyon.tsx:188` (Unit seçilmeden "Ata" hiçbir şey yapmıyor), `:146` (boş ad sessizce yok sayılıyor, unvan siliniyor)
- **Senaryo:** Yetkinlik'te boş "Ekle" → "Ad ve kurum gerekli" sayfa üstünde çıkıyor; tarih boşsa ayrıca "Geçerli bir tarih gerekli". Etkinlik hiçbir Ekip seçilmeden "Oluştur ve davet et" ile oluşuyor ve "Davetli yok" olarak listeleniyor.
- **Düzeltme:** Zorunlu alanlara `required` ve satır içi mesaj ekle; eksik alan varken düğmeyi devre dışı bırak; sıfır davetli için uyarı göster. Efor S.

### UX-17: Etkin görünüm `disabled` düğmeyle gösteriliyor; etkin sayfa belirsiz
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:63-64`, `src/web/App.tsx:54`, `src/web/styles.css:5`
- **Senaryo:** Seçili "Pano" ya da "Liste" soluk gri, kullanılamaz bir düğme gibi görünüyor. Menüde etkin sayfa yalnızca `#fff2` zeminle ayrışıyor; `aria-current` yok.
- **Düzeltme:** Segment kontrolü (`aria-pressed`) kullan; etkin menü öğesine `aria-current="page"` ve belirgin bir alt çizgi ekle. Efor S.

### UX-18: Dar pencerede başlık sarmıyor; kullanıcı adı ve Çıkış ekran dışında
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED (800px'te scrollWidth 883px; ekran görüntüsü `23-narrow-bekleyen.png`)
- **Konum:** `src/web/styles.css:2-3`
- **Senaryo:** 800px genişlikte "Cem Yıldız · Team Head" kesiliyor, Çıkış görünmüyor, sayfa yatay kayıyor. Rol bilgisi kayboluyor.
- **Düzeltme:** `header { flex-wrap: wrap }` ve `nav { flex-wrap: wrap }` ekle; kimlik bloğunu ayrı bir satıra al. Efor S.

### UX-19: Bildirimler ilgili kayda götürmüyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Bildirimler.tsx:21-26` (`varlikTuru` ve `varlikId` kullanılmıyor)
- **Senaryo:** waf1 "Kerem Özdemir Task'ı reddetti…" bildirimini okuyor, ama bildirimden Task'a gidemiyor. "Tümünü okundu say" yok; okunmuş bildirim yalnızca saydamlıkla ayrışıyor. Menüde okunmamış sayısı da yok.
- **Düzeltme:** Bildirimi tıklanabilir yap (Task'lar ya da Duyurular'a git); menü düğmesine okunmamış sayısını ekle; "Tümünü okundu" düğmesi koy. Efor S.

### UX-20: Boş durumlar yönlendirmiyor; Yetkinlik bitişi vurgulanmıyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:72-79` (boş sütunlar), `src/web/pages/Yetkinlik.tsx:44-65` (liste boşken yalnızca başlıklı tablo), `src/web/pages/BekleyenIslerim.tsx:26`, `src/web/pages/Duyuru.tsx:67`
- **Senaryo:** Boş durumlar ("Duyuru yok.", "Üzerinizde bekleyen iş yok.") ne görüneceğini ve ilk öğenin nasıl oluşturulacağını söylemiyor. Yetkinlik'te bitişi yaklaşan OSCP (08.12.2026) vurgulanmıyor.
- **Düzeltme:** Boş durum metinlerine bir eylem ekle (ör. "+ Yeni Task"). Bitişi 30 gün içinde olan ya da geçmiş Yetkinlik'e metin etiketi koy. Efor S.

### UX-21: Birden çok Ekip'in Team Head'i için Ekip filtresi ve bağlam yok
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Tasklar.tsx:58-102`, `src/web/App.tsx:59-61`
- **Senaryo:** thCoklu Task'lar listesinde 21 Task görüyor (WAF, SOC, ayrıca görünür CTI ve OSINT Task'ları). Ekip'e göre süzemiyor ya da sıralayamıyor. Başlıkta yalnızca "Team Head" yazıyor, hangi Ekipler olduğu görünmüyor. Tek görünümden çalışmak mümkün ama yavaş.
- **Düzeltme:** Pano ve liste üstüne Ekip, Durum ve "bana ait" filtreleri ekle; başlıkta rolün yanına Ekip kodlarını yaz (ör. "Team Head · TEAM-WAF, TEAM-SOC"). Efor M.

### UX-22: Tarih gösterimi: saniye, saat dilimi kayması
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/BekleyenIslerim.tsx:48`, `src/web/pages/Tasklar.tsx:163`
- **Senaryo:** Bekleyen işlerim'de termin "21.11.2026 15:39:38" diye saniyesiyle gösteriliyor. Yalnızca tarih olarak girilen Bitiş (25.11.2026) UTC gece yarısı kaydedildiği için "25.11.2026 03:00:00" görünüyor. Geçmiş tarihli Bitiş (10.11.2026) uyarısız kabul ediliyor.
- **Düzeltme:** Ortak bir `tarihGoster` yardımcısı yaz (gün, gerekiyorsa saat:dakika); yalnızca tarih olan değerleri saatsiz göster; geçmiş tarih için uyarı ver. Efor S.

### UX-23: Kısa süreler 0 olarak gösteriliyor
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED
- **Konum:** `src/web/pages/Rapor.tsx:8`, `src/web/pages/Tasklar.tsx:146`
- **Senaryo:** Rapor'da "Kabul bekleme süresi: 0 sa ort. (2 Task)", tarihçede "Blok süresi: 0.0 saat" yazıyor.
- **Düzeltme:** 1 saatin altındaki süreleri dakika olarak göster ("< 1 dk"). Efor S.

### UX-24: Soluk metnin kontrastı pano zemininde yetersiz
- **P sınıfı:** Demo P2 · Prod P2
- **Hüküm:** CONFIRMED (hesap: `#6b7280` metin `#eceff3` zeminde 4.19:1, `#fef2f2` zeminde 4.42:1; 13px metin için gereken 4.5:1)
- **Konum:** `src/web/styles.css:10,16,18`
- **Senaryo:** Sütun başlıklarındaki sayaçlar, "Kabul tarihçesi" düğmesi ve geciken kartlardaki soluk metin projektörde zor okunuyor.
- **Düzeltme:** `.soluk` rengini `#4b5563` yap. Efor S.

## Özet sayılar

| Ortam | P0 | P1 | P2 |
|---|---|---|---|
| Demo | 0 | 9 (UX-01, 02, 03, 04, 05, 06, 07, 09, 11) | 15 |
| Prod | 0 | 10 (Demo P1'leri + UX-10) | 14 |

## Çalıştırılan komutlar ve sonuçları

- `PORT=5182 npm run dev` (main checkout): `Siber Task  http://localhost:5182   (Postgres :49970, db siber_task)`. Kontrol bitince arka plan görevi durduruldu; 5182'de dinleyen süreç kalmadı. `pgrep -fl "src/server/dev.ts|embedded-postgres"` yalnızca diğer kontrollerin worktree'lerindeki (`.claude/worktrees/agent-*`) süreçleri gösteriyor; main checkout'a ait süreç kalmadı.
- Headless Chrome (`--remote-debugging-port=9333`) + `/tmp/ux-cdp/cdp.mjs` (CDP sürücüsü), senaryolar `s1–s6.json`: 1280px ve 800px'te 24 ekran görüntüsü alındı, 2 Ret ve 2 Bloklu prompt diyaloğu yakalandı. Chrome kapatıldı.
- REST ile akış doğrulama (curl):
  - waf1 → cti1 Task oluşturma: 201, `KABUL_BEKLIYOR`.
  - cti1 kabul: zincir `ASSIGNEE: KABUL`, `SORUMLU: BEKLIYOR`.
  - cti1 boş gerekçeyle ret: `DOGRULAMA "Ret gerekçesi zorunlu"`. Gerekçeyle ret: `REDDEDILDI`.
  - thCti kabul → `KABUL_EDILDI`; Devam Ediyor; nedensiz Bloklu: `DOGRULAMA`; nedenli Bloklu; Tamamlandı; `/gecmis` 4 geçiş.
  - Requester'ın geçişi: `YETKI "Requester yalnızca İptal edebilir"`. Assignee İptal: **başarılı** (UX-09).
  - Direktör `/api/denetim`: kayıtlar dönüyor. waf1 `/api/denetim`: `YETKI`.
  - uhSavunma rapor `unitId=unit-istihbarat`: `YETKI`.
  - Direktörlük Duyurusu: oluştu. Etkinlik yanıtı: `{ok:true}`. Yetkinlik doğrulamaları: `DOGRULAMA` mesajları.
  - Geçersiz `bitisTarihi`: `SUNUCU` ve ham Prisma metni (UX-11).
- `npm test`, `npm run typecheck`, `npm audit`: bu kontrolde **çalıştırılmadı**; `kod` ve `guvenlik` kontrollerinin kapsamında.

## Erişilemeyenler ve notlar

- Dev veritabanı her başlangıçta yeniden kuruluyor. Test sırasında yapılan değişiklikler (waf1'in unvanının silinmesi, osint1'in TEAM-WAF'a eklenmesi, Direktör'ün TEAM-PENTEST Team Head'i yapılması, "UX test" Task'ları) ekran görüntülerinde görünüyor ama kalıcı değil.
- Klavye gezintisi ve ekran okuyucu gerçek cihazda denenmedi; erişilebilirlik bulguları DOM incelemesine (etiketler) ve kontrast hesabına dayanıyor.
- Bekleyen işlerim'deki Etkinlik daveti için "beklemeBaslangici" ileri bir tarih (etkinlik zamanı) olarak geliyor; UX etkisi küçük olduğu için ayrı bulgu yazılmadı.
- GUV/KOD'a devredilecek: UX-09 (Assignee iptali ve kabul zinciri) ve UX-11 (ham hata metni). Sunucu tarafında olası kural ihlali olduğu için doğrulanmalı.
