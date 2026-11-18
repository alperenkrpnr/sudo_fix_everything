import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/harness';
import { F } from '../seed/fixture';
import { createApp } from './app';

const t = useTestDb();
let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp(t.services).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const istek = (kim: string, yol: string, body?: unknown) =>
  fetch(`${base}/api${yol}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer mock:${kim}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('etkinlik REST', () => {
  it('iç etkinlik oluşturulur, davetli yanıtlar; Çalışan oluşturmaya çalışırsa 403', async () => {
    const res = await istek(F.thCoklu, '/etkinlik/ic', {
      baslik: 'Toplantı',
      baslangic: '2026-03-10T10:00:00Z',
      ekipIds: [F.ekipWaf],
    });
    expect(res.status).toBe(200);
    const e = await res.json();
    expect((await (await istek(F.waf1, '/etkinlik/bekleyen-davetler')).json())).toHaveLength(1);
    expect((await istek(F.waf1, `/etkinlik/${e.id}/yanit`, { yanit: 'KATILIYORUM' })).status).toBe(200);
    expect((await (await istek(F.waf1, '/etkinlik/bekleyen-davetler')).json())).toHaveLength(0);
    expect((await istek(F.waf1, '/etkinlik/ic', { baslik: 'x', baslangic: '2026-03-10T10:00:00Z' })).status).toBe(403);
  });
});
