// Genel Bakış: mevcut uçlardan (Task'lar, bekleyenler, organizasyon, etkinlik, duyuru, yetkinlik) türetilen açılış sayfası.
import type { ReactNode } from 'react';
import { acikMi, anaRol, ayAdi, gecikti, gunFarki, ONCELIK_ADI, ONCELIK_RENK, ONCELIKLER, rolAdi, takvimGunu, tarihGoster } from '../format';
import { AlanGrafigi, HalkaGrafik } from '../grafik';
import { useTaskIslemleri } from '../gorev';
import { useUygulama, useVeri } from '../uygulama';
import { Avatar, Bos, DurumPill, EkipAvatar, Ikon, OncelikPill, Termin } from '../ui';
import { DavetKarti, KabulKarti, useOnayOgeleri } from './OnayKutusu';
import { DuyuruSatiri, EtkinlikSatiri, YetkinlikSatiri } from './Etkinlik';
import type { DuyuruGorunumu, EtkinlikGorunumu, TaskGorunumu, YetkinlikGorunumu } from '../types';

const ONCELIK_SIRA = (t: TaskGorunumu) => ONCELIKLER.indexOf(t.oncelik);
const terminSira = (t: TaskGorunumu) => (t.bitisTarihi ? new Date(t.bitisTarihi).getTime() : Infinity);
const ayniGun = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Liste satırı: öncelik şeridi, başlık, durum, Requester, termin, Assignee. */
export function TaskSatiri({ t, yan }: { t: TaskGorunumu; yan?: ReactNode }) {
  const u = useUygulama();
  return (
    <button className="row" onClick={() => u.taskAc(t.id)}>
      <span className={`stripe p-${{ KRITIK: 'crit', YUKSEK: 'high', ORTA: 'med', DUSUK: 'low' }[t.oncelik]}`} />
      <span className="row-main">
        <span className="row-title">{t.baslik}</span>
        <span className="row-meta">
          <DurumPill d={t.durum} />
          {t.ekipId && <span className="tag team">{u.ekipKodu(t.ekipId)}</span>}
          <span>{t.requesterId === u.ben.id ? 'Siz açtınız' : `Requester: ${u.kisiAdi(t.requesterId)}`}</span>
        </span>
      </span>
      <span className="row-side">
        {yan ?? <Termin t={t} />}
        {t.assigneeEkipId ? <EkipAvatar kod={u.ekipKodu(t.assigneeEkipId)} /> : <Avatar ad={u.assigneeAdi(t)} />}
      </span>
    </button>
  );
}

