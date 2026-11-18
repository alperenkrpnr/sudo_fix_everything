// Task REST uçları (ince adaptör; iş kuralı yok).
import { Router, type Request } from 'express';
import type { Services } from '../services';
import type { TaskDurum, TaskGirdisi } from '../modules/task';
import { handler } from './app';

function tarihli<T extends { bitisTarihi?: unknown }>(body: T): T {
  if (body.bitisTarihi === undefined) return body;
  return { ...body, bitisTarihi: body.bitisTarihi ? new Date(String(body.bitisTarihi)) : null };
}

export function taskRouter(services: Services) {
  const r = Router();
  const body = (req: Request) => tarihli((req.body ?? {}) as TaskGirdisi);
  r.get('/rehber', handler(services, (_req, actor) => services.task.rehber(actor)));
  r.get('/', handler(services, (req, actor) => services.task.listele(actor, { durum: req.query.durum as TaskDurum | undefined })));
  r.post('/', handler(services, (req, actor) => services.task.olustur(actor, body(req))));
  r.get('/:id', handler(services, (req, actor) => services.task.getir(actor, String(req.params.id))));
  r.patch('/:id', handler(services, (req, actor) => services.task.guncelle(actor, String(req.params.id), body(req))));
  r.post('/:id/gonder', handler(services, (req, actor) => services.task.gonder(actor, String(req.params.id))));
  return r;
}
