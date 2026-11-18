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

  it('Task durum değişikliği ve tarihçe servis katmanına yönlenir', async () => {
    const auth = { authorization: `Bearer mock:${F.thCoklu}`, 'content-type': 'application/json' };
    const task = await (await fetch(`${base}/api/tasks`, { method: 'POST', headers: auth, body: JSON.stringify({ baslik: 'D', assigneeKullaniciId: F.soc1 }) })).json();
    const durum = (body: object) => fetch(`${base}/api/tasks/${task.id}/durum`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    expect((await durum({ durum: 'BLOKLU' })).status).toBe(400);
    expect((await durum({ durum: 'BLOKLU', neden: 'Erişim' })).status).toBe(200);
    const g = await (await fetch(`${base}/api/tasks/${task.id}/gecmis`, { headers: auth })).json();
    expect(g.gecisler).toMatchObject([{ yeni: 'BLOKLU', neden: 'Erişim' }]);
  });

  it('Bildirim tercihleri servis katmanına yönlenir', async () => {
    const auth = { authorization: `Bearer mock:${F.waf1}`, 'content-type': 'application/json' };
    const put = (tur: string, body: object) => fetch(`${base}/api/bildirim/tercihler/${tur}`, { method: 'PUT', headers: auth, body: JSON.stringify(body) });
    expect((await put('TASK_BLOK', { acik: false })).status).toBe(200);
    expect((await put('YOK', { acik: false })).status).toBe(400);
    expect((await put('DUYURU', {})).status).toBe(400);
    const liste = await (await fetch(`${base}/api/bildirim/tercihler`, { headers: auth })).json();
    expect(liste.find((x: any) => x.tur === 'TASK_BLOK')).toMatchObject({ acik: false });
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

  it('rapor tarih aralığı gün olarak (bitiş günü dahil) servise yönlenir; geçersiz tarih 400', async () => {
    const auth = { authorization: `Bearer mock:${F.waf1}`, 'content-type': 'application/json' };
    await fetch(`${base}/api/tasks`, { method: 'POST', headers: auth, body: JSON.stringify({ baslik: 'Kendi işim' }) }); // 2026-03-02
    const rapor = (q: string) => fetch(`${base}/api/rapor?${q}`, { headers: { authorization: `Bearer mock:${F.direktor}` } });
    expect((await (await rapor('baslangic=2026-03-02&bitis=2026-03-02')).json()).genel.toplam).toBe(1);
    expect((await (await rapor('baslangic=2026-03-03')).json()).genel.toplam).toBe(0);
    expect((await rapor('bitis=03.03.2026')).status).toBe(400);
  });
});
