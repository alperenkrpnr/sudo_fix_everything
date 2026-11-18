// Routing tests: agent tokens on the REST adapter (ticket 13).
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

const json = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

describe('REST ajan token', () => {
  it('kullanıcı token üretir; salt okunur token okur, yazamaz (403); geçersiz token 401', async () => {
    const res = await fetch(`${base}/api/ajan-tokenlari`, { method: 'POST', headers: json(`mock:${F.waf1}`), body: JSON.stringify({ ad: 'claude' }) });
    expect(res.status).toBe(200);
    const { token, kapsamlar } = await res.json();
    expect(kapsamlar).toEqual(['okuma']);
    expect((await fetch(`${base}/api/tasks`, { headers: json(token) })).status).toBe(200);
    const yaz = await fetch(`${base}/api/tasks`, { method: 'POST', headers: json(token), body: JSON.stringify({ baslik: 'x' }) });
    expect(yaz.status).toBe(403);
    expect((await fetch(`${base}/api/tasks`, { headers: json('ajan:yok') })).status).toBe(401);
  });

  it('yazma kapsamlı token Task oluşturur; token listelenir ve iptal edilir', async () => {
    const insan = json(`mock:${F.waf1}`);
    const { id, token } = await (
      await fetch(`${base}/api/ajan-tokenlari`, { method: 'POST', headers: insan, body: JSON.stringify({ ad: 'w', kapsamlar: ['okuma', 'yazma'] }) })
    ).json();
    const yaz = await fetch(`${base}/api/tasks`, { method: 'POST', headers: json(token), body: JSON.stringify({ baslik: 'Ajan' }) });
    expect(yaz.status).toBe(200);
    expect((await (await fetch(`${base}/api/ajan-tokenlari`, { headers: insan })).json()).map((x: any) => x.id)).toEqual([id]);
    expect((await fetch(`${base}/api/ajan-tokenlari/${id}/iptal`, { method: 'POST', headers: insan })).status).toBe(200);
    expect((await fetch(`${base}/api/tasks`, { headers: json(token) })).status).toBe(401);
  });
});
