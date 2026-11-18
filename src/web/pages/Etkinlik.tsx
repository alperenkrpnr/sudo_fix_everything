// Etkinlik & yetkinlik: iç etkinlik davetleri ve yanıtları, Duyurular, Yetkinlik kayıtları.
import { useState, type FormEvent } from 'react';
import { api, hataMesaji } from '../api';
import { ayAdi, gunFarki, saatGoster, tarihGoster } from '../format';
import { useUygulama, useVeri } from '../uygulama';
import { Bos, HataKutusu, Modal, Yukleniyor } from '../ui';
import type { DuyuruGorunumu, EtkinlikGorunumu, YetkinlikGorunumu } from '../types';

const TIP: Record<string, [string, string]> = { IC: ['int', 'İç etkinlik'], DIS_KATILIM: ['ext', 'Dış katılım'], DIS_KONUSMACI: ['spk', 'Dış konuşmacı'] };
const HEDEF: Record<string, string> = { EKIP: 'Ekip', UNIT: 'Unit', DIREKTORLUK: 'Direktörlük' };

export function EtkinlikSatiri({ e }: { e: EtkinlikGorunumu }) {
  const u = useUygulama();
  const d = new Date(e.baslangic);
  const gecmis = d.getTime() < Date.now();
  const davetim = e.davetler.find((x) => x.kullaniciId === u.ben.id);
  const [tipSinif, tipAd] = TIP[e.tip] ?? ['int', e.tip];
  const katilan = e.davetler.filter((x) => x.yanit === 'KATILIYORUM').length;

  const yanitla = async (yanit: 'KATILIYORUM' | 'KATILMIYORUM') => {
    try {
      await api(`/etkinlik/${e.id}/yanit`, { body: { yanit } });
      u.bildir(yanit === 'KATILIYORUM' ? 'Katılımınız kaydedildi' : 'Yanıtınız kaydedildi');
    } catch (err) {
      u.hata(err);
    }
    u.yenile();
  };

  return (
    <div className={`ev${gecmis ? ' past' : ''}`}>
      <div className="cal" aria-hidden="true">
        <small>{ayAdi(d)}</small>
        <b>{d.getDate()}</b>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className={`ev-type ${tipSinif}`}>{tipAd}</div>
        <b style={{ fontWeight: 500 }}>{e.baslik}</b>
        <div className="hint">
          {tarihGoster(e.baslangic, false)} {saatGoster(e.baslangic)}
          {e.yer && ` · ${e.yer}`} · Düzenleyen: {e.olusturanAd}
          {e.davetler.length > 0 && ` · ${katilan}/${e.davetler.length} katılıyor`}
        </div>
      </div>
      <div>
        {davetim &&
          (davetim.yanit === 'BEKLIYOR' && !gecmis ? (
            <span className="appr-actions">
              <button className="btn good sm" onClick={() => yanitla('KATILIYORUM')}>
                Katılıyorum
              </button>
              <button className="btn sm" onClick={() => yanitla('KATILMIYORUM')}>
                Katılmıyorum
              </button>
            </span>
          ) : davetim.yanit === 'KATILIYORUM' ? (
            <span className="st done">Katılıyorsunuz</span>
          ) : davetim.yanit === 'KATILMIYORUM' ? (
            <span className="st">Katılmıyorsunuz</span>
          ) : (
            <span className="st">Yanıt verilmedi</span>
          ))}
      </div>
    </div>
  );
}

export function YetkinlikSatiri({ y }: { y: YetkinlikGorunumu }) {
  const u = useUygulama();
  const fark = y.bitisTarihi ? gunFarki(y.bitisTarihi) : null;
  const sinif = fark === null ? '' : fark < 0 ? 'late' : fark <= 30 ? 'soon' : '';
  const metin = fark === null ? 'Süresiz' : fark < 0 ? `${-fark} gün önce doldu` : fark === 0 ? 'Bugün doluyor' : `${fark} gün kaldı`;
  return (
    <div className="cert">
      <div>
        <b style={{ fontWeight: 500 }}>{y.ad}</b>
        <div className="hint">
          {y.kullaniciId === u.ben.id ? 'Siz' : y.kullaniciAd} · {y.kurum} · {tarihGoster(y.tarih, false)}
        </div>
      </div>
      <span className={`due ${sinif}`} title={y.bitisTarihi ? `Bitiş: ${tarihGoster(y.bitisTarihi, false)}` : undefined}>
        {metin}
      </span>
    </div>
  );
}

