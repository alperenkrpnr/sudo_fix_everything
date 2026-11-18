// Service-layer errors. Adapters map them to transport codes (web: 401/403/404/400).

export class YetkiHatasi extends Error {
  readonly kod = 'YETKI' as const;
}

export class KimlikHatasi extends Error {
  readonly kod = 'KIMLIK' as const;
}

export class BulunamadiHatasi extends Error {
  readonly kod = 'BULUNAMADI' as const;
}

export class DogrulamaHatasi extends Error {
  readonly kod = 'DOGRULAMA' as const;
}

export type ServisHatasi = YetkiHatasi | KimlikHatasi | BulunamadiHatasi | DogrulamaHatasi;
