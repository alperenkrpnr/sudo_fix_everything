import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Kisi, MockKullanici, OrgYapisi, Profil } from '../types';

const adlar = (ks: Kisi[]) => (ks.length ? ks.map((k) => k.ad).join(', ') : '—');

/** Kişi seçip bir işlemi tetikleyen küçük form. */
function KisiSec(p: { kisiler: Kisi[]; etiket: string; onSec: (id: string) => void }) {
  const [id, setId] = useState('');
  return (
    <span>
      <select value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">— kişi —</option>
        {p.kisiler.map((k) => (
          <option key={k.id} value={k.id}>
            {k.ad}
          </option>
        ))}
      </select>
      <button disabled={!id} onClick={() => { p.onSec(id); setId(''); }}>
        {p.etiket}
      </button>
    </span>
  );
}

export function OrganizasyonSayfasi({ ben }: { ben: Profil }) {
  const [yapi, setYapi] = useState<OrgYapisi | null>(null);
  const [kisiler, setKisiler] = useState<MockKullanici[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const direktor = ben.roller.includes('DIREKTOR');

  const yukle = () => {
    api<OrgYapisi>('/organizasyon').then(setYapi).catch((e) => setHata(e.message));
    api<MockKullanici[]>('/oturum/mock-kullanicilar').then(setKisiler).catch(() => {});
  };
  useEffect(yukle, []);

  /** Bir yazma işlemini çalıştırır, sonra yapıyı yeniler. */
  const islem = (yol: string, body: unknown, method = 'POST') => {
    setHata(null);
    api(`/organizasyon/${yol}`, { method, body }).then(yukle).catch((e) => setHata(e.message));
  };

  if (!yapi) return hata ? <p className="hata">{hata}</p> : <p>Yükleniyor…</p>;
  const tumEkipler = yapi.unitler.flatMap((u) => u.ekipler);
  return (
    <>
      {hata && <p className="hata">{hata}</p>}
      <h2>{yapi.direktorluk.ad}</h2>
      <p className="soluk">Direktör: {adlar(yapi.direktorluk.direktor)}</p>

      <ProfilFormu ben={ben} onKaydet={(g) => islem('profil', g, 'PATCH')} />
      {direktor && <DirektorPaneli yapi={yapi} kisiler={kisiler} islem={islem} />}

      {yapi.unitler.map((u) => (
        <section key={u.id} className="kart">
          <h3>
            {u.ad} <span className="etiket">{u.kod}</span>
            {u.yonetebilir && <span className="etiket">yönetiyorsunuz</span>}
          </h3>
          <p className="soluk">Unit Head: {adlar(u.unitHead)}</p>
          <div className="ekipler">
            {u.ekipler.map((e) => (
              <div key={e.id} className="kart">
                <strong>{e.kod}</strong> <span className="soluk">{e.ad}</span>
                {e.yonetebilir && <span className="etiket">yönetiyorsunuz</span>}
                <div className="soluk">
                  Team Head:{' '}
                  {e.teamHead.length
                    ? e.teamHead.map((k) => (
                        <span key={k.id}>
                          {k.ad}
                          {u.yonetebilir && (
                            <button onClick={() => islem('team-head-kaldir', { ekipId: e.id, kullaniciId: k.id })}>×</button>
                          )}{' '}
                        </span>
                      ))
                    : '—'}
                  {!e.teamHead.length && <> · Sorumlu yönetici: {adlar(e.sorumluYonetici)}</>}
                </div>
                {u.yonetebilir && (
                  <div>
                    <KisiSec kisiler={kisiler} etiket="Team Head ata" onSec={(id) => islem('team-head-ata', { ekipId: e.id, kullaniciId: id })} />
                  </div>
                )}
                {e.uyeler ? (
                  <ul>
                    {e.uyeler.map((k) => (
                      <li key={k.id}>
                        {k.ad} <span className="soluk">{k.unvan}</span>
                        {e.yonetebilir && (
                          <>
                            {' '}
                            <button onClick={() => islem('uye-cikar', { ekipId: e.id, kullaniciId: k.id })}>Çıkar</button>
                            <TasiSec
                              ekipler={tumEkipler.filter((x) => x.yonetebilir && x.id !== e.id)}
                              onSec={(yeniEkipId) => islem('calisan-tasi', { kullaniciId: k.id, eskiEkipId: e.id, yeniEkipId })}
                            />
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="soluk">Üyeler yetkiniz dışında</p>
                )}
                {e.yonetebilir && (
                  <KisiSec
                    kisiler={kisiler.filter((k) => !e.uyeler?.some((m) => m.id === k.id))}
                    etiket="Üye ekle"
                    onSec={(id) => islem('uye-ekle', { ekipId: e.id, kullaniciId: id })}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function TasiSec(p: { ekipler: Array<{ id: string; kod: string }>; onSec: (id: string) => void }) {
  if (!p.ekipler.length) return null;
  return (
    <select value="" onChange={(e) => e.target.value && p.onSec(e.target.value)}>
      <option value="">Taşı →</option>
      {p.ekipler.map((x) => (
        <option key={x.id} value={x.id}>
          {x.kod}
        </option>
      ))}
    </select>
  );
}

function ProfilFormu({ ben, onKaydet }: { ben: Profil; onKaydet: (g: { ad: string; unvan: string }) => void }) {
  const [ad, setAd] = useState(ben.ad);
  const [unvan, setUnvan] = useState(ben.unvan ?? '');
  return (
    <details className="kart">
      <summary>Profilim</summary>
      <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ad" />
      <input value={unvan} onChange={(e) => setUnvan(e.target.value)} placeholder="Unvan" />
      <button onClick={() => onKaydet({ ad, unvan })}>Kaydet</button>
    </details>
  );
}

function DirektorPaneli(p: { yapi: OrgYapisi; kisiler: Kisi[]; islem: (yol: string, body: unknown) => void }) {
  const [unit, setUnit] = useState({ kod: '', ad: '' });
  const [ekip, setEkip] = useState({ unitId: '', kod: '', ad: '' });
  const [kisi, setKisi] = useState({ ad: '', eposta: '', unvan: '' });
  const [uhUnit, setUhUnit] = useState('');
  const unitSec = (v: string, set: (v: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)}>
      <option value="">— Unit —</option>
      {p.yapi.unitler.map((u) => (
        <option key={u.id} value={u.id}>
          {u.ad}
        </option>
      ))}
    </select>
  );
  return (
    <details className="kart">
      <summary>Yapı yönetimi (Direktör)</summary>
      <div>
        Yeni Unit: <input placeholder="Kod" value={unit.kod} onChange={(e) => setUnit({ ...unit, kod: e.target.value })} />
        <input placeholder="Ad" value={unit.ad} onChange={(e) => setUnit({ ...unit, ad: e.target.value })} />
        <button onClick={() => p.islem('unit', unit)}>Oluştur</button>
      </div>
      <div>
        Yeni Ekip: {unitSec(ekip.unitId, (unitId) => setEkip({ ...ekip, unitId }))}
        <input placeholder="Kod" value={ekip.kod} onChange={(e) => setEkip({ ...ekip, kod: e.target.value })} />
        <input placeholder="Ad" value={ekip.ad} onChange={(e) => setEkip({ ...ekip, ad: e.target.value })} />
        <button onClick={() => p.islem('ekip', ekip)}>Oluştur</button>
      </div>
      <div>
        Yeni Çalışan: <input placeholder="Ad" value={kisi.ad} onChange={(e) => setKisi({ ...kisi, ad: e.target.value })} />
        <input placeholder="E-posta" value={kisi.eposta} onChange={(e) => setKisi({ ...kisi, eposta: e.target.value })} />
        <input placeholder="Unvan" value={kisi.unvan} onChange={(e) => setKisi({ ...kisi, unvan: e.target.value })} />
        <button onClick={() => p.islem('kullanici', kisi)}>Oluştur</button>
      </div>
      <div>
        Unit Head ata: {unitSec(uhUnit, setUhUnit)}
        <KisiSec kisiler={p.kisiler} etiket="Ata" onSec={(id) => uhUnit && p.islem('unit-head-ata', { unitId: uhUnit, kullaniciId: id })} />
      </div>
    </details>
  );
}
