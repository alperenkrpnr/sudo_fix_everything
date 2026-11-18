// Organizasyon (Yönetim Paneli): Direktörlük → Unit → Ekip → Çalışan. Yapı yönetimi (Direktör),
// Team Head atama (Unit Head), Ekip üyelikleri (Sorumlu/Üst yönetici) ve Direktör için denetim izi.
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { api, hataMesaji } from '../api';
import { tarihGoster } from '../format';
import { OnayModal } from '../gorev';
import { useUygulama, useVeri } from '../uygulama';
import { Avatar, Bos, HataKutusu, Modal, Yukleniyor } from '../ui';
import type { DenetimKaydi, Kisi, OrgYapisi } from '../types';

type Ekip = OrgYapisi['unitler'][number]['ekipler'][number];
const adlar = (ks: Kisi[]) => (ks.length ? ks.map((k) => k.ad).join(', ') : '—');

export function OrganizasyonSayfasi() {
  const u = useUygulama();
  const yapi = useVeri<OrgYapisi>('/organizasyon');
  const [modal, setModal] = useState<ReactNode>(null);
  const kapat = () => setModal(null);

  /** Yazma işlemi: başarıda toast + yenile. */
  const islem = async (yol: string, body: unknown, basari: string, method = 'POST') => {
    try {
      await api(`/organizasyon/${yol}`, { method, body });
      u.bildir(basari);
      kapat();
    } catch (e) {
      u.hata(e);
    }
    u.yenile();
  };

  if (yapi.hata) return <HataKutusu mesaj={yapi.hata} />;
  if (!yapi.veri) return <Yukleniyor />;
  const org = yapi.veri;
  const kisiler = u.rehber?.kullanicilar ?? [];
  const tumEkipler = org.unitler.flatMap((x) => x.ekipler);
  const unitler = [...org.unitler].sort((a, b) => Number(b.yonetebilir) - Number(a.yonetebilir));

  const kisiSec = (baslik: string, alt: string, liste: Kisi[], eylem: string, onSec: (id: string) => void) =>
    setModal(<KisiSecModal baslik={baslik} alt={alt} kisiler={liste} eylem={eylem} onKapat={kapat} onSec={onSec} />);
  const onayla = (baslik: string, metin: string, eylem: string, fn: () => Promise<void>) =>
    setModal(<OnayModal baslik={baslik} metin={metin} eylem={eylem} onKapat={kapat} onOnay={fn} />);

  return (
    <>
      <div className="head-row">
        <p className="sub">
          {org.direktorluk.ad} · Direktör: {adlar(org.direktorluk.direktor)}.{' '}
          {u.direktor
            ? 'Unit, Ekip, kullanıcı ve Unit Head atamalarını yönetirsiniz.'
            : 'Yönettiğiniz Ekiplerin üyeliklerini' + (org.unitler.some((x) => x.yonetebilir) ? ' ve Unit\'inizdeki Team Head atamalarını' : '') + ' yönetirsiniz.'}{' '}
          Değişiklikler tarihli tutulur ve denetim izine yazılır.
        </p>
        {u.direktor && (
          <div className="appr-actions">
            <button className="btn" onClick={() => setModal(<UnitModal onKapat={kapat} />)}>
              Unit ekle
            </button>
            <button className="btn" onClick={() => setModal(<EkipModal org={org} onKapat={kapat} />)}>
              Ekip ekle
            </button>
            <button className="btn" onClick={() => setModal(<KullaniciModal onKapat={kapat} />)}>
              Kullanıcı ekle
            </button>
            <button className="btn primary" onClick={() => setModal(<UnitHeadModal org={org} kisiler={kisiler} onKapat={kapat} />)}>
              Unit Head ata
            </button>
          </div>
        )}
      </div>

      {unitler.map((unit) => (
        <section key={unit.id} className="panel unit">
          <div className="panel-head">
            <div>
              <h2>
                {unit.ad} <span className="tag">{unit.kod}</span>
              </h2>
              <span className="hint">Unit Head: {adlar(unit.unitHead)}</span>
            </div>
            {unit.yonetebilir && <span className="warn-chip">Yönetiyorsunuz</span>}
          </div>
          {unit.ekipler.map((e) => (
            <EkipSatiri
              key={e.id}
              e={e}
              unitYonetebilir={unit.yonetebilir}
              onTeamHeadKaldir={(k) =>
                onayla('Team Head atamasını kaldır', `${k.ad}, ${e.kod} Team Head'liğinden çıkarılacak. Ekip, Team Head atanana kadar Unit Head'e bağlanır.`, 'Kaldır', () =>
                  islem('team-head-kaldir', { ekipId: e.id, kullaniciId: k.id }, `${k.ad} artık ${e.kod} Team Head'i değil`),
                )
              }
              onTeamHeadAta={() =>
                kisiSec(`${e.kod} için Team Head ata`, 'Bir kişi birden fazla Ekibin Team Head\'i olabilir', kisiler, 'Team Head ata', (id) =>
                  islem('team-head-ata', { ekipId: e.id, kullaniciId: id }, `${u.kisiAdi(id)}, ${e.kod} Team Head'i oldu`),
                )
              }
              onUyeEkle={() =>
                kisiSec(`${e.kod} Ekibine üye ekle`, e.ad, kisiler.filter((k) => !e.uyeler?.some((m) => m.id === k.id)), 'Üye ekle', (id) =>
                  islem('uye-ekle', { ekipId: e.id, kullaniciId: id }, `${u.kisiAdi(id)}, ${e.kod} Ekibine eklendi`),
                )
              }
              onUyeCikar={(k) =>
                onayla('Üyeyi Ekipten çıkar', `${k.ad}, ${e.kod} Ekibinden çıkarılacak. Üyelik geçmişi korunur.`, 'Çıkar', () =>
                  islem('uye-cikar', { ekipId: e.id, kullaniciId: k.id }, `${k.ad}, ${e.kod} Ekibinden çıkarıldı`),
                )
              }
              onTasi={(k) =>
                setModal(
                  <TasiModal
                    kisi={k}
                    eski={e}
                    ekipler={tumEkipler.filter((x) => x.yonetebilir && x.id !== e.id)}
                    onKapat={kapat}
                    onTasi={(yeniEkipId) =>
                      islem('calisan-tasi', { kullaniciId: k.id, eskiEkipId: e.id, yeniEkipId }, `${k.ad} → ${tumEkipler.find((x) => x.id === yeniEkipId)?.kod} taşındı`)
                    }
                  />,
                )
              }
            />
          ))}
          {!unit.ekipler.length && <Bos>Bu Unit'te Ekip yok.</Bos>}
        </section>
      ))}

      {u.direktor && <DenetimPaneli />}
      {modal}
    </>
  );
}

function EkipSatiri(p: {
  e: Ekip;
  unitYonetebilir: boolean;
  onTeamHeadKaldir: (k: Kisi) => void;
  onTeamHeadAta: () => void;
  onUyeEkle: () => void;
  onUyeCikar: (k: Kisi) => void;
  onTasi: (k: Kisi) => void;
}) {
  const { e } = p;
  return (
    <div className="team-row">
      <div>
        <span className="tag team">{e.kod}</span>
        <div className="hint" style={{ marginTop: 4 }}>
          {e.ad}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <div>
          {e.teamHead.length ? (
            <>
              <span className="hint">Team Head:</span>{' '}
              {e.teamHead.map((k) => (
                <span key={k.id} className="member" style={{ marginRight: 6 }}>
                  <Avatar ad={k.ad} />
                  {k.ad}
                  {p.unitYonetebilir && (
                    <button className="x" aria-label={`${k.ad} Team Head atamasını kaldır`} title="Team Head atamasını kaldır" onClick={() => p.onTeamHeadKaldir(k)}>
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </>
          ) : (
            <span className="warn-chip">Team Head yok · Sorumlu yönetici: {adlar(e.sorumluYonetici)}</span>
          )}
        </div>
        {e.uyeler ? (
          <div className="members">
            {e.uyeler.map((k) => (
              <span key={k.id} className="member" title={k.unvan ?? undefined}>
                <Avatar ad={k.ad} />
                {k.ad}
                {e.yonetebilir && (
                  <>
                    <button className="x" aria-label={`${k.ad} kişisini başka Ekibe taşı`} title="Başka Ekibe taşı" onClick={() => p.onTasi(k)}>
                      ⇄
                    </button>
                    <button className="x" aria-label={`${k.ad} kişisini Ekipten çıkar`} title="Ekipten çıkar" onClick={() => p.onUyeCikar(k)}>
                      ✕
                    </button>
                  </>
                )}
              </span>
            ))}
            {!e.uyeler.length && <span className="hint">Üye yok</span>}
          </div>
        ) : (
          <span className="lock">Üyeler yetkiniz dışında</span>
        )}
      </div>
      <div className="team-actions">
        {e.yonetebilir && (
          <button className="btn sm" onClick={p.onUyeEkle}>
            Üye ekle
          </button>
        )}
        {p.unitYonetebilir && (
          <button className="btn sm ghost" onClick={p.onTeamHeadAta}>
            Team Head ata
          </button>
        )}
      </div>
    </div>
  );
}

function KisiSecModal(p: { baslik: string; alt?: string; kisiler: Kisi[]; eylem: string; onKapat: () => void; onSec: (id: string) => Promise<void> | void }) {
  const [id, setId] = useState('');
  const [mesgul, setMesgul] = useState(false);
  return (
    <Modal baslik={p.baslik} alt={p.alt} onKapat={p.onKapat}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!id) return;
          setMesgul(true);
          await p.onSec(id);
          setMesgul(false);
        }}
      >
        <div className="field">
          <label htmlFor="k-sec">Kişi</label>
          <select id="k-sec" value={id} onChange={(e) => setId(e.target.value)} required>
            <option value="">— kişi seçin —</option>
            {[...p.kisiler]
              .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                  {k.unvan ? ` · ${k.unvan}` : ''}
                </option>
              ))}
          </select>
        </div>
        <Butonlar onKapat={p.onKapat} eylem={p.eylem} devre={!id || mesgul} />
      </form>
    </Modal>
  );
}

function TasiModal(p: { kisi: Kisi; eski: Ekip; ekipler: Ekip[]; onKapat: () => void; onTasi: (ekipId: string) => Promise<void> }) {
  const [hedef, setHedef] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const yeni = p.ekipler.find((e) => e.id === hedef);
  return (
    <Modal baslik="Çalışanı başka Ekibe taşı" alt={`${p.kisi.ad} · şu an ${p.eski.kod}`} onKapat={p.onKapat}>
      {!p.ekipler.length ? (
        <p className="hint">Taşıyabileceğiniz başka Ekip yok (her iki Ekibi de yönetmeniz gerekir).</p>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!hedef) return;
            setMesgul(true);
            await p.onTasi(hedef);
            setMesgul(false);
          }}
        >
          <div className="field">
            <label htmlFor="t-hedef">Yeni Ekip</label>
            <select id="t-hedef" value={hedef} onChange={(e) => setHedef(e.target.value)} required>
              <option value="">— Ekip seçin —</option>
              {p.ekipler.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.kod} · {e.ad}
                </option>
              ))}
            </select>
          </div>
          {yeni && (
            <div className="banner info">
              <div>
                {p.kisi.ad}, {p.eski.kod} Ekibinden çıkarılıp {yeni.kod} Ekibine eklenecek. Eski üyelik tarihli olarak kapanır; bekleyen onaylar yeni Sorumlu yöneticiye geçer.
              </div>
            </div>
          )}
          <Butonlar onKapat={p.onKapat} eylem="Taşı" devre={!hedef || mesgul} />
        </form>
      )}
    </Modal>
  );
}

