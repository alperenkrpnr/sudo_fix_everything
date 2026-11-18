import { useEffect, useState } from 'react';
import { api } from '../api';
import { rolAdi } from '../format';
import type { MockKullanici } from '../types';

/** Demo mock girişi: kullanıcı seçilir (mimari SSO'ya hazır; token çözümü sunucuda). */
export function GirisSayfasi({ onGiris }: { onGiris: (token: string) => void }) {
  const [liste, setListe] = useState<MockKullanici[]>([]);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    api<MockKullanici[]>('/oturum/mock-kullanicilar').then(setListe).catch((e) => setHata(e.message));
  }, []);

  const giris = async (kullaniciId: string) => {
    try {
      const { token } = await api<{ token: string }>('/oturum/giris', { body: { kullaniciId } });
      onGiris(token);
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  return (
    <main>
      <h1>Siber Task · Demo girişi</h1>
      <p className="soluk">Bir mock kullanıcı seçin.</p>
      {hata && <p className="hata">{hata}</p>}
      <div className="ekipler">
        {liste.map((k) => (
          <button key={k.id} className="kart" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => giris(k.id)}>
            <strong>{k.ad}</strong>
            <div className="soluk">{k.unvan}</div>
            {k.roller.map((r) => (
              <span key={r} className="etiket">{rolAdi(r)}</span>
            ))}
          </button>
        ))}
      </div>
    </main>
  );
}
