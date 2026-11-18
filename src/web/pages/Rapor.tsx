// Raporlar: rol kapsamındaki özet (servis katmanı hesaplar), Ekip bazlı performans ve bekleme
// süreleri, ret raporu, Çalışan karşılaştırması (yalnızca yöneticiler).
import { useState } from 'react';
import { acikMi, saatSure, tarihGoster } from '../format';
import { gerekceAyir } from '../gorev';
import { useCokluVeri, useUygulama, useVeri } from '../uygulama';
import { Avatar, Bos, HataKutusu, Ikon, Yukleniyor } from '../ui';
import { TaskSatiri } from './GenelBakis';
import type { RaporOzeti } from '../types';

const yuzde = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ekipYolu = (ekipId: string, tarih: string) => `/rapor?ekipId=${ekipId}${tarih ? `&${tarih}` : ''}`;
const bugunUtc = () => new Date().toISOString().slice(0, 10);

/** "Son N gün" → YYYY-MM-DD (UTC gün; bitiş = bugün dahil). Boş = tüm zamanlar. */
function aralikBaslangici(gun: string): string {
  if (!gun) return '';
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(gun) + 1);
  return d.toISOString().slice(0, 10);
}

function AralikSecimi(p: { deger: string; onDegis: (v: string) => void; ozel: { bas: string; bit: string }; onOzel: (v: { bas: string; bit: string }) => void }) {
  return (
    <>
      <div className="field">
        <label htmlFor="r-aralik">Tarih aralığı (oluşturma)</label>
        <select id="r-aralik" value={p.deger} onChange={(e) => p.onDegis(e.target.value)}>
          <option value="">Tüm zamanlar</option>
          <option value="7">Son 7 gün</option>
          <option value="30">Son 30 gün</option>
          <option value="90">Son 90 gün</option>
          <option value="ozel">Özel aralık</option>
        </select>
      </div>
      {p.deger === 'ozel' && (
        <>
          <div className="field">
            <label htmlFor="r-bas">Başlangıç</label>
            <input id="r-bas" type="date" value={p.ozel.bas} onChange={(e) => p.onOzel({ ...p.ozel, bas: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r-bit">Bitiş</label>
            <input id="r-bit" type="date" value={p.ozel.bit} onChange={(e) => p.onOzel({ ...p.ozel, bit: e.target.value })} />
          </div>
        </>
      )}
    </>
  );
}

export function RaporSayfasi() {
  const u = useUygulama();
  const [filtre, setFiltre] = useState({ unitId: '', ekipId: '' });
  const [aralik, setAralik] = useState('');
  const [ozel, setOzel] = useState({ bas: '', bit: '' });
  const baslangic = aralik === 'ozel' ? ozel.bas : aralikBaslangici(aralik);
  const bitis = aralik === 'ozel' ? ozel.bit : '';
  const tarihQ = new URLSearchParams(Object.entries({ baslangic, bitis }).filter(([, v]) => v)).toString();
  const q = new URLSearchParams(Object.entries({ ...filtre, baslangic, bitis }).filter(([, v]) => v)).toString();
  /** Bitiş geçmişteyse durum ve geciken sayıları o günün sonundaki hâlidir. */
  const gecmisAnı = !!bitis && bitis < bugunUtc();
  const rapor = useVeri<RaporOzeti>(`/rapor${q ? `?${q}` : ''}`);
  const r = rapor.veri;
  const ekipYollari = (r?.ekipler ?? []).map((e) => ekipYolu(e.ekipId, tarihQ));
  const ekipRaporlari = useCokluVeri<RaporOzeti>(ekipYollari);

  const unitler = (u.org?.unitler ?? []).filter((x) => x.yonetebilir);
  const ekipSecenekleri = (u.org?.unitler ?? []).filter((x) => !filtre.unitId || x.id === filtre.unitId).flatMap((x) => x.ekipler).filter((e) => e.yonetebilir);
  const yonetici = r ? r.kapsam !== 'KENDI' : u.yonetici;

  const filtreler = (
    <div className="filters-bar">
      <AralikSecimi deger={aralik} onDegis={setAralik} ozel={ozel} onOzel={setOzel} />
      {yonetici && unitler.length > 1 && (
        <div className="field">
          <label htmlFor="r-unit">Unit</label>
          <select id="r-unit" value={filtre.unitId} onChange={(e) => setFiltre({ unitId: e.target.value, ekipId: '' })}>
            <option value="">Tümü</option>
            {unitler.map((x) => (
              <option key={x.id} value={x.id}>
                {x.ad}
              </option>
            ))}
          </select>
        </div>
      )}
      {yonetici && <div className="field">
        <label htmlFor="r-ekip">Ekip</label>
        <select id="r-ekip" value={filtre.ekipId} onChange={(e) => setFiltre({ ...filtre, ekipId: e.target.value })}>
          <option value="">Tümü</option>
          {ekipSecenekleri.map((e) => (
            <option key={e.id} value={e.id}>
              {e.kod}
            </option>
          ))}
        </select>
      </div>}
      <span className="hint" style={{ alignSelf: 'center' }}>
        Taslaklar hariç. Kapalı = Tamamlandı, İptal, Reddedildi.
        {gecmisAnı && (
          <>
            {' '}
            <b style={{ color: 'var(--gold)' }}>Bitiş tarihi itibarıyla:</b> durumlar ve geciken sayıları {tarihGoster(bitis, false)} gün sonundaki hâlidir.
          </>
        )}
      </span>
    </div>
  );

  if (rapor.hata)
    return (
      <>
        {filtreler}
        <HataKutusu mesaj={rapor.hata} />
      </>
    );
  if (!r) return <Yukleniyor />;

  const g = r.genel;
  const kabul = r.kabulBekleme;
  const blok = r.blokSuresi;

  if (!yonetici) {
    const acikIslerim = (u.tasklar ?? []).filter((t) => t.assigneeKullaniciId === u.ben.id && acikMi(t));
    return (
      <>
        <div className="head-row">
          <p className="sub">Size atanan Task'lardan hesaplanır. Ekip ve kişi karşılaştırmaları yalnızca yöneticilere açıktır.</p>
        </div>
        {filtreler}
        <section className="tiles simple">
          <div className="tile">
            <span className="lbl">Tamamladığım Task</span>
            <span className="val">{g.tamamlanan}</span>
            <span className="note">Toplam {g.toplam} Task</span>
          </div>
          <div className="tile">
            <span className="lbl">Ort. çözüm süresi</span>
            <span className="val">{saatSure(g.ortCozumSaat)}</span>
            <span className="note">Oluşturma → Tamamlandı</span>
          </div>
          <div className="tile wait">
            <span className="lbl">Açık</span>
            <span className="val">{g.acik}</span>
            <span className="note">Blok: {blok.adet ? `${saatSure(blok.ortSaat)} ort.` : 'yok'}</span>
          </div>
          <div className="tile late">
            <span className="lbl">Geciken</span>
            <span className="val">{g.geciken}</span>
            <span className="note">Bitiş tarihi geçmiş açık Task</span>
          </div>
        </section>
        <section className="panel">
          <h2>Açık işlerim</h2>
          <div className="rows">
            {acikIslerim.map((t) => (
              <TaskSatiri key={t.id} t={t} />
            ))}
            {!acikIslerim.length && <Bos>Üzerinizde açık Task yok.</Bos>}
          </div>
        </section>
        <p className="lock">{Ikon.lock} Çalışan karşılaştırması ve Ekip raporları yöneticilere açıktır.</p>
      </>
    );
  }

  const ekipler = r.ekipler ?? [];
  const maxToplam = Math.max(1, ...ekipler.map((e) => e.toplam));
  const bekleme = ekipler.map((e) => {
    const x = ekipRaporlari[ekipYolu(e.ekipId, tarihQ)];
    return { e, kabul: x?.kabulBekleme?.ortSaat ?? 0, blok: x?.blokSuresi.ortSaat ?? 0, yuklendi: !!x };
  });
  const maxBekleme = Math.max(1, ...bekleme.map((b) => b.kabul + b.blok));

  const ret = r.retRaporu;
  const retNedenleri = new Map<string, number>();
  for (const x of ret?.gerekceler ?? []) {
    const n = gerekceAyir(x.gerekce).neden ?? 'Diğer';
    retNedenleri.set(n, (retNedenleri.get(n) ?? 0) + x.adet);
  }
  const retToplam = [...retNedenleri.values()].reduce((a, b) => a + b, 0);
  const kapsamMetni = r.kapsam === 'TUMU' ? (u.org?.direktorluk.ad ?? 'Tüm Direktörlük') : `Yönettiğiniz Ekipler: ${[...u.yonetilenEkipIds].map(u.ekipKodu).join(', ')}`;

  return (
    <>
      <div className="head-row">
        <p className="sub">{kapsamMetni} · Task'ın Ekibi atama anındaki yapıya göre sayılır; taşınan Çalışanın geçmiş işleri eski Ekibinde kalır.</p>
      </div>
      {filtreler}
      <section className="tiles simple">
        <div className="tile">
          <span className="lbl">Açık / kapalı</span>
          <span className="val">
            {g.acik} / {g.kapali}
          </span>
          <span className="note">Kapanma oranı %{yuzde(g.kapali, g.toplam)}</span>
        </div>
        <div className="tile">
          <span className="lbl">Ort. çözüm süresi</span>
          <span className="val">{saatSure(g.ortCozumSaat)}</span>
          <span className="note">Oluşturma → Tamamlandı ({g.tamamlanan} Task)</span>
        </div>
        <div className="tile wait">
          <span className="lbl">Ort. kabul bekleme</span>
          <span className="val">{kabul?.adet ? saatSure(kabul.ortSaat) : '—'}</span>
          <span className="note">Blok ort. {blok.adet ? `${saatSure(blok.ortSaat)} (${blok.adet} Task)` : 'yok'}</span>
        </div>
        <div className="tile late">
          <span className="lbl">Geciken</span>
          <span className="val">{g.geciken}</span>
          <span className="note">Ret oranı {ret ? `%${Math.round(ret.retOrani * 100)}` : '—'}</span>
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="panel-head">
            <h2>Ekip bazlı çözüm performansı</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--low)' }} />Toplam</span>
              <span><i style={{ background: 'var(--accent)' }} />Kapalı</span>
            </div>
          </div>
          <div className="bars">
            {ekipler.map((e) => (
              <div key={e.ekipId} className="bar-row">
                <span className="mono" style={{ fontSize: 12 }}>
                  {e.kod.replace('TEAM-', '')}
                </span>
                <div className="bar-track">
                  <div className="bar b2" style={{ width: `${(e.toplam / maxToplam) * 100}%` }} />
                  <div className="bar" style={{ width: `${(e.kapali / maxToplam) * 100}%` }} />
                </div>
                <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
                  {e.toplam} / {e.kapali} · %{yuzde(e.kapali, e.toplam)}
                </span>
              </div>
            ))}
            {!ekipler.length && <Bos>Bu kapsamda Ekip yok.</Bos>}
          </div>
          <p className="hint">Sağdaki yüzde: kapanma oranı. Geciken: {ekipler.map((e) => `${e.kod.replace('TEAM-', '')} ${e.geciken}`).join(' · ') || '—'}</p>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Bekleme süreleri (ortalama)</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--wait)' }} />Kabul bekleme</span>
              <span><i style={{ background: 'var(--orange)' }} />Blok</span>
            </div>
          </div>
          <div className="bars">
            {bekleme.map((b) => (
              <div key={b.e.ekipId} className="bar-row">
                <span className="mono" style={{ fontSize: 12 }}>
                  {b.e.kod.replace('TEAM-', '')}
                </span>
                {b.kabul + b.blok > 0 ? (
                  <div className="stacked" style={{ width: `${((b.kabul + b.blok) / maxBekleme) * 100}%` }}>
                    <i style={{ flex: b.kabul, background: 'var(--wait)' }} />
                    <i style={{ flex: b.blok, background: 'var(--orange)' }} />
                  </div>
                ) : (
                  <span className="hint">{b.yuklendi ? 'kayıt yok' : '…'}</span>
                )}
                <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
                  {saatSure(b.kabul)} + {saatSure(b.blok)}
                </span>
              </div>
            ))}
            {!bekleme.length && <Bos>Bu kapsamda Ekip yok.</Bos>}
          </div>
          <p className="hint">Kabul bekleme: karar verilen her onay adımı için adımın başlangıcından karara kadar. Blok: Bloklu kalınan toplam süre.</p>
        </section>
      </div>

      <div className="grid2 esit">
        <section className="panel">
          <div className="panel-head">
            <h2>Reddedilen Task'lar</h2>
            {ret && <span className="hint">Ret oranı %{Math.round(ret.retOrani * 100)} (en az bir ret alan / onay zinciri olan Task)</span>}
          </div>
          {!ret || !retToplam ? (
            <Bos>Bu kapsamda ret kaydı yok.</Bos>
          ) : (
            <>
              <div className="bars">
                {[...retNedenleri].sort((a, b) => b[1] - a[1]).map(([n, adet]) => (
                  <div key={n} className="bar-row">
                    <span style={{ fontSize: 12.5 }}>{n}</span>
                    <div className="bar b3" style={{ width: `${(adet / retToplam) * 100}%` }} />
                    <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
                      {adet} · %{yuzde(adet, retToplam)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Requester Ekibi</th>
                      <th>Reddeden Ekip</th>
                      <th className="num">Adet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ret.akis.map((a, i) => (
                      <tr key={i}>
                        <td>{a.kaynakEkipId ? <span className="tag team">{u.ekipKodu(a.kaynakEkipId)}</span> : <span className="hint">Ekipsiz</span>}</td>
                        <td>{a.hedefEkipId ? <span className="tag team">{u.ekipKodu(a.hedefEkipId)}</span> : <span className="hint">Ekipsiz</span>}</td>
                        <td className="num">{a.adet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Çalışan karşılaştırması</h2>
            <span className="lock">{Ikon.lock} Yalnızca yöneticiler görür</span>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Çalışan</th>
                  <th className="num">Tamamlanan</th>
                  <th className="num">Açık</th>
                  <th className="num">Ort. çözüm</th>
                  <th className="num">Geciken</th>
                </tr>
              </thead>
              <tbody>
                {(r.calisanlar ?? []).map((c) => (
                  <tr key={c.kullaniciId}>
                    <td>
                      <span className="who-inline">
                        <Avatar ad={c.ad} />
                        {c.ad}
                      </span>
                    </td>
                    <td className="num">{c.tamamlanan}</td>
                    <td className="num">{c.acik}</td>
                    <td className="num">{saatSure(c.ortCozumSaat)}</td>
                    <td className="num" style={c.geciken ? { color: '#F87171', fontWeight: 700 } : undefined}>
                      {c.geciken}
                    </td>
                  </tr>
                ))}
                {!r.calisanlar?.length && (
                  <tr>
                    <td colSpan={5} className="hint">
                      Bu kapsamda Çalışan yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="hint">Sıralama: tamamlanan (çoktan aza), sonra ortalama çözüm süresi, sonra geciken.</p>
        </section>
      </div>
    </>
  );
}
