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
  fetch(`${base}/api/kabul${yol}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer mock:${kim}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('kabul REST', () => {
  it('bekleyen listesi, gerekçesiz ret 400, kabul ve ret uçları servise yönlenir', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'İş', assigneeKullaniciId: F.waf2 });
    expect(await (await istek(F.waf2, '/bekleyen')).json()).toHaveLength(1);
    expect((await istek(F.waf2, `/tasks/${task.id}/ret`, { gerekce: '' })).status).toBe(400);
    expect((await istek(F.waf1, `/tasks/${task.id}/kabul`, {})).status).toBe(403);
    const r = await istek(F.waf2, `/tasks/${task.id}/ret`, { gerekce: 'Yoğunum' });
    expect((await r.json()).durum).toBe('REDDEDILDI');
    const y = await istek(F.waf1, `/tasks/${task.id}/yeniden-ata`, { assigneeKullaniciId: F.waf2 });
    expect((await y.json()).durum).toBe('KABUL_BEKLIYOR');
    expect((await (await istek(F.waf2, `/tasks/${task.id}/kabul`, {})).json()).durum).toBe('KABUL_EDILDI');
  });
});