export function DuyuruSatiri({ d }: { d: DuyuruGorunumu }) {
  return (
    <div className="ann">
      <b>{d.baslik}</b>
      <span className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
        {d.metin}
      </span>
      <span className="hint">
        {d.yayinlayanAd} · {tarihGoster(d.yayinZamani)} · Hedef kitle:{' '}
        <span className="tag">
          {HEDEF[d.hedefTuru]}: {d.hedefAd}
        </span>
      </span>
    </div>
  );
}

export function EtkinlikSayfasi() {
  const u = useUygulama();
  const etkinlik = useVeri<EtkinlikGorunumu[]>('/etkinlik');
  const duyuru = useVeri<DuyuruGorunumu[]>('/duyuru');
  const yetkinlik = useVeri<YetkinlikGorunumu[]>('/yetkinlik');
  const [modal, setModal] = useState<'etkinlik' | 'duyuru' | 'yetkinlik' | null>(null);
  const [gecmisAcik, setGecmisAcik] = useState(false);

  const simdi = Date.now();
  const tum = etkinlik.veri ?? [];
  const yaklasan = tum.filter((e) => new Date(e.baslangic).getTime() >= simdi).sort((a, b) => a.baslangic.localeCompare(b.baslangic));
  const gecmis = tum.filter((e) => new Date(e.baslangic).getTime() < simdi).sort((a, b) => b.baslangic.localeCompare(a.baslangic));
  const yetkinlikler = [...(yetkinlik.veri ?? [])].sort((a, b) => (a.bitisTarihi ?? '9999').localeCompare(b.bitisTarihi ?? '9999'));
  const duyuruHedefleri = duyuruSecenekleri(u);

  return (
    <>
      <div className="head-row">
        <p className="sub">İç etkinliklerde katılım yanıtı verilir. Yetkinlik kayıtlarının bitişinden 30 gün önce sahibine bildirim gider.</p>
        {u.yonetici && (
          <div className="appr-actions">
            {u.yonetilenEkipIds.size > 0 && (
              <button className="btn" onClick={() => setModal('etkinlik')}>
                İç etkinlik oluştur
              </button>
            )}
            {duyuruHedefleri.length > 0 && (
              <button className="btn" onClick={() => setModal('duyuru')}>
                Duyuru yayınla
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid2">
        <section className="panel">
          <div className="panel-head">
            <h2>Etkinlikler</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--accent)' }} />İç etkinlik</span>
            </div>
          </div>
          {etkinlik.hata && <HataKutusu mesaj={etkinlik.hata} />}
          {!etkinlik.veri && !etkinlik.hata && <Yukleniyor />}
          <div>
            {yaklasan.map((e) => (
              <EtkinlikSatiri key={e.id} e={e} />
            ))}
            {etkinlik.veri && !yaklasan.length && <Bos>Yaklaşan etkinlik yok.</Bos>}
          </div>
          {gecmis.length > 0 && (
            <>
              <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setGecmisAcik(!gecmisAcik)} aria-expanded={gecmisAcik}>
                {gecmisAcik ? 'Geçmiş etkinlikleri gizle' : `Geçmiş etkinlikler (${gecmis.length})`}
              </button>
              {gecmisAcik && (
                <div>
                  {gecmis.map((e) => (
                    <EtkinlikSatiri key={e.id} e={e} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>{u.yonetici ? 'Yetkinlikler' : 'Yetkinliklerim'}</h2>
              <button className="link" onClick={() => setModal('yetkinlik')}>
                + Ekle
              </button>
            </div>
            {yetkinlik.hata && <HataKutusu mesaj={yetkinlik.hata} />}
            <div>
              {yetkinlikler.map((y) => (
                <YetkinlikSatiri key={y.id} y={y} />
              ))}
              {yetkinlik.veri && !yetkinlikler.length && (
                <Bos eylem={<button className="btn sm" onClick={() => setModal('yetkinlik')}>Yetkinlik ekle</button>}>Kayıtlı Yetkinlik yok.</Bos>
              )}
            </div>
            <p className="hint">{u.yonetici ? 'Kendi kayıtlarınız ve yönettiğiniz Ekiplerin üyelerininkiler.' : 'Sertifika ve eğitim kayıtlarınız.'}</p>
          </section>
          <section className="panel">
            <h2>Duyurular</h2>
            {duyuru.hata && <HataKutusu mesaj={duyuru.hata} />}
            <div>
              {(duyuru.veri ?? []).map((d) => (
                <DuyuruSatiri key={d.id} d={d} />
              ))}
              {duyuru.veri && !duyuru.veri.length && <Bos>Size yönelik Duyuru yok.</Bos>}
            </div>
          </section>
        </div>
      </div>
      {modal === 'etkinlik' && <IcEtkinlikModal onKapat={() => setModal(null)} />}
      {modal === 'duyuru' && <DuyuruModal secenekler={duyuruHedefleri} onKapat={() => setModal(null)} />}
      {modal === 'yetkinlik' && <YetkinlikModal onKapat={() => setModal(null)} />}
    </>
  );
}

function duyuruSecenekleri(u: ReturnType<typeof useUygulama>): Array<[string, string]> {
  const org = u.org;
  const s: Array<[string, string]> = [];
  if (!org) return s;
  if (u.direktor) s.push([`DIREKTORLUK:${org.direktorluk.id}`, `Direktörlük: ${org.direktorluk.ad}`]);
  for (const unit of org.unitler) {
    if (unit.yonetebilir && (u.direktor || unit.unitHead.some((k) => k.id === u.ben.id))) s.push([`UNIT:${unit.id}`, `Unit: ${unit.ad}`]);
    for (const e of unit.ekipler) if (e.yonetebilir) s.push([`EKIP:${e.id}`, `Ekip: ${e.kod}`]);
  }
  return s;
}

/** Ortak form gönderimi: hata modal içinde gösterilir. */
function useGonder(onBasari: () => void, basariMesaji: string) {
  const u = useUygulama();
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const gonder = async (fn: () => Promise<unknown>) => {
    setMesgul(true);
    setHata(null);
    try {
      await fn();
      u.bildir(basariMesaji);
      u.yenile();
      onBasari();
    } catch (e) {
      setHata(hataMesaji(e));
      setMesgul(false);
    }
  };
  return { hata, mesgul, gonder };
}

function Butonlar({ onKapat, mesgul, eylem, devre }: { onKapat: () => void; mesgul: boolean; eylem: string; devre?: boolean }) {
  return (
    <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
      <button type="button" className="btn" onClick={onKapat}>
        Vazgeç
      </button>
      <button className="btn primary" type="submit" disabled={mesgul || devre}>
        {eylem}
      </button>
    </div>
  );
}

function IcEtkinlikModal({ onKapat }: { onKapat: () => void }) {
  const u = useUygulama();
  const [f, setF] = useState({ baslik: '', aciklama: '', yer: '', baslangic: '', ekipIds: [] as string[] });
  const g = useGonder(onKapat, 'İç etkinlik oluşturuldu, davetler gönderildi');
  const ekipler = u.org?.unitler.flatMap((x) => x.ekipler).filter((e) => e.yonetebilir) ?? [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    g.gonder(() =>
      api('/etkinlik/ic', { body: { baslik: f.baslik.trim(), aciklama: f.aciklama.trim() || undefined, yer: f.yer.trim() || undefined, baslangic: new Date(f.baslangic).toISOString(), ekipIds: f.ekipIds } }),
    );
  };
  return (
    <Modal baslik="İç etkinlik oluştur" alt="Seçtiğiniz Ekiplerin üyelerine davet ve bildirim gider" onKapat={onKapat}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="e-baslik">Başlık</label>
          <input id="e-baslik" required value={f.baslik} onChange={(e) => setF({ ...f, baslik: e.target.value })} placeholder="ör. Q4 iletişim toplantısı" />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="e-zaman">Başlangıç</label>
            <input id="e-zaman" type="datetime-local" required value={f.baslangic} onChange={(e) => setF({ ...f, baslangic: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="e-yer">Yer</label>
            <input id="e-yer" value={f.yer} onChange={(e) => setF({ ...f, yer: e.target.value })} placeholder="ör. Konferans salonu + Teams" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="e-aciklama">Açıklama</label>
          <textarea id="e-aciklama" value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lab" style={{ marginBottom: 6 }}>Davet edilecek Ekipler</legend>
          <div className="checklist">
            {ekipler.map((e) => (
              <label key={e.id}>
                <input
                  type="checkbox"
                  checked={f.ekipIds.includes(e.id)}
                  onChange={(ev) => setF({ ...f, ekipIds: ev.target.checked ? [...f.ekipIds, e.id] : f.ekipIds.filter((x) => x !== e.id) })}
                />
                {e.kod}
              </label>
            ))}
          </div>
          {!f.ekipIds.length && <p className="hint">En az bir Ekip seçin.</p>}
        </fieldset>
        {g.hata && <HataKutusu mesaj={g.hata} />}
        <Butonlar onKapat={onKapat} mesgul={g.mesgul} eylem="Oluştur ve davet et" devre={!f.ekipIds.length} />
      </form>
    </Modal>
  );
}

function DuyuruModal({ secenekler, onKapat }: { secenekler: Array<[string, string]>; onKapat: () => void }) {
  const [f, setF] = useState({ hedef: secenekler[0]?.[0] ?? '', baslik: '', metin: '' });
  const g = useGonder(onKapat, 'Duyuru yayınlandı');
  return (
    <Modal baslik="Duyuru yayınla" alt="Hedef kitledeki herkese bildirim gider" onKapat={onKapat}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const [hedefTuru, hedefId] = f.hedef.split(':');
          g.gonder(() => api('/duyuru', { body: { baslik: f.baslik.trim(), metin: f.metin.trim(), hedefTuru, hedefId } }));
        }}
      >
        <div className="field">
          <label htmlFor="d-hedef">Hedef kitle</label>
          <select id="d-hedef" value={f.hedef} onChange={(e) => setF({ ...f, hedef: e.target.value })}>
            {secenekler.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="d-baslik">Başlık</label>
          <input id="d-baslik" required value={f.baslik} onChange={(e) => setF({ ...f, baslik: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="d-metin">Metin</label>
          <textarea id="d-metin" required value={f.metin} onChange={(e) => setF({ ...f, metin: e.target.value })} />
        </div>
        {g.hata && <HataKutusu mesaj={g.hata} />}
        <Butonlar onKapat={onKapat} mesgul={g.mesgul} eylem="Yayınla" devre={!f.baslik.trim() || !f.metin.trim()} />
      </form>
    </Modal>
  );
}

function YetkinlikModal({ onKapat }: { onKapat: () => void }) {
  const [f, setF] = useState({ ad: '', kurum: '', tarih: '', bitisTarihi: '' });
  const g = useGonder(onKapat, 'Yetkinlik eklendi');
  return (
    <Modal baslik="Yetkinlik ekle" alt="Sertifika veya eğitim kaydınız" onKapat={onKapat}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          g.gonder(() => api('/yetkinlik', { body: { ad: f.ad.trim(), kurum: f.kurum.trim(), tarih: f.tarih, bitisTarihi: f.bitisTarihi || null } }));
        }}
      >
        <div className="row2">
          <div className="field">
            <label htmlFor="y-ad">Ad</label>
            <input id="y-ad" required value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} placeholder="ör. OSCP" />
          </div>
          <div className="field">
            <label htmlFor="y-kurum">Kurum</label>
            <input id="y-kurum" required value={f.kurum} onChange={(e) => setF({ ...f, kurum: e.target.value })} placeholder="ör. OffSec" />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="y-tarih">Alınma tarihi</label>
            <input id="y-tarih" type="date" required value={f.tarih} onChange={(e) => setF({ ...f, tarih: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="y-bitis">Bitiş tarihi (isteğe bağlı)</label>
            <input id="y-bitis" type="date" value={f.bitisTarihi} onChange={(e) => setF({ ...f, bitisTarihi: e.target.value })} />
          </div>
        </div>
        {g.hata && <HataKutusu mesaj={g.hata} />}
        <Butonlar onKapat={onKapat} mesgul={g.mesgul} eylem="Ekle" />
      </form>
    </Modal>
  );
}
