// Dashboard REST uçları: Bekleyen işlerim + Rapor (ince adaptör; iş kuralı yok).
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

export function dashboardRouter(services: Services) {
  const r = Router();
  r.get('/bekleyen', handler(services, (_req, actor) => services.bekleyen.listele(actor)));
  r.get(
    '/rapor',
    handler(services, (req, actor) =>
      services.rapor.ozet(actor, {
        ekipId: (req.query.ekipId as string) || undefined,
        unitId: (req.query.unitId as string) || undefined,
      }),
    ),
  );
  return r;
}
