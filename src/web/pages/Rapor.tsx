// Rapor sayfası: rol kapsamındaki özet, Ekip bazlı performans, Çalışan sıralaması (yalnızca yöneticiler).
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Metrik, RaporOzeti, SureOzeti } from '../../server/modules/rapor';
import type { OrgYapisi, Profil } from '../types';

const KAPSAM_ADI = { KENDI: "Kendi Task'larım", YONETICI: 'Yönettiğim Ekipler', TUMU: 'Tüm Direktörlük' };
const saat = (s: number | null) => (s === null ? '—' : s >= 48 ? `${(s / 24).toFixed(1)} gün` : `${s} sa`);

/** Açık/kapalı oranı: düz yatay çubuk. */
function OranCubugu({ m }: { m: Metrik }) {
  if (!m.toplam) return <span className="soluk">—</span>;
  const kapaliYuzde = Math.round((m.kapali / m.toplam) * 100);
  return (
    <span title={`${kapaliYuzde}% kapalı`} style={{ display: 'inline-flex', width: 120, height: 10, background: '#f0b429', verticalAlign: 'middle' }}>
      <span style={{ width: `${kapaliYuzde}%`, background: '#2f9e44' }} />
    </span>
  );
}

function MetrikHucreleri({ m }: { m: Metrik }) {
  return (
    <>
      <td>{m.toplam}</td>
      <td>{m.acik}</td>
      <td>{m.kapali}</td>
      <td>
        <OranCubugu m={m} /> {m.toplam ? `${Math.round((m.kapali / m.toplam) * 100)}%` : ''}
      </td>
      <td>{saat(m.ortCozumSaat)}</td>
      <td className={m.geciken ? 'gecikti' : ''}>{m.geciken}</td>
    </>
  );
}

const BASLIKLAR = ['Toplam', 'Açık', 'Kapalı', 'Kapalı oranı', 'Ort. çözüm', 'Geciken'];

function SureKutusu({ baslik, s }: { baslik: string; s: SureOzeti | null }) {
  return (
    <div className="kart">
      <strong>{baslik}</strong>:{' '}
      {!s ? <span className="soluk">veri yok</span> : s.adet ? `${saat(s.ortSaat)} ort. (${s.adet} Task)` : <span className="soluk">yok (0 Task)</span>}
    </div>
  );
}

export function RaporSayfasi(_: { ben: Profil }) {
  const [r, setR] = useState<RaporOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [unitler, setUnitler] = useState<OrgYapisi['unitler']>([]);
  const [filtre, setFiltre] = useState({ unitId: '', ekipId: '' });

  useEffect(() => {
    api<OrgYapisi>('/organizasyon').then((o) => setUnitler(o.unitler)).catch(() => {});
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(Object.entries(filtre).filter(([, v]) => v)).toString();
    api<RaporOzeti>(`/rapor${q ? `?${q}` : ''}`)
      .then((x) => { setR(x); setHata(null); })
      .catch((e) => setHata(e.message));
  }, [filtre]);

  const yonetici = r?.kapsam !== 'KENDI';
  const ekipSecenekleri = unitler.filter((u) => !filtre.unitId || u.id === filtre.unitId).flatMap((u) => u.ekipler);

  return (
    <>
      <h2>Rapor {r && <span className="soluk">· {KAPSAM_ADI[r.kapsam]}</span>}</h2>
      {r && yonetici && (
        <div className="arac">
          <select value={filtre.unitId} onChange={(e) => setFiltre({ unitId: e.target.value, ekipId: '' })}>
            <option value="">Tüm Unit'ler</option>
            {unitler.map((u) => <option key={u.id} value={u.id}>{u.kod}</option>)}
          </select>{' '}
          <select value={filtre.ekipId} onChange={(e) => setFiltre({ ...filtre, ekipId: e.target.value })}>
            <option value="">Tüm Ekipler</option>
            {ekipSecenekleri.map((e) => <option key={e.id} value={e.id}>{e.kod}</option>)}
          </select>
        </div>
      )}
      {hata && <p className="hata">{hata}</p>}
      {r && (
        <>
          <table className="liste">
            <thead><tr><th></th>{BASLIKLAR.map((b) => <th key={b}>{b}</th>)}</tr></thead>
            <tbody><tr><td><strong>Genel</strong></td><MetrikHucreleri m={r.genel} /></tr></tbody>
          </table>

          {r.ekipler && (
            <>
              <h3>Ekip bazlı performans</h3>
              <table className="liste">
                <thead><tr><th>Ekip</th>{BASLIKLAR.map((b) => <th key={b}>{b}</th>)}</tr></thead>
                <tbody>
                  {r.ekipler.map((e) => <tr key={e.ekipId}><td>{e.kod}</td><MetrikHucreleri m={e} /></tr>)}
                </tbody>
              </table>
            </>
          )}

          {r.calisanlar && (
            <>
              <h3>Çalışan sıralaması <span className="soluk">(yalnızca yöneticiler)</span></h3>
              <table className="liste">
                <thead><tr><th>#</th><th>Çalışan</th><th>Tamamlanan</th>{BASLIKLAR.map((b) => <th key={b}>{b}</th>)}</tr></thead>
                <tbody>
                  {r.calisanlar.map((c, i) => (
                    <tr key={c.kullaniciId}><td>{i + 1}</td><td>{c.ad}</td><td>{c.tamamlanan}</td><MetrikHucreleri m={c} /></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Süreler ve ret</h3>
          <SureKutusu baslik="Kabul bekleme süresi" s={r.kabulBekleme} />
          <SureKutusu baslik="Blok süresi" s={r.blokSuresi} />
          <div className="kart">
            <strong>Ret raporu</strong>:{' '}
            {r.retRaporu ? (
              <>
                ret oranı {Math.round(r.retRaporu.retOrani * 100)}% ·{' '}
                {r.retRaporu.gerekceler.map((g) => `${g.gerekce}: ${g.adet}`).join(', ') || 'gerekçe yok'}
              </>
            ) : (
              <span className="soluk">veri yok</span>
            )}
          </div>
        </>
      )}
    </>
  );
}
