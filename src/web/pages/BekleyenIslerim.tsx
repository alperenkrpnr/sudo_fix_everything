// "Bekleyen işlerim": Çalışan ve Yönetici için aynı bileşen; içerik servis katmanından gelir.
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { BekleyenIs } from '../../server/modules/bekleyen';
import type { Profil } from '../types';

type BekleyenJson = Omit<BekleyenIs, 'termin' | 'beklemeBaslangici'> & { termin: string | null; beklemeBaslangici: string };

const TUR_ADI: Record<string, string> = { TASK_KABUL: 'Task kabulü', ETKINLIK_DAVETI: 'Etkinlik daveti' };

export function BekleyenIslerimSayfasi(_: { ben: Profil }) {
  const [liste, setListe] = useState<BekleyenJson[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const yukle = () => api<BekleyenJson[]>('/bekleyen').then(setListe).catch((e) => setHata(e.message));
  useEffect(() => {
    yukle();
  }, []);
  const yanitla = (id: string, yanit: 'KATILIYORUM' | 'KATILMIYORUM') =>
    api(`/etkinlik/${id}/yanit`, { body: { yanit } }).then(yukle).catch((e) => setHata(e.message));
  const simdi = Date.now();

  return (
    <>
      <h2>Bekleyen işlerim {liste && `(${liste.length})`}</h2>
      {hata && <p className="hata">{hata}</p>}
      {liste && !liste.length && <p className="soluk">Üzerinizde bekleyen iş yok.</p>}
      {liste && liste.length > 0 && (
        <table className="liste">
          <thead>
            <tr>
              <th>Tür</th>
              <th>Başlık</th>
              <th>Neden</th>
              <th>Termin</th>
              <th>Bekliyor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((x) => {
              const gecti = x.termin && new Date(x.termin).getTime() < simdi;
              const gun = Math.floor((simdi - new Date(x.beklemeBaslangici).getTime()) / 86_400_000);
              return (
                <tr key={`${x.tur}-${x.id}`}>
                  <td>{TUR_ADI[x.tur] ?? x.tur}</td>
                  <td>{x.baslik}</td>
                  <td className="soluk">{x.neden}</td>
                  <td className={gecti ? 'gecikti' : ''}>{x.termin ? new Date(x.termin).toLocaleString('tr-TR') : '—'}</td>
                  <td>{x.tur === 'TASK_KABUL' ? `${Math.max(gun, 0)} gün` : '—'}</td>
                  <td>
                    {x.tur === 'ETKINLIK_DAVETI' && (
                      <>
                        <button onClick={() => yanitla(x.id, 'KATILIYORUM')}>Katılıyorum</button>{' '}
                        <button onClick={() => yanitla(x.id, 'KATILMIYORUM')}>Katılmıyorum</button>
                      </>
                    )}
                    {x.tur === 'TASK_KABUL' && <span className="soluk">Kabul/ret: Task'lar sayfası</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
