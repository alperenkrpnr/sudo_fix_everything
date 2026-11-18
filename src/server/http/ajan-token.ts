// Ajan token REST uçları (ince adaptör; iş kuralı yok).
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

export function ajanTokenRouter(services: Services) {
  const r = Router();
  r.get('/', handler(services, (_req, actor) => services.ajanToken.listele(actor)));
  r.post('/', handler(services, (req, actor) => services.ajanToken.olustur(actor, { ad: req.body?.ad, kapsamlar: req.body?.kapsamlar })));
  r.post('/:id/iptal', handler(services, (req, actor) => services.ajanToken.iptalEt(actor, String(req.params.id))));
  return r;
}
