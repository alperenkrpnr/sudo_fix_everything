import { useEffect, useState, type ComponentType } from 'react';
import { api, getToken, setToken } from './api';
import { rolAdi } from './format';
import { GirisSayfasi } from './pages/Giris';
import { OrganizasyonSayfasi } from './pages/Organizasyon';
import { TasklarSayfasi } from './pages/Tasklar';
import type { Profil } from './types';

/** Sayfa kaydı: yeni modül sayfası = bir satır. */
const SAYFALAR: Array<{ id: string; baslik: string; bilesen: ComponentType<{ ben: Profil }> }> = [
  { id: 'organizasyon', baslik: 'Organizasyon', bilesen: OrganizasyonSayfasi },
  { id: 'tasklar', baslik: "Task'lar", bilesen: TasklarSayfasi },
];


export function App() {
  const [ben, setBen] = useState<Profil | null>(null);
  const [yukleniyor, setYukleniyor] = useState(!!getToken());
  const [sayfa, setSayfa] = useState(SAYFALAR[0].id);

  const profiliYukle = () =>
    api<Profil>('/ben')
      .then(setBen)
      .catch(() => setToken(null))
      .finally(() => setYukleniyor(false));

  useEffect(() => {
    if (getToken()) profiliYukle();
  }, []);

  if (yukleniyor) return <main>Yükleniyor…</main>;
  if (!ben) return <GirisSayfasi onGiris={(token) => { setToken(token); setYukleniyor(true); profiliYukle(); }} />;

  const Aktif = SAYFALAR.find((s) => s.id === sayfa)!.bilesen;
  return (
    <>
      <header>
        <strong>Siber Task</strong>
        <nav>
          {SAYFALAR.map((s) => (
            <button key={s.id} className={s.id === sayfa ? 'aktif' : ''} onClick={() => setSayfa(s.id)}>
              {s.baslik}
            </button>
          ))}
        </nav>
        <span>
          {ben.ad} · {ben.roller.map(rolAdi).join(', ')}
        </span>
        <button onClick={() => { setToken(null); setBen(null); }}>Çıkış</button>
      </header>
      <main>
        <Aktif ben={ben} />
      </main>
    </>
  );
}
