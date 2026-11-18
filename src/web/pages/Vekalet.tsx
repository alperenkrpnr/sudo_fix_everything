// Vekalet: Yönetici yokluğunda onay yetkisini tarih aralıklı bir Vekile devreder. Vekil adayları,
// çakışma ve yetki sunucuda denetlenir; burada yalnızca form, liste ve "X adına Vekilsiniz" bandı var.
import { useState } from 'react';
import { api, hataMesaji } from '../api';
import { tarihGoster } from '../format';
import { useUygulama, useVeri } from '../uygulama';
import { HataKutusu, Ikon, Modal, Yukleniyor } from '../ui';
import type { VekaletGorunumu, Vekaletlerim, VekilAdayi } from '../types';

type VekaletDurumu = 'AKTIF' | 'PLANLI' | 'BITTI';
const durumu = (v: VekaletGorunumu, simdi = Date.now()): VekaletDurumu =>
  new Date(v.bitis).getTime() <= simdi ? 'BITTI' : new Date(v.baslangic).getTime() > simdi ? 'PLANLI' : 'AKTIF';
const DURUM_PILL: Record<VekaletDurumu, [string, string]> = { AKTIF: ['done', 'Aktif'], PLANLI: ['wait', 'Planlandı'], BITTI: ['', 'Sona erdi'] };
/** Formdan girilen Vekalet gün sınırındadır (UTC gece yarısı, bitiş hariç); gösterimde bitiş günü dahil yazılır. */
const gunSiniri = (v: string) => new Date(v).getTime() % 86_400_000 === 0;
const aralik = (v: VekaletGorunumu) =>
  `${tarihGoster(v.baslangic)} – ${gunSiniri(v.bitis) ? tarihGoster(new Date(new Date(v.bitis).getTime() - 86_400_000).toISOString()) : tarihGoster(v.bitis)}`;

/** Yerel takvim günü → YYYY-MM-DD (date input değeri). */
const gunDegeri = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Onay kutusunun üstünde: aktif Vekaletler ("X adına Vekilsiniz", "Vekiliniz: Y"). */
export function VekilBannerlari() {
  const u = useUygulama();
  const v = useVeri<Vekaletlerim>('/vekalet');
  if (!v.veri) return null;
  const vekili = v.veri.vekiliOlduklarim.filter((x) => durumu(x) === 'AKTIF');
  const verdigim = v.veri.verdiklerim.filter((x) => durumu(x) === 'AKTIF');
  return (
    <>
      {vekili.map((x) => (
        <div key={x.id} className="banner info">
          {Ikon.info}
          <div>
            <b>{u.kisiAdi(x.asilId)} adına Vekilsiniz</b> ({aralik(x)}). Onun kabul talepleri “Vekil işleri” grubunda; kararlarınız “{u.kisiAdi(x.asilId)} adına {u.ben.ad}” olarak kaydedilir.
          </div>
        </div>
      ))}
      {verdigim.map((x) => (
        <div key={x.id} className="banner wait">
          {Ikon.clock}
          <div>
            <b>Vekiliniz: {u.kisiAdi(x.vekilId)}</b> ({aralik(x)}). Bu süre boyunca kabul talepleriniz ona da gider.
          </div>
        </div>
      ))}
    </>
  );
}

