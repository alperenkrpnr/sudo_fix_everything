// Web-side views of service results. Type-only imports from the server are fine
// (erased at build time); never import server runtime code into src/web.
export type { MockKullanici, OrgYapisi, Profil, Kisi } from '../server/modules/organizasyon';
import type { TaskGorunumu as TaskSunucu } from '../server/modules/task';
export type { Rehber, TaskDurum, TaskOncelik } from '../server/modules/task';
/** JSON'da tarihler string gelir. */
export type TaskGorunumu = Omit<TaskSunucu, 'bitisTarihi' | 'olusturma' | 'guncelleme'> & {
  bitisTarihi: string | null;
  olusturma: string;
  guncelleme: string;
};

import type { KabulAdimGorunumu as KabulAdimSunucu } from '../server/modules/kabul';
export type KabulAdimGorunumu = Omit<KabulAdimSunucu, 'baslangic' | 'kararZamani'> & { baslangic: string | null; kararZamani: string | null };
export interface KabulZinciri {
  adimlar: KabulAdimGorunumu[];
}
