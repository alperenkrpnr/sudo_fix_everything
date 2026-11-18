import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/harness';
import { kullanici } from '../core/actor';
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

describe('vekalet ve eskalasyon REST', () => {
  it('aday listesi, atama (yalnızca izinli alanlar), listeleme, sonlandırma ve eskalasyon tetikleyicisi', async () => {
    expect((await (await istek(F.thCoklu, '/vekalet/adaylar')).json()).map((a: { id: string }) => a.id)).toContain(F.waf1);
    expect((await istek(F.thCoklu, '/vekalet', { vekilId: F.cti1, baslangic: '2026-03-02', bitis: '2026-03-09' })).status).toBe(403);
    expect((await istek(F.thCoklu, '/vekalet', { vekilId: F.waf1, baslangic: 'yok', bitis: '2026-03-09' })).status).toBe(400);
    const r = await istek(F.thCoklu, '/vekalet', { vekilId: F.waf1, baslangic: '2026-03-02', bitis: '2026-03-09', asilId: F.direktor });
    const v = await r.json();
    expect(v).toMatchObject({ asilId: F.thCoklu, vekilId: F.waf1 });
    expect((await (await istek(F.waf1, '/vekalet')).json()).vekiliOlduklarim).toHaveLength(1);
    expect((await istek(F.thCoklu, `/vekalet/${v.id}/sonlandir`, {})).status).toBe(200);

    await t.services.task.olustur(kullanici(F.waf1), { baslik: 'CTI ekibine', assigneeEkipId: F.ekipCti });
    t.now = new Date('2026-03-05T09:00:00Z');
    expect((await istek(F.thCti, '/eskalasyon/isle', {})).status).toBe(403);
    expect(await (await istek(F.direktor, '/eskalasyon/isle', {})).json()).toEqual({ eskaleEdilen: 1 });
  });
});
