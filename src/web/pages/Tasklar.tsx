import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Profil, Rehber, TaskDurum, TaskGorunumu, TaskOncelik } from '../types';

const DURUMLAR: Array<[TaskDurum, string]> = [
  ['TASLAK', 'Taslak'],
  ['KABUL_BEKLIYOR', 'Kabul Bekliyor'],
  ['KABUL_EDILDI', 'Kabul Edildi'],
  ['DEVAM_EDIYOR', 'Devam Ediyor'],
  ['BLOKLU', 'Bloklu'],
  ['TAMAMLANDI', 'Tamamlandı'],
  ['REDDEDILDI', 'Reddedildi'],
  ['IPTAL', 'İptal'],
];
const durumAdi = (d: TaskDurum) => DURUMLAR.find(([k]) => k === d)?.[1] ?? d;
const ONCELIKLER: TaskOncelik[] = ['DUSUK', 'ORTA', 'YUKSEK', 'KRITIK'];

export function TasklarSayfasi({ ben }: { ben: Profil }) {
  const [tasklar, setTasklar] = useState<TaskGorunumu[] | null>(null);
  const [rehber, setRehber] = useState<Rehber | null>(null);
  const [gorunum, setGorunum] = useState<'pano' | 'liste'>('pano');
  const [hata, setHata] = useState<string | null>(null);
  const [formAcik, setFormAcik] = useState(false);

  const yukle = () => api<TaskGorunumu[]>('/tasks').then(setTasklar).catch((e) => setHata(e.message));
  useEffect(() => {
    yukle();
    api<Rehber>('/tasks/rehber').then(setRehber).catch((e) => setHata(e.message));
  }, []);

  const kisiAdi = (id: string | null) => rehber?.kullanicilar.find((k) => k.id === id)?.ad ?? id ?? '—';
  const ekipKodu = (id: string | null) => rehber?.ekipler.find((e) => e.id === id)?.kod ?? '—';
  const assignee = (t: TaskGorunumu) => (t.assigneeEkipId ? ekipKodu(t.assigneeEkipId) : kisiAdi(t.assigneeKullaniciId));
  const gecikti = (t: TaskGorunumu) =>
    !!t.bitisTarihi && new Date(t.bitisTarihi) < new Date() && !['TAMAMLANDI', 'IPTAL', 'REDDEDILDI'].includes(t.durum);
  const gonder = (id: string) => api(`/tasks/${id}/gonder`, { method: 'POST' }).then(yukle).catch((e) => setHata(e.message));

  if (!tasklar) return hata ? <p className="hata">{hata}</p> : <p>Yükleniyor…</p>;

  const kart = (t: TaskGorunumu) => (
    <div key={t.id} className={`kart${gecikti(t) ? ' gecikti' : ''}`}>
      <strong>{t.baslik}</strong> <span className="etiket">{t.oncelik}</span>
      <div className="soluk">
        {kisiAdi(t.requesterId)} → {assignee(t)}
        {t.bitisTarihi ? ` · ${new Date(t.bitisTarihi).toLocaleDateString('tr-TR')}` : ' · Backlog'}
      </div>
      {t.etiketler.map((e) => (
        <span key={e} className="etiket">#{e}</span>
      ))}
      {t.hariciRef && <span className="etiket">{t.hariciRef}</span>}
      {t.durum === 'TASLAK' && t.requesterId === ben.id && <button onClick={() => gonder(t.id)}>Gönder</button>}
    </div>
  );

  return (
    <>
      <h2>Task'lar</h2>
      {hata && <p className="hata">{hata}</p>}
      <div className="arac">
        <button onClick={() => setGorunum('pano')} disabled={gorunum === 'pano'}>Pano</button>
        <button onClick={() => setGorunum('liste')} disabled={gorunum === 'liste'}>Liste</button>
        <button onClick={() => setFormAcik(!formAcik)}>+ Yeni Task</button>
      </div>
      {formAcik && rehber && (
        <YeniTaskFormu rehber={rehber} ben={ben} onKaydet={() => { setFormAcik(false); setHata(null); yukle(); }} onHata={setHata} />
      )}
      {gorunum === 'pano' ? (
        <div className="pano">
          {DURUMLAR.map(([d, ad]) => (
            <div key={d} className="sutun">
              <h4>
                {ad} <span className="soluk">({tasklar.filter((t) => t.durum === d).length})</span>
              </h4>
              {tasklar.filter((t) => t.durum === d).map(kart)}
            </div>
          ))}
        </div>
      ) : (
        <table className="liste">
          <thead>
            <tr>
              <th>Başlık</th><th>Durum</th><th>Öncelik</th><th>Requester</th><th>Assignee</th><th>Ekip</th><th>Bitiş</th>
            </tr>
          </thead>
          <tbody>
            {tasklar.map((t) => (
              <tr key={t.id} className={gecikti(t) ? 'gecikti' : ''}>
                <td>{t.baslik}</td>
                <td>{durumAdi(t.durum)}</td>
                <td>{t.oncelik}</td>
                <td>{kisiAdi(t.requesterId)}</td>
                <td>{assignee(t)}</td>
                <td>{ekipKodu(t.ekipId)}</td>
                <td>{t.bitisTarihi ? new Date(t.bitisTarihi).toLocaleDateString('tr-TR') : 'Backlog'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function YeniTaskFormu(p: { rehber: Rehber; ben: Profil; onKaydet: () => void; onHata: (m: string) => void }) {
  const [hedef, setHedef] = useState(`k:${p.ben.id}`);
  const kaydet = (form: HTMLFormElement, taslak: boolean) => {
    const f = new FormData(form);
    const [tur, id] = hedef.split(':');
    api('/tasks', {
      body: {
        baslik: f.get('baslik'),
        aciklama: f.get('aciklama') || null,
        oncelik: f.get('oncelik'),
        bitisTarihi: f.get('bitisTarihi') || null,
        etiketler: String(f.get('etiketler') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        hariciRef: f.get('hariciRef') || null,
        ...(tur === 'e' ? { assigneeEkipId: id } : { assigneeKullaniciId: id }),
        taslak,
      },
    })
      .then(p.onKaydet)
      .catch((err) => p.onHata(err.message));
  };
  return (
    <form
      className="kart form"
      onSubmit={(e) => { e.preventDefault(); kaydet(e.currentTarget, false); }}
    >
      <input name="baslik" placeholder="Başlık" required />
      <textarea name="aciklama" placeholder="Açıklama" />
      <label>Assignee{' '}
        <select value={hedef} onChange={(e) => setHedef(e.target.value)}>
          <optgroup label="Kişiler">
            {p.rehber.kullanicilar.map((k) => (
              <option key={k.id} value={`k:${k.id}`}>
                {k.ad}{k.id === p.ben.id ? ' (ben)' : ''} {k.ekipler.length ? `· ${k.ekipler.map((e) => e.kod).join(', ')}` : `· ${k.unvan ?? ''}`}
              </option>
            ))}
          </optgroup>
          <optgroup label="Ekipler">
            {p.rehber.ekipler.map((e) => (
              <option key={e.id} value={`e:${e.id}`}>{e.kod} · {e.ad}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <label>Öncelik{' '}
        <select name="oncelik" defaultValue="ORTA">
          {ONCELIKLER.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
      <label>Bitiş <input type="date" name="bitisTarihi" /></label>
      <input name="etiketler" placeholder="Etiketler (virgülle)" />
      <input name="hariciRef" placeholder="Harici ticket ref (ops.)" />
      <div>
        <button type="submit">Oluştur</button>{' '}
        <button type="button" onClick={(e) => { const f = e.currentTarget.form!; if (f.reportValidity()) kaydet(f, true); }}>Taslak kaydet</button>
      </div>
    </form>
  );
}
