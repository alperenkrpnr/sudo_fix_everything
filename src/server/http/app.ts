// Web adaptörü (ADR-0001): iş kuralı içermez. Yalnızca isteği çözer, servis katmanını
// çağırır ve servis hatalarını HTTP kodlarına çevirir. Her modül kendi router'ını
// `src/server/http/<modul>.ts` içinde tanımlar ve aşağıda bağlanır.
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Actor } from '../core/actor';
import type { Services } from '../services';
import { taskRouter } from './task';
import { etkinlikRouter } from './etkinlik';

const HTTP_KODU: Record<string, number> = { KIMLIK: 401, YETKI: 403, BULUNAMADI: 404, DOGRULAMA: 400 };

/** Wraps an async handler; `actor` is resolved from the Bearer token (null for public routes). */
export function handler(
  services: Services,
  fn: (req: Request, actor: Actor) => Promise<unknown>,
  opts: { public?: boolean } = {},
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = opts.public
        ? (null as unknown as Actor)
        : services.oturum.tokenCoz(req.header('authorization')?.replace(/^Bearer\s+/i, ''));
      res.json(await fn(req, actor));
    } catch (err) {
      next(err);
    }
  };
}

export function createApp(services: Services) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.set('json replacer', (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));

  app.get('/api/oturum/mock-kullanicilar', handler(services, () => services.organizasyon.mockKullanicilar(), { public: true }));
  app.post('/api/oturum/giris', handler(services, (req) => services.oturum.girisYap(String(req.body?.kullaniciId ?? '')), { public: true }));
  app.get('/api/ben', handler(services, (_req, actor) => services.organizasyon.ben(actor)));
  app.get(
    '/api/organizasyon',
    handler(services, (req, actor) =>
      services.organizasyon.yapiyiGetir(actor, { tarih: req.query.tarih ? new Date(String(req.query.tarih)) : undefined }),
    ),
  );
  app.get('/api/denetim', handler(services, (req, actor) => services.denetim.listele(actor, { islem: req.query.islem as string | undefined })));
  app.use('/api/tasks', taskRouter(services));
  app.use('/api', etkinlikRouter(services));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const kod = (err as { kod?: string })?.kod;
    const status = (kod && HTTP_KODU[kod]) || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ hata: kod ?? 'SUNUCU', mesaj: (err as Error)?.message ?? 'Hata' });
  });
  return app;
}
