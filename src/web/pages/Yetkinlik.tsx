import { useEffect, useState } from 'react';
import { api } from '../api';
import type { YetkinlikGorunumu } from '../../server/modules/yetkinlik';
import type { Profil } from '../types';

const tarih = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '—');

export function YetkinlikSayfasi({ ben }: { ben: Profil }) {
  const [liste, setListe] = useState<YetkinlikGorunumu[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState({ ad: '', kurum: '', tarih: '', bitisTarihi: '' });

  const yukle = () => api<YetkinlikGorunumu[]>('/yetkinlik').then(setListe).catch((e) => setHata(e.message));
  useEffect(() => {
    yukle();
  }, []);

  const ekle = () =>
    api('/yetkinlik', { body: { ...form, bitisTarihi: form.bitisTarihi || null } })
      .then(() => {
        setForm({ ad: '', kurum: '', tarih: '', bitisTarihi: '' });
        setHata(null);
        yukle();
      })
      .catch((e) => setHata(e.message));

  return (
    <>
      <h2>Yetkinlikler</h2>
      {hata && <p className="hata">{hata}</p>}
      <section className="kart">
        <h3>Yetkinlik ekle</h3>
        <input placeholder="Ad (ör. OSCP)" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} />{' '}
        <input placeholder="Kurum" value={form.kurum} onChange={(e) => setForm({ ...form, kurum: e.target.value })} />{' '}
        <label className="soluk">
          Tarih <input type="date" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
        </label>{' '}
        <label className="soluk">
          Bitiş (isteğe bağlı){' '}
          <input type="date" value={form.bitisTarihi} onChange={(e) => setForm({ ...form, bitisTarihi: e.target.value })} />
        </label>{' '}
        <button onClick={ekle}>Ekle</button>
      </section>
      <table className="kart" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th align="left">Kişi</th>
            <th align="left">Ad</th>
            <th align="left">Kurum</th>
            <th align="left">Tarih</th>
            <th align="left">Bitiş</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((y) => (
            <tr key={y.id}>
              <td>{y.kullaniciId === ben.id ? 'Ben' : y.kullaniciAd}</td>
              <td>{y.ad}</td>
              <td>{y.kurum}</td>
              <td>{tarih(y.tarih)}</td>
              <td>{tarih(y.bitisTarihi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
