import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { api, getToken, hataMesaji, setToken } from './api';
import { anaRol, rolAdi } from './format';
import { TaskDrawer, TaskFormModal } from './gorev';
import { Avatar, Ikon, Modal, NavIkon } from './ui';
import { UygulamaBaglami, useOrtakVeri, useUygulama, type Uygulama } from './uygulama';
import { BildirimPaneli } from './pages/Bildirimler';
import { GirisSayfasi } from './pages/Giris';
import { GenelBakisSayfasi } from './pages/GenelBakis';
import { OnayKutusuSayfasi } from './pages/OnayKutusu';
import { TaskPanosuSayfasi } from './pages/TaskPanosu';
import { EtkinlikSayfasi } from './pages/Etkinlik';
import { RaporSayfasi } from './pages/Rapor';
import { OrganizasyonSayfasi } from './pages/Organizasyon';
import { EntegrasyonSayfasi } from './pages/Entegrasyon';
import logo from './assets/logo.png';
import type { MockKullanici, Profil, TaskGorunumu } from './types';

/** Sayfa kaydı: yeni sayfa = bir satır. `yonetim` sayfaları menüde değil, Yönetim Paneli kutusunda görünür. */
const SAYFALAR: Array<{ id: string; baslik: string; bilesen: ComponentType; yonetim?: boolean }> = [
  // İlk sayfa = girişten sonraki açılış sayfası.
  { id: 'ana', baslik: 'Genel Bakış', bilesen: GenelBakisSayfasi },
  { id: 'onaylar', baslik: 'Onay kutusu', bilesen: OnayKutusuSayfasi },
  { id: 'gorevler', baslik: 'Task panosu', bilesen: TaskPanosuSayfasi },
  { id: 'etkinlikler', baslik: 'Etkinlik & yetkinlik', bilesen: EtkinlikSayfasi },
  { id: 'raporlar', baslik: 'Raporlar', bilesen: RaporSayfasi },
  { id: 'entegrasyon', baslik: 'API & MCP', bilesen: EntegrasyonSayfasi },
  { id: 'organizasyon', baslik: 'Organizasyon', bilesen: OrganizasyonSayfasi, yonetim: true },
];

/** Demo rolü düğmeleri: seed fixture'daki temsilci kullanıcılar (yoksa o roldeki ilk kullanıcı). */
const DEMO_ROLLER: Array<{ rol: string; tercih: string }> = [
  { rol: 'CALISAN', tercih: 'u-waf1' },
  { rol: 'TEAM_HEAD', tercih: 'u-th-coklu' },
  { rol: 'UNIT_HEAD', tercih: 'u-uh-savunma' },
  { rol: 'DIREKTOR', tercih: 'u-direktor' },
];

const yonetimRolu = (ben: Profil) => ben.roller.some((r) => r !== 'CALISAN');

export function App() {
  const [ben, setBen] = useState<Profil | null>(null);
  const [yukleniyor, setYukleniyor] = useState(!!getToken());

  const profiliYukle = () =>
    api<Profil>('/ben')
      .then(setBen)
      .catch(() => setToken(null))
      .finally(() => setYukleniyor(false));

  useEffect(() => {
    if (getToken()) profiliYukle();
  }, []);

  const girisYap = async (kullaniciId: string) => {
    const { token } = await api<{ token: string }>('/oturum/giris', { body: { kullaniciId } });
    setToken(token);
    const p = await api<Profil>('/ben');
    setBen(p);
    return p;
  };

  if (yukleniyor) return <div className="login"><p className="loading">Yükleniyor…</p></div>;
  if (!ben) return <GirisSayfasi onGiris={girisYap} />;
  return (
    <Kabuk
      key={ben.id}
      ben={ben}
      girisYap={girisYap}
      onCikis={() => {
        setToken(null);
        setBen(null);
        history.replaceState(null, '', location.pathname);
      }}
    />
  );
}

function sayfaIzinli(id: string, ben: Profil) {
  const s = SAYFALAR.find((x) => x.id === id);
  return !!s && (!s.yonetim || yonetimRolu(ben));
}

