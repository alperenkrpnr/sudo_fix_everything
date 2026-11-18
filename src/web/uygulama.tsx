// Uygulama bağlamı: oturumdaki kişi, ortak veriler (rehber, organizasyon, Task'lar, bekleyenler,
// bildirimler), yenileme sayacı, toast ve gezinme. Sayfalar veriyi buradan okur; her yazma
// işleminden sonra `yenile()` çağrılır ve bağlı tüm veriler yeniden çekilir.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, hataMesaji } from './api';
import type { BekleyenIs, BildirimGorunumu, OrgYapisi, Profil, Rehber, TaskGorunumu } from './types';

export interface Uygulama {
  ben: Profil;
  rehber: Rehber | null;
  org: OrgYapisi | null;
  tasklar: TaskGorunumu[] | null;
  tasklarHata: string | null;
  bekleyen: BekleyenIs[] | null;
  bildirimler: BildirimGorunumu[];
  surum: number;
  yenile: () => void;
  bildir: (mesaj: string) => void;
  hata: (e: unknown) => void;
  git: (sayfa: string) => void;
  taskAc: (id: string) => void;
  yeniTask: () => void;
  yenidenAta: (t: TaskGorunumu) => void;
  arama: string;
  kisiAdi: (id: string | null | undefined) => string;
  ekipKodu: (id: string | null | undefined) => string;
  assigneeAdi: (t: TaskGorunumu) => string;
  /** Çağıranın yönetebildiği (Sorumlu/Üst yönetici) Ekip id'leri. */
  yonetilenEkipIds: Set<string>;
  yonetici: boolean;
  direktor: boolean;
}

export const UygulamaBaglami = createContext<Uygulama | null>(null);

export function useUygulama(): Uygulama {
  const u = useContext(UygulamaBaglami);
  if (!u) throw new Error('UygulamaBaglami yok');
  return u;
}

/** GET isteği; `surum` değişince yeniden çeker. path null ise çekmez. */
export function useVeri<T>(path: string | null): { veri: T | null; hata: string | null; yukleniyor: boolean } {
  const { surum } = useUygulama();
  const [durum, setDurum] = useState<{ veri: T | null; hata: string | null; yukleniyor: boolean }>({ veri: null, hata: null, yukleniyor: !!path });
  useEffect(() => {
    if (!path) return;
    let iptal = false;
    setDurum((d) => ({ ...d, yukleniyor: true }));
    api<T>(path)
      .then((veri) => !iptal && setDurum({ veri, hata: null, yukleniyor: false }))
      .catch((e) => !iptal && setDurum({ veri: null, hata: hataMesaji(e), yukleniyor: false }));
    return () => {
      iptal = true;
    };
  }, [path, surum]);
  return durum;
}

/** Birden çok GET (ör. her Task için zincir); `surum` değişince yeniden çeker. Hatalı olanlar atlanır. */
export function useCokluVeri<T>(paths: string[]): Record<string, T> {
  const { surum } = useUygulama();
  const [sonuc, setSonuc] = useState<Record<string, T>>({});
  const anahtar = paths.join('|');
  useEffect(() => {
    let iptal = false;
    Promise.all(paths.map((p) => api<T>(p).then((v) => [p, v] as const).catch(() => null))).then((liste) => {
      if (iptal) return;
      const r: Record<string, T> = {};
      for (const x of liste) if (x) r[x[0]] = x[1];
      setSonuc(r);
    });
    return () => {
      iptal = true;
    };
  }, [anahtar, surum]);
  return sonuc;
}

/** Ortak verileri yükler (App içinde bir kez). */
export function useOrtakVeri(ben: Profil, surum: number) {
  const [rehber, setRehber] = useState<Rehber | null>(null);
  const [org, setOrg] = useState<OrgYapisi | null>(null);
  const [tasklar, setTasklar] = useState<TaskGorunumu[] | null>(null);
  const [tasklarHata, setTasklarHata] = useState<string | null>(null);
  const [bekleyen, setBekleyen] = useState<BekleyenIs[] | null>(null);
  const [bildirimler, setBildirimler] = useState<BildirimGorunumu[]>([]);

  const bildirimYukle = useCallback(() => api<BildirimGorunumu[]>('/bildirim').then(setBildirimler).catch(() => {}), []);

  useEffect(() => {
    api<Rehber>('/tasks/rehber').then(setRehber).catch(() => {});
    api<OrgYapisi>('/organizasyon').then(setOrg).catch(() => {});
    api<TaskGorunumu[]>('/tasks')
      .then((t) => {
        setTasklar(t);
        setTasklarHata(null);
      })
      .catch((e) => setTasklarHata(hataMesaji(e)));
    api<BekleyenIs[]>('/bekleyen').then(setBekleyen).catch(() => {});
    bildirimYukle();
  }, [ben.id, surum]);

  // Bildirimler ve bekleyenler arka planda tazelensin.
  useEffect(() => {
    const id = setInterval(() => {
      bildirimYukle();
      api<BekleyenIs[]>('/bekleyen').then(setBekleyen).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [ben.id]);

  return { rehber, org, tasklar, tasklarHata, bekleyen, bildirimler, bildirimYukle };
}
