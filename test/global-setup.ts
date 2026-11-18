// Runs once per `npm test`: starts ONE embedded Postgres cluster on a free port in a
// fresh temp dir, pushes the schema into a template database, and hands the URLs to
// the test workers. Each test file clones its own database from the template.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { ROOT, applySchema, createDatabase, startPostgres } from '../src/server/db/postgres';

export const TEMPLATE_DB = 'sablon';

declare module 'vitest' {
  export interface ProvidedContext {
    pgServerUrl: string;
    pgTemplateDb: string;
  }
}

export default async function setup(project: TestProject) {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules/prisma/build/index.js'), 'generate'], {
    cwd: ROOT,
    env: { ...process.env, PRISMA_QUERY_ENGINE_LIBRARY: path.join(ROOT, 'prisma/no-native-engine'), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'ignore',
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'siber-task-test-pg-'));
  const pg = await startPostgres({ dataDir, persistent: false });
  await createDatabase(pg.url('postgres'), TEMPLATE_DB);
  await applySchema(pg.url(TEMPLATE_DB));
  project.provide('pgServerUrl', pg.url('postgres'));
  project.provide('pgTemplateDb', TEMPLATE_DB);
  return async () => {
    await pg.stop();
    await rm(dataDir, { recursive: true, force: true });
  };
}
