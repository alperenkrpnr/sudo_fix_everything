// Task detayı REST uçları (ticket 07; ince adaptör, iş kuralı yok). app.ts'de taskRouter'dan ÖNCE bağlanır
// (yoksa `GET /api/tasks/backlog` taskRouter'ın `/:id` rotasına düşer).
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { DogrulamaHatasi } from '../core/errors';
import type { Services } from '../services';
import { handler } from './app';

export function taskDetayRouter(services: Services) {
  const r = Router();
  const id = (req: Request) => String(req.params.id);
  r.get('/backlog', handler(services, (_req, actor) => services.taskDetay.backlog(actor)));
  r.get('/:id/detay', handler(services, (req, actor) => services.taskDetay.detay(actor, id(req))));
  r.post('/:id/alt-tasklar', handler(services, (req, actor) => services.taskDetay.altTaskEkle(actor, id(req), { baslik: req.body?.baslik })));
  r.post('/alt-tasklar/:id/tamamla', handler(services, (req, actor) => services.taskDetay.altTaskTamamla(actor, id(req), req.body?.tamamlandi !== false)));
  r.post('/:id/yorumlar', handler(services, (req, actor) => services.taskDetay.yorumEkle(actor, id(req), { metin: req.body?.metin })));
  r.patch('/:id/etiket-ref', handler(services, (req, actor) =>
    services.taskDetay.etiketRefGuncelle(actor, id(req), { etiketler: req.body?.etiketler, hariciRef: req.body?.hariciRef }),
  ));

  // Yükleme: gövde ham dosya baytları (Content-Type: application/octet-stream), ad `?dosyaAdi=`.
  // Boyut/tür kuralı serviste; burada yalnızca gövde okunurken üst sınır uygulanır.
  r.post(
    '/:id/ekler',
    express.raw({ type: () => true, limit: services.ctx.config.ekMaxBayt }),
    handler(services, (req, actor) =>
      services.taskDetay.ekYukle(actor, id(req), { dosyaAdi: String(req.query.dosyaAdi ?? ''), icerik: req.body }),
    ),
  );

  // İndirme: yetki serviste (Task görünürlüğü). Tür sunucunun beyaz listesinden; tarayıcı içerik koklamaz.
  r.get('/ekler/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = services.oturum.tokenCoz(req.header('authorization')?.replace(/^Bearer\s+/i, ''));
      const ek = await services.taskDetay.ekIndir(actor, id(req));
      res.setHeader('Content-Type', ek.mimeTuru);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(ek.dosyaAdi)}`);
      res.send(ek.icerik);
    } catch (err) {
      next(err);
    }
  });

  // Gövde sınırını aşan yükleme → 400 (servis hatası biçiminde).
  r.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    if ((err as { type?: string })?.type === 'entity.too.large') {
      return next(new DogrulamaHatasi(`Dosya en fazla ${services.ctx.config.ekMaxBayt} bayt olabilir`));
    }
    next(err);
  });
  return r;
}
