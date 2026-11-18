import type { Db } from '../db/client';

export interface Config {
  /** Denetim izi saklama süresi (yıl). ADR-0002: varsayılan 5. */
  denetimSaklamaYil: number;
  /** Eskalasyon süresi (iş günü). Spec: varsayılan 3. */
  eskalasyonIsGunu: number;
  /** Task dosya eklerinin diskteki dizini (gitignore'da). */
  ekDizini: string;
  /** Tek dosya eki için üst sınır (bayt). */
  ekMaxBayt: number;
  /** Termin yaklaşma bildirimi penceresi (gün). Ticket 08: varsayılan 2. */
  terminYaklasmaGun: number;
}

export const DEFAULT_CONFIG: Config = {
  denetimSaklamaYil: 5,
  eskalasyonIsGunu: 3,
  ekDizini: process.env.EK_DIZINI ?? '.ekler',
  ekMaxBayt: 10 * 1024 * 1024,
  terminYaklasmaGun: 2,
};

/** Shared dependencies handed to every module service. */
export interface ServiceContext {
  db: Db;
  /** Injectable clock; always use ctx.now() instead of new Date(). */
  now: () => Date;
  config: Config;
}
