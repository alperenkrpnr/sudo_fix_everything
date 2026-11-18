// `npm run dev`: embedded Postgres (persistent data in .pgdata/, free port) → fresh
// database with schema + seed fixture on every start → API + Vite (web) on one port.
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createDb } from './db/client';
import { ROOT, adminQuery, applySchema, createDatabase, startPostgres } from './db/postgres';
import { createApp } from './http/app';
import { seedFixture } from './seed/fixture';
import { seedTaskDemo } from './seed/task-demo';
import { seedTaskDurumDemo } from './seed/task-durum-demo';
import { seedRaporDemo } from './seed/rapor-demo';
import { seedEtkinlikDemo } from './seed/demo-etkinlik';
import { seedKabulDemo } from './seed/kabul-demo';
import { seedVekaletDemo } from './seed/vekalet-demo';
import { createServices } from './services';

const DB_NAME = 'siber_task';
const PORT = Number(process.env.PORT ?? 5173);

const pg = await startPostgres({ dataDir: path.join(ROOT, '.pgdata'), persistent: true });
// Demo data is the seed fixture: recreate the database each start so schema changes from
// other tickets always apply cleanly (there are no migrations).
await adminQuery(pg.url('postgres'), `DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
await createDatabase(pg.url('postgres'), DB_NAME);
await applySchema(pg.url(DB_NAME));
const db = createDb(pg.url(DB_NAME));
await seedFixture(db);
await seedTaskDemo(db);
await seedTaskDurumDemo(db);
// After seedTaskDurumDemo: rapor-demo writes its own durum tarihçesi.
await seedRaporDemo(db);

const services = createServices({ db });
await seedEtkinlikDemo(services);
await seedKabulDemo(services);
// After seedKabulDemo: Vekalet demo + eskalasyonlariIsle (no scheduler; runs once on start).
await seedVekaletDemo(services);
const app = express();
app.use(createApp(services));
const vite = await createViteServer({ configFile: path.join(ROOT, 'vite.config.ts'), server: { middlewareMode: true } });
app.use(vite.middlewares);

const server = app.listen(PORT, () => {
  console.log(`\n  Siber Task  http://localhost:${PORT}   (Postgres :${pg.port}, db ${DB_NAME})\n`);
});

async function kapat() {
  server.close();
  await vite.close();
  await db.$disconnect();
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', kapat);
process.on('SIGTERM', kapat);
