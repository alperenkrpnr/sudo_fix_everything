// Bildirimler paneli (zil düğmesi): liste, okundu işaretleme, ilgili kayda gitme.
import { useState } from 'react';
import { api } from '../api';
import { tarihGoster } from '../format';
import { useUygulama, useVeri } from '../uygulama';
import { Bos, Drawer } from '../ui';
import type { BildirimGorunumu } from '../types';

/** Ayrı görünen bildirim türleri: etiket + vurgu sınıfı. */
const TUR_GORUNUMU: Record<string, { etiket: string; sinif: string }> = {
  TERMIN_GECTI: { etiket: 'Termin geçti', sinif: 'late' },
  TERMIN_YAKLASIYOR: { etiket: 'Termin yaklaşıyor', sinif: 'soon' },
  ESKALASYON: { etiket: 'Eskalasyon', sinif: 'esc' },
  VEKALET: { etiket: 'Vekalet', sinif: 'vek' },
  TASK_DELEGASYON: { etiket: 'Delegasyon', sinif: 'del' },
  TASK_DELEGASYON_KABUL: { etiket: 'Delegasyon', sinif: 'del' },
  TASK_HAVUZA_DONUS: { etiket: 'Ekip havuzu', sinif: 'del' },
};

export function BildirimPaneli({ onKapat, onYenile }: { onKapat: () => void; onYenile: () => Promise<unknown> }) {
  const u = useUygulama();
  const [mesgul, setMesgul] = useState(false);
  const liste = u.bildirimler;
  const okunmamis = liste.filter((b) => !b.okundu);

  const okunduYap = (b: BildirimGorunumu) => (b.okundu ? Promise.resolve() : api(`/bildirim/${b.id}/okundu`, { method: 'POST' }));

  const ac = async (b: BildirimGorunumu) => {
    try {
      await okunduYap(b);
    } catch (e) {
      u.hata(e);
    }
    await onYenile();
    if (b.varlikTuru === 'Task' && b.varlikId) u.taskAc(b.varlikId);
    else if (b.varlikTuru === 'Vekalet') u.git('onaylar');
    else if (b.varlikTuru === 'Etkinlik' || b.varlikTuru === 'Duyuru' || b.varlikTuru === 'Yetkinlik') u.git('etkinlikler');
  };

  const tumunuOku = async () => {
    setMesgul(true);
    try {
      for (const b of okunmamis) await okunduYap(b);
      u.bildir('Tüm bildirimler okundu');
    } catch (e) {
      u.hata(e);
    }
    await onYenile();
    setMesgul(false);
  };

  return (
    <Drawer
      etiket="Bildirimler"
      onKapat={onKapat}
      baslik={
        <>
          <b style={{ fontFamily: 'var(--f-display)', fontSize: 17 }}>Bildirimler</b>
          {okunmamis.length > 0 && <span className="badge">{okunmamis.length}</span>}
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} disabled={!okunmamis.length || mesgul} onClick={tumunuOku}>
            Tümünü okundu say
          </button>
        </>
      }
    >
      <div>
        {liste.map((b) => {
          const g = TUR_GORUNUMU[b.tur];
          const vurgu = g && ['late', 'soon', 'esc'].includes(g.sinif) ? g.sinif : '';
          return (
            <button key={b.id} className={`notif ${b.okundu ? '' : 'unread'} ${vurgu}`} onClick={() => ac(b)}>
              <span className="nd" />
              <span>
                <time>
                  {tarihGoster(b.olusturma)}
                  {g && <span className={`ntype ${g.sinif}`}>{g.etiket}</span>}
                  {!b.okundu && <span className="sr-only"> · okunmamış</span>}
                </time>
                {b.mesaj}
              </span>
            </button>
          );
        })}
        {!liste.length && <Bos>Bildirim yok. Size Task atandığında, kabul/ret kararı verildiğinde veya yeni Duyuru yayınlandığında burada görünür.</Bos>}
      </div>
      <Tercihler />
    </Drawer>
  );
}

interface Tercih {
  tur: string;
  ad: string;
  acik: boolean;
}

/** Bildirim tercihleri: tür başına uygulama içi bildirim açık/kapalı. */
function Tercihler() {
  const u = useUygulama();
  const tercihler = useVeri<Tercih[]>('/bildirim/tercihler');
  const [yerel, setYerel] = useState<Record<string, boolean>>({});
  if (!tercihler.veri) return null;
  const degistir = async (t: Tercih, acik: boolean) => {
    setYerel((y) => ({ ...y, [t.tur]: acik }));
    try {
      await api(`/bildirim/tercihler/${t.tur}`, { method: 'PUT', body: { acik } });
      u.bildir(`${t.ad}: ${acik ? 'açık' : 'kapalı'}`);
    } catch (e) {
      setYerel((y) => ({ ...y, [t.tur]: !acik }));
      u.hata(e);
    }
  };
  return (
    <section className="sec">
      <h2>Bildirim tercihleri</h2>
      <div className="tbl-wrap">
        <table className="prefs">
          <thead>
            <tr>
              <th>Olay</th>
              <th className="num">Uygulama içi</th>
            </tr>
          </thead>
          <tbody>
            {tercihler.veri.map((t) => (
              <tr key={t.tur}>
                <td>
                  <label htmlFor={`pf-${t.tur}`}>{t.ad}</label>
                </td>
                <td className="num">
                  <input id={`pf-${t.tur}`} type="checkbox" checked={yerel[t.tur] ?? t.acik} onChange={(e) => degistir(t, e.target.checked)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Kapattığınız türler için yeni bildirim oluşturulmaz.</p>
    </section>
  );
}
