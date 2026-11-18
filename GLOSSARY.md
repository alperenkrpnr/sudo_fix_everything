# Siber Güvenlik Task Yönetimi

Siber güvenlik direktörlüğünün günlük işlerini task olarak atayıp takip etmek, etkinlikleri yönetmek ve raporlamak için kullanılan kurum içi araç.

## Organizasyon

**Direktörlük**:
Tüm Unit'leri kapsayan, organizasyonun en üst seviyesi (Siber Güvenlik Direktörlüğü).
_Avoid_: Departman, müdürlük

**Direktör**:
Direktörlüğün başındaki kişi. Tüm task, kullanıcı ve verilerde tam yetkilidir.
_Avoid_: Director, admin

**Unit**:
Birden fazla Ekip'in birleşiminden oluşan birim.
_Avoid_: Birim, bölüm

**Unit Head**:
Bir Unit'in yöneticisi. Bir Unit Head birden fazla Unit'ten sorumlu olabilir.
_Avoid_: Unit müdürü

**Ekip**:
Çalışanlardan oluşan en küçük organizasyon birimi (örn. TEAM-WAF). Tek bir Unit'e bağlıdır.
_Avoid_: Takım, grup

**Team Head**:
Bir Ekip'in yöneticisi. Bir Team Head birden fazla Ekip'ten sorumlu olabilir. Bazı Ekipler'in Team Head'i yoktur; bu Ekipler doğrudan Unit Head'e bağlıdır.
_Avoid_: Takım lideri, ekip lideri

**Üst yönetici**:
Bir kişinin yönetim zincirinde üstündeki yöneticiler (Team Head → Unit Head → Direktör). Yetki zincirde yukarı doğru kapsar; yönetici, altındaki herkesin Task ve onaylarını görür ve düzenler.

**Sorumlu yönetici**:
Bir Ekip'in Task kabul, delegasyon ve görünürlük işlemlerinde yetkili yöneticisi: Team Head varsa o, yoksa Unit Head.

**Yönetici**:
Team Head ve Unit Head için ortak üst terim. "Yönetici" rolü bu ikisini kapsar.

**Çalışan**:
Bir Ekip'e üye olan, yönetici rolü olmayan kullanıcı.
_Avoid_: Personel, kullanıcı (rol belirtilmeden)

## Task

**Task**:
Bir kişiye veya Ekip'e atanan iş birimi.
_Avoid_: İş, ticket, görev

**Requester**:
Task'ı açan kişi.
_Avoid_: Oluşturan, sahip

**Assignee**:
Task'ın atandığı tek bir kişi veya tek bir Ekip.
_Avoid_: Atanan, owner

**Self-assign**:
Requester'ın Task'ı kendi üzerine açması. Otomatik kabul edilmiş sayılır.

**Direkt kabul**:
Accept/refuse adımı olmadan Task'ın doğrudan kabul edilmiş sayılması (Yönetici → kendi çalışanı, Direktör → herkes).

**Delegasyon**:
Ekip'e atanan Task'ın Team Head tarafından Ekip içinden bir Çalışan'a atanması.

**Ret gerekçesi**:
Task reddedilirken zorunlu olarak yazılan açıklama.

**Backlog**:
Tarihi veya sırası belli olmayan, bekleyen Task'lar.
_Avoid_: Yedek iş

**Tekrarlayan task**:
Belirli aralıklarla otomatik yeniden oluşan rutin Task (günlük, haftalık).
_Avoid_: Rutin iş

## Onay ve Eskalasyon

**Vekil**:
Yöneticinin yokluğunda onay yetkisini geçici devrettiği kişi: kendi Ekibi'nden bir Çalışan veya Direktörlük'teki başka bir Yönetici. Başka Ekip'in Çalışanı vekil olamaz.
_Avoid_: Yedek, delegate

**Eskalasyon**:
Süresi içinde onaylanmayan bir talebin bir üst yöneticiye taşınması (varsayılan 3 iş günü).

**Bekleyen işlerim**:
Bir yöneticinin kendi üzerinde bekleyen tüm onayları (Task kabulü, etkinlik onayı vb.) tek yerde gösteren pano.

## Etkinlik ve Yetkinlik

**Etkinlik**:
Tarihi olan organizasyonel olay. Tipi: iç, dış katılım veya dış konuşmacı.
_Avoid_: Event, toplantı (genel anlamda)

**İç etkinlik**:
Organizasyon içinde planlanan etkinlik (iletişim toplantısı vb.). Onay gerektirmez, davet ve katılım yanıtı vardır.

**Dış katılım**:
Çalışan veya Ekip'in dış kurumdaki eğitim/konferansa katılması. Sorumlu yönetici onayı gerekir.

**Dış konuşmacı**:
Çalışanın dış kurumda eğitim veya konferans vermesi. Sorumlu yönetici onayı gerekir.

**Yetkinlik**:
Bir Çalışan'ın sertifikası veya eğitim kaydı; bitiş tarihi olabilir.
_Avoid_: Skill, sertifika (genel anlamda)

**Duyuru**:
Hedef kitlesi Ekip, Unit veya Direktörlük olan bilgilendirme.

## Denetim

**Denetim izi**:
Tüm atama, kabul, ret, durum değişimi, vekil ve ajan işlemlerinin silinemeyen, yalnızca eklenebilen kaydı.
_Avoid_: Log, geçmiş

**Ajan işlemi**:
Bir AI ajanının API veya MCP üzerinden bir kullanıcı adına yaptığı işlem; denetim izinde ayrıca işaretlenir.

**Tekrar şablonu**:
Tekrarlayan task'ın kuralını (periyot, atama) tutan tanım; zamanı gelince Task üretir.
