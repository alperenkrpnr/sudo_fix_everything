// REST: kabul zinciri (ticket 05). İnce adaptör; iş kuralı yok.
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

export function kabulRouter(services: Services) {
  const r = Router();
  const h = (fn: Parameters<typeof handler>[1]) => handler(services, fn);
  const id = (q: { params: Record<string, unknown> }) => String(q.params.id);

  r.get('/bekleyen', h((_q, a) => services.kabul.bekleyenler(a)));
  r.get('/tasks/:id/zincir', h((q, a) => services.kabul.zincir(a, id(q))));
  r.post('/tasks/:id/kabul', h((q, a) => services.kabul.kabulEt(a, id(q))));
  r.post('/tasks/:id/ret', h((q, a) => services.kabul.reddet(a, id(q), q.body?.gerekce)));
  r.post(
    '/tasks/:id/yeniden-ata',
    h((q, a) => {
      const b = q.body ?? {};
      return services.kabul.yenidenAta(a, id(q), { ...b, bitisTarihi: b.bitisTarihi === undefined ? undefined : b.bitisTarihi ? new Date(b.bitisTarihi) : null });
    }),
  );
  r.post('/tasks/:id/iptal', h((q, a) => services.kabul.iptalEt(a, id(q))));
  return r;
}