/** Vekil ata formu + verdiğim / üstlendiğim Vekaletler. */
export function VekaletModal({ onKapat }: { onKapat: () => void }) {
  const u = useUygulama();
  const liste = useVeri<Vekaletlerim>('/vekalet');
  const adaylar = useVeri<VekilAdayi[]>('/vekalet/adaylar');
  const bugun = new Date();
  const [vekilId, setVekilId] = useState('');
  const [bas, setBas] = useState(gunDegeri(bugun));
  const [bit, setBit] = useState(gunDegeri(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + 7)));
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [sonlandirilan, setSonlandirilan] = useState<string | null>(null);
  const secili = vekilId || adaylar.veri?.[0]?.id || '';

  const ata = async () => {
    setHata(null);
    // Uygulamadaki tarih-only değerler gibi UTC gün sınırı: başlangıç günü 00:00, bitiş günü dahil (ertesi gün 00:00 hariç).
    const [by, bm, bd] = bas.split('-').map(Number);
    const [sy, sm, sd] = bit.split('-').map(Number);
    const baslangic = new Date(Date.UTC(by!, bm! - 1, bd!));
    const bitis = new Date(Date.UTC(sy!, sm! - 1, sd! + 1));
    if (bitis <= baslangic) return setHata('Bitiş tarihi başlangıçtan önce olamaz.');
    setMesgul(true);
    try {
      await api('/vekalet', { body: { vekilId: secili, baslangic: baslangic.toISOString(), bitis: bitis.toISOString() } });
      u.bildir(`${u.kisiAdi(secili)} Vekiliniz olarak atandı`);
      u.yenile();
    } catch (e) {
      setHata(hataMesaji(e));
    }
    setMesgul(false);
  };

  const sonlandir = async (v: VekaletGorunumu) => {
    setMesgul(true);
    try {
      await api(`/vekalet/${v.id}/sonlandir`, { method: 'POST' });
      u.bildir('Vekalet sonlandırıldı');
      setSonlandirilan(null);
    } catch (e) {
      u.hata(e);
    }
    setMesgul(false);
    u.yenile();
  };

  return (
    <Modal baslik="Vekalet" alt="Yokluğunuzda kabul kararlarınızı tarih aralığıyla bir Vekile devredin" onKapat={onKapat}>
      {adaylar.hata && <HataKutusu mesaj={adaylar.hata} />}
      {!adaylar.veri && !adaylar.hata && <Yukleniyor />}
      {adaylar.veri && adaylar.veri.length === 0 && <p className="hint">Vekil atama yalnızca yöneticilere açıktır.</p>}
      {adaylar.veri && adaylar.veri.length > 0 && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            ata();
          }}
        >
          <div className="field">
            <label htmlFor="vk-kim">Vekil</label>
            <select id="vk-kim" value={secili} onChange={(e) => setVekilId(e.target.value)}>
              {adaylar.veri.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                  {k.unvan ? ` · ${k.unvan}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="vk-bas">Başlangıç</label>
              <input id="vk-bas" type="date" required value={bas} onChange={(e) => setBas(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="vk-bit">Bitiş (dahil)</label>
              <input id="vk-bit" type="date" required value={bit} min={bas} onChange={(e) => setBit(e.target.value)} />
            </div>
          </div>
          <div className="banner info">
            {Ikon.info}
            <div>Vekil bu aralıkta sizin adınıza kabul/ret kararı verir ve Ekip gelen kutunuzu görür. Süre bitince Vekalet kendiliğinden sona erer.</div>
          </div>
          {hata && <HataKutusu mesaj={hata} />}
          <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" type="submit" disabled={!secili || mesgul}>
              Vekil ata
            </button>
          </div>
        </form>
      )}
      {liste.veri && (liste.veri.verdiklerim.length > 0 || liste.veri.vekiliOlduklarim.length > 0) && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Kim</th>
                <th>Aralık</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liste.veri.verdiklerim.map((v) => {
                const d = durumu(v);
                return (
                  <tr key={v.id}>
                    <td>
                      Vekiliniz: <b>{u.kisiAdi(v.vekilId)}</b>
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {aralik(v)}
                    </td>
                    <td>
                      <span className={`st ${DURUM_PILL[d][0]}`}>{DURUM_PILL[d][1]}</span>
                    </td>
                    <td className="num">
                      {d !== 'BITTI' &&
                        (sonlandirilan === v.id ? (
                          <span className="appr-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn sm bad" disabled={mesgul} onClick={() => sonlandir(v)}>
                              Evet, sonlandır
                            </button>
                            <button className="btn sm ghost" onClick={() => setSonlandirilan(null)}>
                              Vazgeç
                            </button>
                          </span>
                        ) : (
                          <button className="btn sm" onClick={() => setSonlandirilan(v.id)}>
                            Sonlandır
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
              {liste.veri.vekiliOlduklarim.map((v) => {
                const d = durumu(v);
                return (
                  <tr key={v.id}>
                    <td>
                      <b>{u.kisiAdi(v.asilId)}</b> adına Vekilsiniz
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {aralik(v)}
                    </td>
                    <td>
                      <span className={`st ${DURUM_PILL[d][0]}`}>{DURUM_PILL[d][1]}</span>
                    </td>
                    <td></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {liste.hata && <HataKutusu mesaj={liste.hata} />}
      <p className="hint">Vekalet kayıtları silinmez; erken sonlandırmada bitiş tarihi bugüne çekilir.</p>
    </Modal>
  );
}
