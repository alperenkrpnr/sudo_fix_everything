import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/harness';
import { kullanici } from '../core/actor';
import { F } from '../seed/fixture';
import { createApp } from './app';

const t = useTestDb({ ekDizini: mkdtempSync(path.join(tmpdir(), 'ekler-http-')), ekMaxBayt: 20 });
let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp(t.services).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const auth = (kim: string) => ({ authorization: `Bearer mock:${kim}` });
const yukle = (kim: string, taskId: string, dosyaAdi: string, icerik: string) =>
  fetch(`${base}/api/tasks/${taskId}/ekler?dosyaAdi=${encodeURIComponent(dosyaAdi)}`, {
    method: 'POST',
    headers: { ...auth(kim), 'content-type': 'application/octet-stream' },
    body: icerik,
  });

describe('task detay REST', () => {
  it('ek ham gövdeyle yüklenir, ek dosyası olarak indirilir; yetkisiz 404, büyük dosya 400', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'İş' });
    const r = await yukle(F.waf1, task.id, 'not ş.txt', 'merhaba');
    expect(r.status).toBe(200);
    const ek = await r.json();

    const d = await fetch(`${base}/api/tasks/ekler/${ek.id}`, { headers: auth(F.waf1) });
    expect(d.status).toBe(200);
    expect(d.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(d.headers.get('x-content-type-options')).toBe('nosniff');
    expect(d.headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''${encodeURIComponent('not ş.txt')}`);
    expect(await d.text()).toBe('merhaba');

    expect((await fetch(`${base}/api/tasks/ekler/${ek.id}`, { headers: auth(F.cti1) })).status).toBe(404);
    expect((await yukle(F.waf1, task.id, 'buyuk.txt', 'x'.repeat(21))).status).toBe(400);
  });

  it('backlog ve detay uçları servise yönlenir', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Tarihsiz' });
    const b = await fetch(`${base}/api/tasks/backlog`, { headers: auth(F.waf1) });
    expect((await b.json()).map((x: { id: string }) => x.id)).toEqual([task.id]);
    const y = await fetch(`${base}/api/tasks/${task.id}/yorumlar`, {
      method: 'POST',
      headers: { ...auth(F.waf1), 'content-type': 'application/json' },
      body: JSON.stringify({ metin: 'Not' }),
    });
    expect(y.status).toBe(200);
    const d = await (await fetch(`${base}/api/tasks/${task.id}/detay`, { headers: auth(F.waf1) })).json();
    expect(d.tarihce.map((x: { metin?: string }) => x.metin)).toEqual(['Not']);
  });
});