function Butonlar({ onKapat, eylem, devre }: { onKapat: () => void; eylem: string; devre?: boolean }) {
  return (
    <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
      <button type="button" className="btn" onClick={onKapat}>
        Vazgeç
      </button>
      <button className="btn primary" type="submit" disabled={devre}>
        {eylem}
      </button>
    </div>
  );
}

/** Direktör yapı formları: hata modal içinde gösterilir. */
function YapiFormu(p: { baslik: string; eylem: string; onKapat: () => void; gonder: () => Promise<unknown>; basari: string; children: ReactNode; gecerli: boolean }) {
  const u = useUygulama();
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMesgul(true);
    setHata(null);
    try {
      await p.gonder();
      u.bildir(p.basari);
      u.yenile();
      p.onKapat();
    } catch (err) {
      setHata(hataMesaji(err));
      setMesgul(false);
    }
  };
  return (
    <Modal baslik={p.baslik} onKapat={p.onKapat}>
      <form className="form" onSubmit={submit}>
        {p.children}
        {hata && <HataKutusu mesaj={hata} />}
        <Butonlar onKapat={p.onKapat} eylem={p.eylem} devre={!p.gecerli || mesgul} />
      </form>
    </Modal>
  );
}

function Alan({ id, etiket, ...input }: { id: string; etiket: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiket}</label>
      <input id={id} {...input} />
    </div>
  );
}