function Kabuk({ ben, girisYap, onCikis }: { ben: Profil; girisYap: (id: string) => Promise<Profil>; onCikis: () => void }) {
  const [surum, setSurum] = useState(0);
  const [sayfa, setSayfa] = useState(() => {
    const h = location.hash.slice(1);
    return sayfaIzinli(h, ben) ? h : SAYFALAR[0]!.id;
  });
  const [toast, setToast] = useState<{ mesaj: string; hata: boolean; n: number } | null>(null);
  const [acikTask, setAcikTask] = useState<string | null>(null);
  const [form, setForm] = useState<{ yenidenAtanan?: TaskGorunumu } | null>(null);
  const [bildirimAcik, setBildirimAcik] = useState(false);
  const [profilAcik, setProfilAcik] = useState(false);
  const [arama, setArama] = useState('');
  const [mock, setMock] = useState<MockKullanici[]>([]);
  const aramaRef = useRef<HTMLInputElement>(null);
  const ortak = useOrtakVeri(ben, surum);

  useEffect(() => {
    api<MockKullanici[]>('/oturum/mock-kullanicilar').then(setMock).catch(() => {});
  }, []);
  useEffect(() => {
    if (location.hash.slice(1) !== sayfa) history.replaceState(null, '', `#${sayfa}`);
  }, [sayfa]);
  useEffect(() => {
    const h = () => {
      const id = location.hash.slice(1);
      if (sayfaIzinli(id, ben)) setSayfa(id);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, [ben]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.hata ? 5000 : 3000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement | null)?.tagName ?? '')) {
        e.preventDefault();
        aramaRef.current?.focus();
      }
    };
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  }, []);

  const yenile = useCallback(() => setSurum((s) => s + 1), []);
  const bildir = useCallback((mesaj: string) => setToast({ mesaj, hata: false, n: Date.now() }), []);
  const hata = useCallback((e: unknown) => setToast({ mesaj: hataMesaji(e), hata: true, n: Date.now() }), []);

  const u: Uygulama = useMemo(() => {
    const kisi = new Map(ortak.rehber?.kullanicilar.map((k) => [k.id, k.ad]));
    const ekip = new Map(ortak.rehber?.ekipler.map((e) => [e.id, e.kod]));
    const kisiAdi = (id: string | null | undefined) => (id ? (id === ben.id ? ben.ad : (kisi.get(id) ?? id)) : '—');
    const ekipKodu = (id: string | null | undefined) => (id ? (ekip.get(id) ?? id) : '—');
    const yonetilen = new Set(ortak.org?.unitler.flatMap((x) => x.ekipler).filter((e) => e.yonetebilir).map((e) => e.id) ?? []);
    return {
      ben,
      ...ortak,
      surum,
      yenile,
      bildir,
      hata,
      git: (s: string) => {
        setAcikTask(null);
        setBildirimAcik(false);
        setSayfa(s);
      },
      taskAc: (id: string) => {
        setBildirimAcik(false);
        setAcikTask(id);
      },
      yeniTask: () => setForm({}),
      yenidenAta: (t: TaskGorunumu) => setForm({ yenidenAtanan: t }),
      arama,
      kisiAdi,
      ekipKodu,
      assigneeAdi: (t: TaskGorunumu) => (t.assigneeEkipId ? ekipKodu(t.assigneeEkipId) : kisiAdi(t.assigneeKullaniciId)),
      yonetilenEkipIds: yonetilen,
      yonetici: yonetimRolu(ben),
      direktor: ben.roller.includes('DIREKTOR'),
    };
  }, [ben, ortak, surum, arama]);

  const rolDegistir = async (rol: string, tercih: string) => {
    const hedef = mock.find((k) => k.id === tercih) ?? mock.find((k) => anaRol(k.roller) === rol);
    if (!hedef) return bildir('Bu rol için demo kullanıcısı bulunamadı');
    if (hedef.id === ben.id) return;
    try {
      const p = await girisYap(hedef.id);
      sessionStorage.setItem('rol-toast', `${p.ad} (${rolAdi(anaRol(p.roller))}) olarak görüntülüyorsunuz`);
    } catch (e) {
      hata(e);
    }
  };
  useEffect(() => {
    try {
      const m = sessionStorage.getItem('rol-toast');
      if (m) {
        sessionStorage.removeItem('rol-toast');
        bildir(m);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const reddedilenlerim = (ortak.tasklar ?? []).filter((t) => t.durum === 'REDDEDILDI' && t.requesterId === ben.id).length;
  const onaySayisi = (ortak.bekleyen?.length ?? 0) + reddedilenlerim;
  const okunmamis = ortak.bildirimler.some((b) => !b.okundu);
  const aktifSayfa = SAYFALAR.find((s) => s.id === sayfa)!;
  const Aktif = aktifSayfa.bilesen;
  const rol = anaRol(ben.roller);
  const benimEkipler = ben.ekipIds.map((id) => u.ekipKodu(id));
  const nerede = benimEkipler.length
    ? benimEkipler.join(', ')
    : rol === 'UNIT_HEAD'
      ? (ortak.org?.unitler.filter((x) => x.unitHead.some((k) => k.id === ben.id)).map((x) => x.ad).join(', ') ?? '')
      : rol === 'DIREKTOR'
        ? (ortak.org?.direktorluk.ad ?? 'Direktörlük')
        : '';
  const demoSecili = DEMO_ROLLER.some((d) => d.tercih === ben.id);

  return (
    <UygulamaBaglami.Provider value={u}>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <img className="brand-logo" src={logo} alt="" />
            <div>
              <b>
                SecOps<span className="grid">Grid</span>
              </b>
              <small>Security Operations, Connected.</small>
            </div>
          </div>
          <nav className="nav" aria-label="Ana menü">
            {SAYFALAR.filter((s) => !s.yonetim).map((s) => (
              <button key={s.id} aria-current={s.id === sayfa ? 'page' : undefined} onClick={() => u.git(s.id)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  {NavIkon[s.id]}
                </svg>
                {s.baslik}
                {s.id === 'onaylar' && onaySayisi > 0 && (
                  <span className="badge" aria-label={`${onaySayisi} bekleyen`}>
                    {onaySayisi}
                  </span>
                )}
              </button>
            ))}
          </nav>
          {yonetimRolu(ben) && (
            <button className="admin-box" aria-current={sayfa === 'organizasyon' ? 'page' : undefined} onClick={() => u.git('organizasyon')}>
              {Ikon.kalkan}
              Yönetim Paneli
              <span className="admin-badge">{rolAdi(rol).toLocaleUpperCase('tr')}</span>
            </button>
          )}
          <div className="me-card">
            <Avatar ad={ben.ad} sinif="lg gold" />
            <button className="who" onClick={() => setProfilAcik(true)} title="Profilim">
              <b>{ben.ad}</b>
              <small>
                {ben.roller.map(rolAdi).join(', ')}
                {nerede && ` · ${nerede}`}
              </small>
            </button>
            <button className="btn icon-btn sm ghost" onClick={onCikis} aria-label="Çıkış yap" title="Çıkış">
              {Ikon.cikis}
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="top">
            <h1>{sayfa === 'raporlar' && rol === 'CALISAN' ? 'Raporum' : aktifSayfa.baslik}</h1>
            <div className="top-actions">
              <div className="roleswitch" title="Demo için: aynı ekranı farklı yetki seviyeleriyle görün">
                <span>Demo rolü</span>
                <div className="seg" role="group" aria-label="Demo rolü">
                  {DEMO_ROLLER.map((d) => (
                    <button
                      key={d.rol}
                      aria-pressed={demoSecili ? d.tercih === ben.id : d.rol === rol}
                      onClick={() => rolDegistir(d.rol, d.tercih)}
                    >
                      {rolAdi(d.rol)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="search">
                {Ikon.search}
                <span className="sr-only">Task ara</span>
                <input
                  ref={aramaRef}
                  type="search"
                  placeholder="Task, kişi, Ekip ara"
                  autoComplete="off"
                  value={arama}
                  onChange={(e) => {
                    setArama(e.target.value);
                    if (sayfa !== 'gorevler' && e.target.value) u.git('gorevler');
                  }}
                />
                <kbd>/</kbd>
              </label>
              <button className="btn icon-btn" aria-label={okunmamis ? 'Bildirimler (okunmamış var)' : 'Bildirimler'} onClick={() => setBildirimAcik(true)}>
                {Ikon.bell}
                {okunmamis && <span className="dotn" />}
              </button>
              <button className="btn primary" onClick={() => setForm({})}>
                {Ikon.plus}Yeni Task
              </button>
            </div>
          </header>
          <main className="view">
            <Aktif />
          </main>
        </div>
      </div>

      {acikTask && <TaskDrawer key={acikTask} id={acikTask} onKapat={() => setAcikTask(null)} />}
      {bildirimAcik && <BildirimPaneli onKapat={() => setBildirimAcik(false)} onYenile={ortak.bildirimYukle} />}
      {form && <TaskFormModal yenidenAtanan={form.yenidenAtanan} onKapat={() => setForm(null)} />}
      {profilAcik && <ProfilModal onKapat={() => setProfilAcik(false)} onKaydedildi={() => girisYap(ben.id).catch(hata)} />}
      {toast && (
        <div className={`toast${toast.hata ? ' hata' : ''}`} role={toast.hata ? 'alert' : 'status'} key={toast.n}>
          {toast.mesaj}
        </div>
      )}
    </UygulamaBaglami.Provider>
  );
}

/** Profilim: ad ve unvan (kendi kaydı). */
function ProfilModal({ onKapat, onKaydedildi }: { onKapat: () => void; onKaydedildi: () => void }) {
  const u = useUygulama();
  const [ad, setAd] = useState(u.ben.ad);
  const [unvan, setUnvan] = useState(u.ben.unvan ?? '');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  return (
    <Modal baslik="Profilim" alt={u.ben.eposta} onKapat={onKapat}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setGonderiliyor(true);
          try {
            await api('/organizasyon/profil', { method: 'PATCH', body: { ad: ad.trim(), unvan: unvan.trim() } });
            u.bildir('Profil kaydedildi');
            onKapat();
            onKaydedildi();
          } catch (err) {
            u.hata(err);
            setGonderiliyor(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="p-ad">Ad soyad</label>
          <input id="p-ad" required value={ad} onChange={(e) => setAd(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="p-unvan">Unvan</label>
          <input id="p-unvan" value={unvan} onChange={(e) => setUnvan(e.target.value)} />
        </div>
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onKapat}>
            Vazgeç
          </button>
          <button className="btn primary" type="submit" disabled={!ad.trim() || gonderiliyor}>
            Kaydet
          </button>
        </div>
      </form>
    </Modal>
  );
}
