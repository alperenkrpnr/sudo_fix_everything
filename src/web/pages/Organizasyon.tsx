import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Kisi, OrgYapisi, Profil } from '../types';

const adlar = (ks: Kisi[]) => (ks.length ? ks.map((k) => k.ad).join(', ') : '—');

export function OrganizasyonSayfasi(_: { ben: Profil }) {
  const [yapi, setYapi] = useState<OrgYapisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    api<OrgYapisi>('/organizasyon').then(setYapi).catch((e) => setHata(e.message));
  }, []);

  if (hata) return <p className="hata">{hata}</p>;
  if (!yapi) return <p>Yükleniyor…</p>;
  return (
    <>
      <h2>{yapi.direktorluk.ad}</h2>
      <p className="soluk">Direktör: {adlar(yapi.direktorluk.direktor)}</p>
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
                  Team Head: {adlar(e.teamHead)}
                  {!e.teamHead.length && <> · Sorumlu yönetici: {adlar(e.sorumluYonetici)}</>}
                </div>
                {e.uyeler ? (
                  <ul>
                    {e.uyeler.map((k) => (
                      <li key={k.id}>
                        {k.ad} <span className="soluk">{k.unvan}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="soluk">Üyeler yetkiniz dışında</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
