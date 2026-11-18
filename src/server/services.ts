// Service registry: the single entry point adapters (web, REST, MCP) and tests call.
// Add one line per module service.
import { DEFAULT_CONFIG, type Config, type ServiceContext } from './core/context';
import type { Db } from './db/client';
import { denetimServisi } from './modules/denetim';
import { organizasyonServisi } from './modules/organizasyon';
import { oturumServisi } from './modules/oturum';
import { taskServisi } from './modules/task';
import { bildirimServisi } from './modules/bildirim';
import { etkinlikServisi } from './modules/etkinlik';
import { duyuruServisi } from './modules/duyuru';
import { yetkinlikServisi } from './modules/yetkinlik';
import { kabulServisi } from './modules/kabul';
import { bekleyenServisi } from './modules/bekleyen';
import { raporServisi } from './modules/rapor';

export function createServices(opts: { db: Db; now?: () => Date; config?: Partial<Config> }) {
  const ctx: ServiceContext = {
    db: opts.db,
    now: opts.now ?? (() => new Date()),
    config: { ...DEFAULT_CONFIG, ...opts.config },
  };
  return {
    ctx,
    organizasyon: organizasyonServisi(ctx),
    oturum: oturumServisi(ctx),
    denetim: denetimServisi(ctx),
    task: taskServisi(ctx),
    bildirim: bildirimServisi(ctx),
    etkinlik: etkinlikServisi(ctx),
    duyuru: duyuruServisi(ctx),
    yetkinlik: yetkinlikServisi(ctx),
    kabul: kabulServisi(ctx),
    bekleyen: bekleyenServisi(ctx),
    rapor: raporServisi(ctx),
  };
}

export type Services = ReturnType<typeof createServices>;