function UnitModal({ onKapat }: { onKapat: () => void }) {
  const [f, setF] = useState({ kod: '', ad: '' });
  return (
    <YapiFormu baslik="Unit ekle" eylem="Oluştur" onKapat={onKapat} basari="Unit oluşturuldu" gecerli={!!f.kod.trim() && !!f.ad.trim()} gonder={() => api('/organizasyon/unit', { body: f })}>
      <div className="row2">
        <Alan id="u-kod" etiket="Kod" required value={f.kod} onChange={(e) => setF({ ...f, kod: e.target.value })} placeholder="ör. UNIT-MUHENDISLIK" />
        <Alan id="u-ad" etiket="Ad" required value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} />
      </div>
    </YapiFormu>
  );
}

function EkipModal({ org, onKapat }: { org: OrgYapisi; onKapat: () => void }) {
  const [f, setF] = useState({ unitId: '', kod: '', ad: '' });
  return (
    <YapiFormu baslik="Ekip ekle" eylem="Oluştur" onKapat={onKapat} basari="Ekip oluşturuldu" gecerli={!!f.unitId && !!f.kod.trim() && !!f.ad.trim()} gonder={() => api('/organizasyon/ekip', { body: f })}>
      <div className="field">
        <label htmlFor="ek-unit">Unit</label>
        <select id="ek-unit" required value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })}>
          <option value="">— Unit seçin —</option>
          {org.unitler.map((x) => (
            <option key={x.id} value={x.id}>
              {x.ad}
            </option>
          ))}
        </select>
      </div>
      <div className="row2">
        <Alan id="ek-kod" etiket="Kod" required value={f.kod} onChange={(e) => setF({ ...f, kod: e.target.value })} placeholder="ör. TEAM-IAM" />
        <Alan id="ek-ad" etiket="Ad" required value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} />
      </div>
    </YapiFormu>
  );
}

