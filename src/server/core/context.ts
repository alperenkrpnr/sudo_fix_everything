import type { Db } from '../db/client';

export interface Config {
  /** Denetim izi saklama süresi (yıl). ADR-0002: varsayılan 5. */
  denetimSaklamaYil: number;
  /** Eskalasyon süresi (iş günü). Spec: varsayılan 3. */
  eskalasyonIsGunu: number;
}

export const DEFAULT_CONFIG: Config = {
  denetimSaklamaYil: 5,
  eskalasyonIsGunu: 3,
};

/** Shared dependencies handed to every module service. */
export interface ServiceContext {
  db: Db;
  /** Injectable clock; always use ctx.now() instead of new Date(). */
  now: () => Date;
  config: Config;
}
