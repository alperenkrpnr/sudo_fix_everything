// Prisma CLI config. The JS schema engine + pg driver adapter is used so that no
// native Prisma engine binaries have to be downloaded (binaries.prisma.sh is not
// reachable from this network). DATABASE_URL is set by the test harness / dev runner.
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

export default defineConfig({
  experimental: { adapter: true },
  schema: 'prisma/schema',
  engine: 'js',
  adapter: async () =>
    new PrismaPg({ connectionString: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unset' }),
});