function KullaniciModal({ onKapat }: { onKapat: () => void }) {
  const [f, setF] = useState({ ad: '', eposta: '', unvan: '' });
  return (
    <YapiFormu baslik="Kullanıcı ekle" eylem="Oluştur" onKapat={onKapat} basari="Kullanıcı oluşturuldu" gecerli={!!f.ad.trim() && !!f.eposta.trim()} gonder={() => api('/organizasyon/kullanici', { body: f })}>
      <Alan id="ku-ad" etiket="Ad soyad" required value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} />
      <div className="row2">
        <Alan id="ku-eposta" etiket="E-posta" type="email" required value={f.eposta} onChange={(e) => setF({ ...f, eposta: e.target.value })} />
        <Alan id="ku-unvan" etiket="Unvan" value={f.unvan} onChange={(e) => setF({ ...f, unvan: e.target.value })} />
      </div>
      <p className="hint">Kişiyi bir Ekibe eklemek için Ekip satırındaki “Üye ekle”yi kullanın.</p>
    </YapiFormu>
  );
}

function UnitHeadModal({ org, kisiler, onKapat }: { org: OrgYapisi; kisiler: Kisi[]; onKapat: () => void }) {
  const [f, setF] = useState({ unitId: '', kullaniciId: '' });
  return (
    <YapiFormu
      baslik="Unit Head ata"
      eylem="Ata"
      onKapat={onKapat}
      basari="Unit Head atandı"
      gecerli={!!f.unitId && !!f.kullaniciId}
      gonder={() => api('/organizasyon/unit-head-ata', { body: f })}
    >
      <div className="field">
        <label htmlFor="uh-unit">Unit</label>
        <select id="uh-unit" required value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })}>
          <option value="">— Unit seçin —</option>
          {org.unitler.map((x) => (
            <option key={x.id} value={x.id}>
              {x.ad} · şu an: {adlar(x.unitHead)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="uh-kisi">Kişi</label>
        <select id="uh-kisi" required value={f.kullaniciId} onChange={(e) => setF({ ...f, kullaniciId: e.target.value })}>
          <option value="">— kişi seçin —</option>
          {[...kisiler]
            .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
            .map((k) => (
              <option key={k.id} value={k.id}>
                {k.ad}
                {k.unvan ? ` · ${k.unvan}` : ''}
              </option>
            ))}
        </select>
      </div>
    </YapiFormu>
  );
}

/** Denetim izi (yalnızca Direktör): son kayıtlar, işleme göre filtre, ajan işlemi işaretli. */
function DenetimPaneli() {
  const u = useUygulama();
  const [islem, setIslem] = useState('');
  const tum = useVeri<DenetimKaydi[]>('/denetim');
  const filtreli = useVeri<DenetimKaydi[]>(islem ? `/denetim?islem=${encodeURIComponent(islem)}` : null);
  const islemler = [...new Set((tum.veri ?? []).map((k) => k.islem))].sort();
  const liste = (islem ? filtreli.veri : tum.veri) ?? [];
  const hata = islem ? filtreli.hata : tum.hata;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Denetim izi</h2>
          <span className="hint">Kayıtlar yalnızca eklenir, silinmez. Son 200 kayıttan ilk 50'si.</span>
        </div>
        <select className="chip" aria-label="İşlem filtresi" value={islem} onChange={(e) => setIslem(e.target.value)}>
          <option value="">Tüm işlemler</option>
          {islemler.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      {hata && <HataKutusu mesaj={hata} />}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Kişi</th>
              <th>İşlem</th>
              <th>Varlık</th>
            </tr>
          </thead>
          <tbody>
            {liste.slice(0, 50).map((k) => (
              <tr key={k.id}>
                <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
                  {tarihGoster(k.zaman)}
                </td>
                <td>
                  {u.kisiAdi(k.kullaniciId)}
                  {k.adinaKullaniciId && <span className="hint"> ({u.kisiAdi(k.adinaKullaniciId)} adına)</span>}
                  {k.ajan && (
                    <span className="tag" style={{ marginLeft: 6, color: 'var(--cyan)' }}>
                      ajan işlemi
                    </span>
                  )}
                </td>
                <td className="mono" style={{ fontSize: 12.5 }}>
                  {k.islem}
                </td>
                <td className="hint">{k.varlikTuru ?? '—'}</td>
              </tr>
            ))}
            {!liste.length && !hata && (
              <tr>
                <td colSpan={4} className="hint">
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
