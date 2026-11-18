// Dashboard REST uçları: Bekleyen işlerim + Rapor (ince adaptör; iş kuralı yok).
import { Router } from 'express';
import { DogrulamaHatasi } from '../core/errors';
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
        baslangic: gun(req.query.baslangic, false),
        bitis: gun(req.query.bitis, true),
      }),
    ),
  );
  return r;
}

/** `YYYY-MM-DD` (UTC gün) → günün başı veya (bitiş için, gün dahil) sonu. Boş → undefined. */
function gun(deger: unknown, gunSonu: boolean): Date | undefined {
  if (!deger) return undefined;
  if (typeof deger !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deger) || Number.isNaN(Date.parse(deger)))
    throw new DogrulamaHatasi('Tarih YYYY-MM-DD biçiminde olmalı');
  return new Date(`${deger}T${gunSonu ? '23:59:59.999' : '00:00:00.000'}Z`);
}
