// REST: bildirim, etkinlik, duyuru, yetkinlik (ticket 10). İş kuralı yok; yalnızca servis çağrısı.
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

const tarih = (v: unknown) => (v ? new Date(String(v)) : undefined);

export function etkinlikRouter(services: Services) {
  const r = Router();
  const h = (fn: Parameters<typeof handler>[1]) => handler(services, fn);

  r.get('/bildirim', h((_q, a) => services.bildirim.listele(a)));
  r.post('/bildirim/:id/okundu', h((q, a) => services.bildirim.okunduIsaretle(a, String(q.params.id)).then(() => ({ ok: true }))));

  r.get('/etkinlik', h((_q, a) => services.etkinlik.listele(a)));
  r.get('/etkinlik/bekleyen-davetler', h((_q, a) => services.etkinlik.bekleyenDavetler(a)));
  r.post(
    '/etkinlik/ic',
    h((q, a) =>
      services.etkinlik.icEtkinlikOlustur(a, {
        ...q.body,
        baslangic: tarih(q.body?.baslangic) as Date,
        bitis: tarih(q.body?.bitis),
      }),
    ),
  );
  r.post('/etkinlik/:id/yanit', h((q, a) => services.etkinlik.yanitla(a, String(q.params.id), q.body?.yanit).then(() => ({ ok: true }))));

  r.get('/duyuru', h((_q, a) => services.duyuru.listele(a)));
  r.post('/duyuru', h((q, a) => services.duyuru.yayinla(a, q.body ?? {})));

  r.get('/yetkinlik', h((_q, a) => services.yetkinlik.listele(a)));
  r.post(
    '/yetkinlik',
    h((q, a) =>
      services.yetkinlik.ekle(a, { ...q.body, tarih: tarih(q.body?.tarih) as Date, bitisTarihi: tarih(q.body?.bitisTarihi) }),
    ),
  );
  return r;
}