export function GenelBakisSayfasi() {
  const u = useUygulama();
  const onay = useOnayOgeleri();
  const islem = useTaskIslemleri();
  const etkinlik = useVeri<EtkinlikGorunumu[]>('/etkinlik');
  const duyuru = useVeri<DuyuruGorunumu[]>('/duyuru');
  const yetkinlik = useVeri<YetkinlikGorunumu[]>('/yetkinlik');

  const ben = u.ben;
  const rol = anaRol(ben.roller);
  const tum = (u.tasklar ?? []).filter((t) => t.durum !== 'TASLAK');
  const benimle = (t: TaskGorunumu) => t.assigneeKullaniciId === ben.id || (!!t.assigneeEkipId && ben.ekipIds.includes(t.assigneeEkipId)) || t.requesterId === ben.id;
  const ilgili = u.yonetici ? tum : tum.filter(benimle);
  const acik = ilgili.filter(acikMi);
  const geciken = acik.filter(gecikti).length;
  const onaySayisi = onay.kabuller.length + onay.davetler.length + onay.reddedilenler.length;

  // Son 7 gün: açılan (oluşturma) ve tamamlanan (Tamamlandı Task'ların son güncellemesi).
  const gunler = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const acilan = gunler.map((g) => ilgili.filter((t) => ayniGun(new Date(t.olusturma), g)).length);
  const kapanan = gunler.map((g) => ilgili.filter((t) => t.durum === 'TAMAMLANDI' && ayniGun(new Date(t.guncelleme), g)).length);
  const haftaKapanan = kapanan.reduce((a, b) => a + b, 0);

  const parcalar = ONCELIKLER.map((o) => ({ l: ONCELIK_ADI[o], renk: ONCELIK_RENK[o], v: acik.filter((t) => t.oncelik === o).length }));
  const sicak = acik
    .filter((t) => t.oncelik === 'KRITIK' || t.oncelik === 'YUKSEK')
    .sort((a, b) => ONCELIK_SIRA(a) - ONCELIK_SIRA(b) || terminSira(a) - terminSira(b))
    .slice(0, 6);
  const uzerimde = tum
    .filter((t) => (t.assigneeKullaniciId === ben.id || (!!t.assigneeEkipId && ben.ekipIds.includes(t.assigneeEkipId))) && ['KABUL_EDILDI', 'DEVAM_EDIYOR', 'BLOKLU'].includes(t.durum))
    .sort((a, b) => terminSira(a) - terminSira(b));

  // Ekibim bir bakışta: yönettiğim Ekiplerin üyeleri.
  const ekipUyeleri = new Map<string, { ad: string; ekipler: string[] }>();
  for (const unit of u.org?.unitler ?? [])
    for (const e of unit.ekipler)
      if (e.yonetebilir)
        for (const k of e.uyeler ?? []) {
          if (k.id === ben.id) continue;
          const m = ekipUyeleri.get(k.id) ?? { ad: k.ad, ekipler: [] };
          m.ekipler.push(e.kod);
          ekipUyeleri.set(k.id, m);
        }
  const ekibim = [...ekipUyeleri].map(([id, m]) => {
    const ts = tum.filter((t) => t.assigneeKullaniciId === id);
    const ac = ts.filter((t) => ['KABUL_EDILDI', 'DEVAM_EDIYOR', 'BLOKLU'].includes(t.durum));
    return { id, ...m, acik: ac.length, kabul: ts.filter((t) => t.durum === 'KABUL_BEKLIYOR').length, bloklu: ac.filter((t) => t.durum === 'BLOKLU').length, geciken: ac.filter(gecikti).length };
  });

  const yaklasan = (etkinlik.veri ?? [])
    .filter((e) => new Date(e.baslangic).getTime() >= Date.now())
    .sort((a, b) => a.baslangic.localeCompare(b.baslangic))
    .slice(0, 3);
  const bitenler = (yetkinlik.veri ?? [])
    .filter((y) => y.bitisTarihi && gunFarki(y.bitisTarihi) <= 60)
    .sort((a, b) => a.bitisTarihi!.localeCompare(b.bitisTarihi!));

  const saat = new Date().getHours();
  const selam = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
  const bugun = takvimGunu(new Date());
  const tarihMetni = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  const yonetilenSayisi = u.yonetilenEkipIds.size;

  return (
    <>
      <div className="head-row">
        <p className="sub">
          {selam} {ben.ad.split(' ')[0]}. {tarihMetni} · {rolAdi(rol)} görünümü
          {u.yonetici && yonetilenSayisi > 0 && ` · sorumluluğunuzda ${yonetilenSayisi} Ekip`}
        </p>
      </div>
      {u.tasklarHata && <div className="err-box">{u.tasklarHata}</div>}
      <section className="tiles" aria-label="Özet">
        <button className="tile" onClick={() => u.git('gorevler')}>
          <span className="ti blue">{Ikon.tShield}</span>
          <span className="tx">
            <span className="lbl">{u.yonetici ? 'Açık Task' : "Açık Task'larım"}</span>
            <span className="val">{acik.length}</span>
          </span>
        </button>
        <button className="tile" onClick={() => u.git('onaylar')}>
          <span className="ti gold">{Ikon.tInbox}</span>
          <span className="tx">
            <span className="lbl">Kararınızı Bekleyen ↗</span>
            <span className="val">{onaySayisi}</span>
          </span>
        </button>
        <div className="tile">
          <span className="ti red">{Ikon.tWarn}</span>
          <span className="tx">
            <span className="lbl">Geciken Task</span>
            <span className="val">{geciken}</span>
          </span>
        </div>
        <div className="tile">
          <span className="ti green">{Ikon.tTrend}</span>
          <span className="tx">
            <span className="lbl">Son 7 Günde Tamamlanan</span>
            <span className="val">{haftaKapanan}</span>
          </span>
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="panel-head">
            <h2>Haftalık Task Trendi</h2>
            <div className="legend">
              <span><i style={{ background: '#F5C518' }} />Açılan</span>
              <span><i style={{ background: '#34D399' }} />Tamamlanan</span>
            </div>
          </div>
          <div className="chart-wrap">
            <AlanGrafigi acilan={acilan} kapanan={kapanan} etiketler={gunler.map((g) => (ayniGun(g, bugun) ? 'Bugün' : `${g.getDate()} ${ayAdi(g)}`))} />
          </div>
          <p className="hint">Tamamlanan: son güncellemesi o güne düşen Tamamlandı durumundaki Task'lar.</p>
        </section>
        <section className="panel">
          <h2>Öncelik Dağılımı</h2>
          <div className="donut-box">
            <HalkaGrafik parcalar={parcalar} etiket="açık Task" />
            <div className="legend vert">
              {parcalar.map((x) => (
                <span key={x.l}>
                  <i style={{ background: x.renk }} />
                  {x.l} <b style={{ color: 'var(--fg)', marginLeft: 4 }}>{x.v}</b>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Kritik ve Yüksek Öncelikli Açık Task'lar</h2>
          <button className="link" onClick={() => u.git('gorevler')}>
            Tümünü Gör
          </button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Assignee</th>
                <th>Öncelik</th>
                <th>Durum</th>
                <th>Bitiş</th>
                <th>Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {sicak.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="t-title">{t.baslik}</span>
                  </td>
                  <td>
                    <span className="who-inline">
                      {t.assigneeEkipId ? <EkipAvatar kod={u.ekipKodu(t.assigneeEkipId)} /> : <Avatar ad={u.assigneeAdi(t)} />}
                      {u.assigneeAdi(t)}
                    </span>
                  </td>
                  <td>
                    <OncelikPill o={t.oncelik} />
                  </td>
                  <td>
                    <DurumPill d={t.durum} />
                  </td>
                  <td>
                    <Termin t={t} />
                  </td>
                  <td>
                    <button className="link" onClick={() => u.taskAc(t.id)}>
                      Detay
                    </button>
                  </td>
                </tr>
              ))}
              {!sicak.length && (
                <tr>
                  <td colSpan={6} className="hint">
                    Kritik veya yüksek öncelikli açık Task yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <div className="stack">
          {onaySayisi > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Kararınızı Bekleyenler</h2>
                <button className="link" onClick={() => u.git('onaylar')}>
                  Onay kutusunu aç
                </button>
              </div>
              {onay.kabuller.slice(0, 2).map((o) => (
                <KabulKarti key={o.is.id} o={o} islem={islem} />
              ))}
              {onay.kabuller.length < 2 && onay.davetler.slice(0, 2 - onay.kabuller.length).map((d) => <DavetKarti key={d.id} is={d} />)}
              {onay.kabuller.length + onay.davetler.length === 0 && (
                <p className="hint">{onay.reddedilenler.length} reddedilen Task'ınız yeniden atama veya iptal kararı bekliyor.</p>
              )}
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>Üzerimdeki İşler</h2>
              <button className="link" onClick={() => u.git('gorevler')}>
                Panoya git
              </button>
            </div>
            <div className="rows">
              {uzerimde.map((t) => (
                <TaskSatiri key={t.id} t={t} />
              ))}
              {!uzerimde.length && (
                <Bos eylem={<button className="btn sm" onClick={u.yeniTask}>{Ikon.plus} Yeni Task</button>}>Üzerinizde açık Task yok.</Bos>
              )}
            </div>
          </section>
          {u.yonetici && ekibim.length > 0 && (
            <section className="panel">
              <h2>Ekibim Bir Bakışta</h2>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kişi</th>
                      <th>Ekip</th>
                      <th className="num">Açık</th>
                      <th className="num">Kabul bekleyen</th>
                      <th className="num">Bloklu</th>
                      <th className="num">Geciken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ekibim.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span className="who-inline">
                            <Avatar ad={m.ad} />
                            {m.ad}
                          </span>
                        </td>
                        <td>
                          {m.ekipler.map((k) => (
                            <span key={k} className="tag team" style={{ marginRight: 4 }}>
                              {k}
                            </span>
                          ))}
                        </td>
                        <td className="num">{m.acik}</td>
                        <td className="num">{m.kabul}</td>
                        <td className="num">{m.bloklu}</td>
                        <td className="num" style={m.geciken ? { color: '#F87171', fontWeight: 700 } : undefined}>
                          {m.geciken}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Yaklaşan Etkinlikler</h2>
              <button className="link" onClick={() => u.git('etkinlikler')}>
                Tümü
              </button>
            </div>
            <div>
              {yaklasan.map((e) => (
                <EtkinlikSatiri key={e.id} e={e} />
              ))}
              {etkinlik.veri && !yaklasan.length && <Bos>Yaklaşan etkinlik yok.</Bos>}
            </div>
          </section>
          <section className="panel">
            <h2>Duyurular</h2>
            <div>
              {(duyuru.veri ?? []).slice(0, 2).map((d) => (
                <DuyuruSatiri key={d.id} d={d} />
              ))}
              {duyuru.veri && !duyuru.veri.length && <Bos>Duyuru yok.</Bos>}
            </div>
          </section>
          {bitenler.length > 0 && (
            <section className="panel">
              <h2>Süresi Yaklaşan Yetkinlikler</h2>
              <div>
                {bitenler.map((y) => (
                  <YetkinlikSatiri key={y.id} y={y} />
                ))}
              </div>
              <p className="hint">Bitişine 60 gün veya daha az kalan ya da süresi dolmuş kayıtlar · son kontrol {tarihGoster(new Date(), false)}</p>
            </section>
          )}
        </div>
      </div>
      {islem.modal}
    </>
  );
}
