// Service registry: the single entry point adapters (web, REST, MCP) and tests call.
// Add one line per module service.
import { DEFAULT_CONFIG, type Config, type ServiceContext } from './core/context';
import type { Db } from './db/client';
import { denetimServisi } from './modules/denetim';
import { organizasyonServisi } from './modules/organizasyon';
import { oturumServisi } from './modules/oturum';

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
  };
}

export type Services = ReturnType<typeof createServices>;
