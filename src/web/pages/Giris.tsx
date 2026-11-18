import { useEffect, useState } from 'react';
import { api, hataMesaji } from '../api';
import { anaRol, rolAdi } from '../format';
import { Avatar, HataKutusu, Yukleniyor } from '../ui';
import logo from '../assets/logo.png';
import type { MockKullanici } from '../types';

const SIRA = ['DIREKTOR', 'UNIT_HEAD', 'TEAM_HEAD', 'CALISAN'];

/** Demo mock girişi: kullanıcı seçilir (mimari SSO'ya hazır; token çözümü sunucuda). */
export function GirisSayfasi({ onGiris }: { onGiris: (kullaniciId: string) => Promise<unknown> }) {
  const [liste, setListe] = useState<MockKullanici[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);

  useEffect(() => {
    api<MockKullanici[]>('/oturum/mock-kullanicilar')
      .then(setListe)
      .catch((e) => setHata(hataMesaji(e)));
  }, []);

  const giris = async (id: string) => {
    setMesgul(id);
    try {
      await onGiris(id);
    } catch (e) {
      setHata(hataMesaji(e));
      setMesgul(null);
    }
  };

  const gruplar = SIRA.map((r) => [r, (liste ?? []).filter((k) => anaRol(k.roller) === r)] as const).filter(([, ks]) => ks.length);

  return (
    <div className="login">
      <div className="login-box">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <div>
            <b>
              SecOps<span className="grid">Grid</span>
            </b>
            <small>Security Operations, Connected.</small>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 28 }}>Demo girişi</h1>
          <p className="sub">Bir mock kullanıcı seçin. Her ekran, seçtiğiniz kişinin yetkileriyle açılır.</p>
        </div>
        {hata && <HataKutusu mesaj={hata} />}
        {!liste && !hata && <Yukleniyor />}
        {gruplar.map(([rol, ks]) => (
          <section key={rol} className="group">
            <div className="group-head">
              <h2>{rolAdi(rol)}</h2>
              <span className="badge">{ks.length}</span>
            </div>
            <div className="people">
              {ks.map((k) => (
                <button key={k.id} className="person" disabled={!!mesgul} onClick={() => giris(k.id)}>
                  <Avatar ad={k.ad} sinif={rol === 'CALISAN' ? '' : 'gold'} />
                  <span className="grow">
                    <b>{k.ad}</b>
                    <span className="hint">{k.unvan}</span>
                    <span className="role-chip">{k.roller.map(rolAdi).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
