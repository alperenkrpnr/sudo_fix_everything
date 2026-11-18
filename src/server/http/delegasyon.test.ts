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

describe('delegasyon REST', () => {
  it('gelen kutusu (filtreli), delege, delegasyon ret/kabul uçları servise yönlenir', async () => {
    const task = await t.services.task.olustur(kullanici(F.direktor), { baslik: 'İş', assigneeEkipId: F.ekipSoc });
    const kutu = await (await istek(F.thCoklu, `/gelen-kutusu?ekipId=${F.ekipSoc}`)).json();
    expect(kutu.kayitlar.map((k: { tur: string; ekipKod: string }) => `${k.tur}:${k.ekipKod}`)).toEqual(['HAVUZ:TEAM-SOC']);
    expect((await istek(F.thCoklu, `/gelen-kutusu?ekipId=${F.ekipCti}`)).status).toBe(403);

    expect((await istek(F.thCoklu, `/tasks/${task.id}/delege`, { calisanId: F.waf1 })).status).toBe(400);
    expect((await istek(F.thCoklu, `/tasks/${task.id}/delege`, { calisanId: F.soc1 })).status).toBe(200);
    expect(await (await istek(F.soc1, '/delegasyonlar/bekleyen')).json()).toHaveLength(1);
    expect((await istek(F.soc1, `/tasks/${task.id}/delegasyon/ret`, { gerekce: '' })).status).toBe(400);
    expect((await (await istek(F.soc1, `/tasks/${task.id}/delegasyon/ret`, { gerekce: 'Yoğunum' })).json()).assigneeEkipId).toBe(F.ekipSoc);

    await istek(F.thCoklu, `/tasks/${task.id}/delege`, { calisanId: F.soc2 });
    expect((await (await istek(F.soc2, `/tasks/${task.id}/delegasyon/kabul`, {})).json()).assigneeKullaniciId).toBe(F.soc2);
  });
});
