import { useEffect, useState } from 'react';
import { api } from '../api';
import type { BekleyenDavet, EtkinlikGorunumu } from '../../server/modules/etkinlik';
import type { OrgYapisi, Profil } from '../types';

const zaman = (d: Date | string) => new Date(d).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
const YANIT: Record<string, string> = { BEKLIYOR: 'bekliyor', KATILIYORUM: 'katılıyor', KATILMIYORUM: 'katılmıyor' };

export function EtkinlikSayfasi({ ben }: { ben: Profil }) {
  const [liste, setListe] = useState<EtkinlikGorunumu[]>([]);
  const [bekleyen, setBekleyen] = useState<BekleyenDavet[]>([]);
  const [org, setOrg] = useState<OrgYapisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState({ baslik: '', yer: '', baslangic: '', ekipIds: [] as string[] });
  const yonetici = ben.roller.some((r) => r !== 'CALISAN');

  const yukle = () => {
    api<EtkinlikGorunumu[]>('/etkinlik').then(setListe).catch((e) => setHata(e.message));
    api<BekleyenDavet[]>('/etkinlik/bekleyen-davetler').then(setBekleyen).catch((e) => setHata(e.message));
  };
  useEffect(() => {
    yukle();
    if (yonetici) api<OrgYapisi>('/organizasyon').then(setOrg).catch(() => {});
  }, []);

  const yanitla = (id: string, yanit: string) =>
    api(`/etkinlik/${id}/yanit`, { body: { yanit } }).then(yukle).catch((e) => setHata(e.message));
  const olustur = () =>
    api('/etkinlik/ic', { body: { ...form, baslangic: form.baslangic ? new Date(form.baslangic).toISOString() : null } })
      .then(() => {
        setForm({ baslik: '', yer: '', baslangic: '', ekipIds: [] });
        setHata(null);
        yukle();
      })
      .catch((e) => setHata(e.message));
  const ekipler = org?.unitler.flatMap((u) => u.ekipler).filter((e) => e.yonetebilir) ?? [];
  const davetim = (e: EtkinlikGorunumu) => e.davetler.find((d) => d.kullaniciId === ben.id);

  return (
    <>
      <h2>Etkinlikler</h2>
      {hata && <p className="hata">{hata}</p>}
      <section className="kart">
        <h3>Bekleyen davetlerim ({bekleyen.length})</h3>
        {!bekleyen.length && <p className="soluk">Yanıt bekleyen davet yok.</p>}
        {bekleyen.map((d) => (
          <div key={d.davetId}>
            <strong>{d.etkinlik.baslik}</strong> <span className="soluk">{zaman(d.etkinlik.baslangic)}</span>{' '}
            <button onClick={() => yanitla(d.etkinlik.id, 'KATILIYORUM')}>Katılıyorum</button>{' '}
            <button onClick={() => yanitla(d.etkinlik.id, 'KATILMIYORUM')}>Katılmıyorum</button>
          </div>
        ))}
      </section>

      {yonetici && (
        <section className="kart">
          <h3>Yeni iç etkinlik</h3>
          <input placeholder="Başlık" value={form.baslik} onChange={(e) => setForm({ ...form, baslik: e.target.value })} />{' '}
          <input placeholder="Yer" value={form.yer} onChange={(e) => setForm({ ...form, yer: e.target.value })} />{' '}
          <input type="datetime-local" value={form.baslangic} onChange={(e) => setForm({ ...form, baslangic: e.target.value })} />
          <div className="soluk">Davet edilecek Ekipler:</div>
          {ekipler.map((e) => (
            <label key={e.id} style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={form.ekipIds.includes(e.id)}
                onChange={(ev) =>
                  setForm({
                    ...form,
                    ekipIds: ev.target.checked ? [...form.ekipIds, e.id] : form.ekipIds.filter((x) => x !== e.id),
                  })
                }
              />{' '}
              {e.kod}
            </label>
          ))}
          <div>
            <button onClick={olustur}>Oluştur ve davet et</button>
          </div>
        </section>
      )}

      <h3>Etkinlik geçmişi</h3>
      {!liste.length && <p className="soluk">Görebileceğiniz etkinlik yok.</p>}
      {liste.map((e) => (
        <section key={e.id} className="kart">
          <strong>{e.baslik}</strong> <span className="etiket">{e.tip === 'IC' ? 'İç' : e.tip}</span>
          {davetim(e) && <span className="etiket">yanıtım: {YANIT[davetim(e)!.yanit]}</span>}
          <div className="soluk">
            {zaman(e.baslangic)} {e.yer && `· ${e.yer}`} · Düzenleyen: {e.olusturanAd}
          </div>
          <div className="soluk">
            {e.davetler.map((d) => `${d.ad} (${YANIT[d.yanit]})`).join(', ') || 'Davetli yok'}
          </div>
        </section>
      ))}
    </>
  );
}
