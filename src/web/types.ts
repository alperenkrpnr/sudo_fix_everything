// Web-side views of service results. Type-only imports from the server are fine
// (erased at build time); never import server runtime code into src/web.
export type { MockKullanici, OrgYapisi, Profil, Kisi } from '../server/modules/organizasyon';
import type { TaskGorunumu as TaskSunucu } from '../server/modules/task';
import type { TaskDurum } from '../server/modules/task';
export type { Rehber, TaskDurum, TaskOncelik } from '../server/modules/task';
export type { RaporOzeti, Metrik, SureOzeti } from '../server/modules/rapor';

/** JSON'da tarihler string gelir. */
type Jsonla<T, K extends keyof T> = Omit<T, K> & { [P in K]: null extends T[P] ? string | null : string };

export type TaskGorunumu = Jsonla<TaskSunucu, 'bitisTarihi' | 'olusturma' | 'guncelleme'>;

import type { KabulAdimGorunumu as KabulAdimSunucu } from '../server/modules/kabul';
export type KabulAdimGorunumu = Jsonla<KabulAdimSunucu, 'baslangic' | 'kararZamani'>;
export interface KabulZinciri {
  adimlar: KabulAdimGorunumu[];
}

export interface DurumGecisi {
  id: string;
  taskId: string;
  eski: TaskDurum | null;
  yeni: TaskDurum;
  zaman: string;
  kullaniciId: string;
  neden: string | null;
}
export interface DurumGecmisi {
  gecisler: DurumGecisi[];
  blokSuresiMs: number;
  tamamlanma: string | null;
}

import type { BekleyenIs as BekleyenSunucu } from '../server/modules/bekleyen';
export type BekleyenIs = Jsonla<BekleyenSunucu, 'termin' | 'beklemeBaslangici'>;

import type { BildirimGorunumu as BildirimSunucu } from '../server/modules/bildirim';
export type BildirimGorunumu = Jsonla<BildirimSunucu, 'olusturma' | 'okundu'>;

import type { EtkinlikGorunumu as EtkinlikSunucu } from '../server/modules/etkinlik';
export type EtkinlikGorunumu = Jsonla<EtkinlikSunucu, 'baslangic' | 'bitis'>;

import type { DuyuruGorunumu as DuyuruSunucu } from '../server/modules/duyuru';
export type DuyuruGorunumu = Jsonla<DuyuruSunucu, 'yayinZamani'>;

import type { YetkinlikGorunumu as YetkinlikSunucu } from '../server/modules/yetkinlik';
export type YetkinlikGorunumu = Jsonla<YetkinlikSunucu, 'tarih' | 'bitisTarihi'>;

export interface DenetimKaydi {
  id: string;
  zaman: string;
  kullaniciId: string | null;
  adinaKullaniciId: string | null;
  ajan: boolean;
  islem: string;
  varlikTuru: string | null;
  varlikId: string | null;
  veri: unknown;
}
