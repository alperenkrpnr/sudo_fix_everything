// Web-side views of service results. Type-only imports from the server are fine
// (erased at build time); never import server runtime code into src/web.
export type { MockKullanici, OrgYapisi, Profil, Kisi } from '../server/modules/organizasyon';
