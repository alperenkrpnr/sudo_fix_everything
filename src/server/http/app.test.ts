// Thin adapter routing tests (spec: adapters get only a few routing tests).
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

describe('web adaptörü', () => {
  it('mock giriş token ile organizasyon görünümünü servis katmanından döner', async () => {
    const giris = await fetch(`${base}/api/oturum/giris`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kullaniciId: F.waf1 }),
    });
    const { token } = await giris.json();
    const res = await fetch(`${base}/api/organizasyon`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const yapi = await res.json();
    expect(yapi.unitler.flatMap((u: any) => u.ekipler).find((e: any) => e.kod === 'TEAM-SOC').uyeler).toBeNull();
  });

  it('Task oluşturma ve listeleme servis katmanına yönlenir', async () => {
    const auth = { authorization: `Bearer mock:${F.waf1}`, 'content-type': 'application/json' };
    const res = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ baslik: 'API task', assigneeKullaniciId: F.cti1, bitisTarihi: '2026-03-20' }),
    });
    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task).toMatchObject({ durum: 'KABUL_BEKLIYOR', bitisTarihi: '2026-03-20T00:00:00.000Z' });
    const liste = await (await fetch(`${base}/api/tasks`, { headers: { authorization: `Bearer mock:${F.cti1}` } })).json();
    expect(liste.map((x: any) => x.id)).toContain(task.id);
    expect((await fetch(`${base}/api/tasks/${task.id}`, { headers: { authorization: `Bearer mock:${F.soc1}` } })).status).toBe(404);
  });

  it('token olmadan 401, yetkisiz işlemde 403 döner', async () => {
    expect((await fetch(`${base}/api/organizasyon`)).status).toBe(401);
    const res = await fetch(`${base}/api/denetim`, { headers: { authorization: `Bearer mock:${F.waf1}` } });
    expect(res.status).toBe(403);
  });

  it('organizasyon yazma uçları servise iletir (Team Head üye ekler, Çalışan ekleyemez)', async () => {
    const ekle = (kim: string) =>
      fetch(`${base}/api/organizasyon/uye-ekle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer mock:${kim}` },
        body: JSON.stringify({ ekipId: F.ekipWaf, kullaniciId: F.pentest1 }),
      });
    expect((await ekle(F.waf1)).status).toBe(403);
    expect((await ekle(F.thCoklu)).status).toBe(200);
  });
});
