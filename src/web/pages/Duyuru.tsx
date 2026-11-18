import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DuyuruGorunumu } from '../../server/modules/duyuru';
import type { OrgYapisi, Profil } from '../types';

const HEDEF: Record<string, string> = { EKIP: 'Ekip', UNIT: 'Unit', DIREKTORLUK: 'Direktörlük' };

export function DuyuruSayfasi({ ben }: { ben: Profil }) {
  const [liste, setListe] = useState<DuyuruGorunumu[]>([]);
  const [org, setOrg] = useState<OrgYapisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState({ baslik: '', metin: '', hedef: '' });
  const yonetici = ben.roller.some((r) => r !== 'CALISAN');

  const yukle = () => api<DuyuruGorunumu[]>('/duyuru').then(setListe).catch((e) => setHata(e.message));
  useEffect(() => {
    yukle();
    if (yonetici) api<OrgYapisi>('/organizasyon').then(setOrg).catch(() => {});
  }, []);

  // Seçenekler: yönetebildiğim hedefler ("TUR:id")
  const secenekler: Array<[string, string]> = [];
  if (org) {
    if (ben.roller.includes('DIREKTOR')) secenekler.push([`DIREKTORLUK:${org.direktorluk.id}`, `Direktörlük: ${org.direktorluk.ad}`]);
    for (const u of org.unitler) {
      if (u.yonetebilir && (ben.roller.includes('DIREKTOR') || u.unitHead.some((k) => k.id === ben.id)))
        secenekler.push([`UNIT:${u.id}`, `Unit: ${u.ad}`]);
      for (const e of u.ekipler) if (e.yonetebilir) secenekler.push([`EKIP:${e.id}`, `Ekip: ${e.kod}`]);
    }
  }

  const yayinla = () => {
    const [hedefTuru, hedefId] = form.hedef.split(':');
    api('/duyuru', { body: { baslik: form.baslik, metin: form.metin, hedefTuru, hedefId } })
      .then(() => {
        setForm({ baslik: '', metin: '', hedef: '' });
        setHata(null);
        yukle();
      })
      .catch((e) => setHata(e.message));
  };

  return (
    <>
      <h2>Duyurular</h2>
      {hata && <p className="hata">{hata}</p>}
      {yonetici && (
        <section className="kart">
          <h3>Yeni duyuru</h3>
          <select value={form.hedef} onChange={(e) => setForm({ ...form, hedef: e.target.value })}>
            <option value="">Hedef kitle seçin</option>
            {secenekler.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>{' '}
          <input placeholder="Başlık" value={form.baslik} onChange={(e) => setForm({ ...form, baslik: e.target.value })} />
          <div>
            <textarea rows={3} cols={60} placeholder="Metin" value={form.metin} onChange={(e) => setForm({ ...form, metin: e.target.value })} />
          </div>
          <button onClick={yayinla} disabled={!form.hedef}>
            Yayınla
          </button>
        </section>
      )}
      {!liste.length && <p className="soluk">Duyuru yok.</p>}
      {liste.map((d) => (
        <section key={d.id} className="kart">
          <strong>{d.baslik}</strong>{' '}
          <span className="etiket">
            {HEDEF[d.hedefTuru]}: {d.hedefAd}
          </span>
          <div className="soluk">
            {new Date(d.yayinZamani).toLocaleString('tr-TR')} · {d.yayinlayanAd}
          </div>
          <p>{d.metin}</p>
        </section>
      ))}
    </>
  );
}
