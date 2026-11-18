// Seam test harness. Usage in a test file:
//
//   const t = useTestDb();            // at top level of the file
//   it('...', async () => { await t.services.organizasyon.yapiyiGetir(kullanici(F.direktor)) })
//
// Each test file gets its own database (cloned from the template); before every
// test all tables are truncated and the seed fixture is loaded again.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createDb, type Db } from '../src/server/db/client';
import { createDatabase, truncateAll } from '../src/server/db/postgres';
import { seedFixture } from '../src/server/seed/fixture';
import { createServices, type Services } from '../src/server/services';
import type { Config } from '../src/server/core/context';

export interface TestDb {
  db: Db;
  services: Services;
  /** Test clock. Set `t.now = new Date(...)` inside a test to move time; reset before each test. */
  now: Date;
  url: string;
}

export const TEST_NOW = new Date('2026-03-02T09:00:00Z');

export function useTestDb(config: Partial<Config> = {}): TestDb {
  const t = { now: TEST_NOW } as TestDb;
  beforeAll(async () => {
    const name = `t_${randomUUID().replace(/-/g, '')}`;
    const serverUrl = inject('pgServerUrl');
    await createDatabase(serverUrl, name, inject('pgTemplateDb'));
    t.url = serverUrl.replace(/\/postgres$/, `/${name}`);
    t.db = createDb(t.url);
    t.services = createServices({ db: t.db, now: () => t.now, config });
  });
  beforeEach(async () => {
    t.now = TEST_NOW;
    await truncateAll(t.url);
    await seedFixture(t.db);
  });
  afterAll(async () => {
    await t.db?.$disconnect();
  });
  return t;
}
