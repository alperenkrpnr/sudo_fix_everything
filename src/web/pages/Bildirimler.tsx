import { useEffect, useState } from 'react';
import { api } from '../api';
import type { BildirimGorunumu } from '../../server/modules/bildirim';
import type { Profil } from '../types';

export function BildirimSayfasi(_: { ben: Profil }) {
  const [liste, setListe] = useState<BildirimGorunumu[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const yukle = () => api<BildirimGorunumu[]>('/bildirim').then(setListe).catch((e) => setHata(e.message));
  useEffect(() => {
    yukle();
  }, []);
  const okundu = (id: string) => api(`/bildirim/${id}/okundu`, { method: 'POST' }).then(yukle).catch((e) => setHata(e.message));
  const okunmamis = liste.filter((b) => !b.okundu).length;

  return (
    <>
      <h2>Bildirimler ({okunmamis} okunmamış)</h2>
      {hata && <p className="hata">{hata}</p>}
      {!liste.length && <p className="soluk">Bildirim yok.</p>}
      {liste.map((b) => (
        <div key={b.id} className="kart" style={{ opacity: b.okundu ? 0.6 : 1 }}>
          {!b.okundu && <span className="etiket">yeni</span>}
          {b.mesaj} <span className="soluk">{new Date(b.olusturma).toLocaleString('tr-TR')}</span>{' '}
          {!b.okundu && <button onClick={() => okundu(b.id)}>Okundu</button>}
        </div>
      ))}
    </>
  );
}
