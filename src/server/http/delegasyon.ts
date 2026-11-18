// REST: Ekip gelen kutusu ve delegasyon (ticket 06). İnce adaptör; iş kuralı yok. /api/kabul altına bağlanır.
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

export function delegasyonRouter(services: Services) {
  const r = Router();
  const h = (fn: Parameters<typeof handler>[1]) => handler(services, fn);
  const id = (q: { params: Record<string, unknown> }) => String(q.params.id);
  const metin = (v: unknown) => (typeof v === 'string' ? v : '');

  r.get('/gelen-kutusu', h((q, a) => services.kabul.ekipGelenKutusu(a, { ekipId: metin(q.query.ekipId) || undefined })));
  r.get('/delegasyonlar/bekleyen', h((_q, a) => services.kabul.bekleyenDelegasyonlar(a)));
  r.post('/tasks/:id/delege', h((q, a) => services.kabul.delegeEt(a, id(q), metin(q.body?.calisanId))));
  r.post('/tasks/:id/delegasyon/kabul', h((q, a) => services.kabul.delegasyonKabulEt(a, id(q))));
  r.post('/tasks/:id/delegasyon/ret', h((q, a) => services.kabul.delegasyonReddet(a, id(q), metin(q.body?.gerekce))));
  return r;
}
