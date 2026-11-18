// Task durum REST uçları (ticket 04; ince adaptör, iş kuralı yok). /api/tasks altında mount edilir.
import { Router } from 'express';
import type { Services } from '../services';
import type { DurumDegisikligi } from '../modules/task/durum';
import { handler } from './app';

export function taskDurumRouter(services: Services) {
  const r = Router();
  r.post('/:id/durum', handler(services, (req, actor) => services.task.durumDegistir(actor, String(req.params.id), (req.body ?? {}) as DurumDegisikligi)));
  r.get('/:id/gecmis', handler(services, (req, actor) => services.task.durumGecmisi(actor, String(req.params.id))));
  return r;
}
