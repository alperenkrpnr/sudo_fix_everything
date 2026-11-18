// REST: Vekalet ve eskalasyon (ticket 09). İnce adaptör; iş kuralı yok. Gövdeden yalnızca bilinen alanlar alınır.
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

const tarih = (x: unknown) => new Date(typeof x === 'string' || typeof x === 'number' ? x : NaN);

export function vekaletRouter(services: Services) {
  const r = Router();
  const h = (fn: Parameters<typeof handler>[1]) => handler(services, fn);

  r.get('/vekalet', h((_q, a) => services.vekalet.listele(a)));
  r.get('/vekalet/adaylar', h((_q, a) => services.vekalet.adaylar(a)));
  r.post(
    '/vekalet',
    h((q, a) => {
      const b = q.body ?? {};
      return services.vekalet.ata(a, { vekilId: String(b.vekilId ?? ''), baslangic: tarih(b.baslangic), bitis: tarih(b.bitis) });
    }),
  );
  r.post('/vekalet/:id/sonlandir', h((q, a) => services.vekalet.sonlandir(a, String(q.params.id))));
  r.post('/eskalasyon/isle', h((_q, a) => services.eskalasyon.isle(a)));
  return r;
}
