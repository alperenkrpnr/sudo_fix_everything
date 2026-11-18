import EmbeddedPostgres from 'embedded-postgres';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';

const execFileAsync = promisify(execFile);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export interface RunningPostgres {
  port: number;
  /** URL for a database in this cluster. */
  url(database: string): string;
  stop(): Promise<void>;
}

const USER = 'postgres';
const PASSWORD = 'postgres';

/** Starts an embedded Postgres cluster on a free port in `dataDir`. */
export async function startPostgres(opts: { dataDir: string; persistent: boolean }): Promise<RunningPostgres> {
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    port,
    user: USER,
    password: PASSWORD,
    persistent: opts.persistent,
    onLog: () => {},
    postgresFlags: ['-c', 'max_connections=300', '-c', 'fsync=off'],
  });
  const fs = await import('node:fs');
  if (!fs.existsSync(path.join(opts.dataDir, 'PG_VERSION'))) await server.initialise();
  await server.start();
  return {
    port,
    url: (database) => `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/${database}`,
    stop: () => server.stop(),
  };
}

export async function adminQuery(url: string, sql: string): Promise<pg.QueryResult> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function createDatabase(serverUrl: string, name: string, template?: string): Promise<void> {
  const tpl = template ? ` TEMPLATE "${template}"` : '';
  for (let attempt = 0; ; attempt++) {
    try {
      await adminQuery(serverUrl, `CREATE DATABASE "${name}"${tpl}`);
      return;
    } catch (err) {
      // Concurrent CREATE DATABASE ... TEMPLATE can collide briefly; retry.
      if (attempt >= 20 || !String(err).includes('being accessed by other users')) throw err;
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    }
  }
}

/**
 * Creates the schema in an EMPTY database: DDL from the multi-file Prisma schema
 * (`prisma migrate diff --from-empty`, i.e. no migration files) plus prisma/sql/*.sql.
 * (`prisma db push` is not used: its JS schema engine fails introspecting Postgres 17.)
 */
export async function applySchema(databaseUrl: string): Promise<void> {
  const { stdout: ddl } = await execFileAsync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema', '--script',
    ],
    {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PRISMA_QUERY_ENGINE_LIBRARY: path.join(ROOT, 'prisma/no-native-engine'),
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    },
  );
  await adminQuery(databaseUrl, ddl);
  const sqlDir = path.join(ROOT, 'prisma/sql');
  const files = (await readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await adminQuery(databaseUrl, await readFile(path.join(sqlDir, f), 'utf8'));
}

/** Empties every application table (used between tests). Triggers are bypassed. */
export async function truncateAll(databaseUrl: string): Promise<void> {
  const { rows } = await adminQuery(
    databaseUrl,
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r: { tablename: string }) => `"${r.tablename}"`).join(', ');
  await adminQuery(databaseUrl, `TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
