// Organizasyon yazma uçları (ticket 02). İş kuralı yok: gövdeyi servise iletir.
import { Router } from 'express';
import type { Services } from '../services';
import { handler } from './app';

export function organizasyonRouter(services: Services) {
  const r = Router();
  const org = services.organizasyon;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = (req: { body?: unknown }): any => req.body ?? {};
  r.post('/unit', handler(services, (req, a) => org.unitOlustur(a, b(req))));
  r.post('/ekip', handler(services, (req, a) => org.ekipOlustur(a, b(req))));
  r.patch('/ekip/:ekipId', handler(services, (req, a) => org.ekipDuzenle(a, { ...b(req), ekipId: req.params.ekipId })));
  r.post('/kullanici', handler(services, (req, a) => org.kullaniciOlustur(a, b(req))));
  r.post('/uye-ekle', handler(services, (req, a) => org.uyeEkle(a, b(req))));
  r.post('/uye-cikar', handler(services, (req, a) => org.uyeCikar(a, b(req))));
  r.post('/calisan-tasi', handler(services, (req, a) => org.calisanTasi(a, b(req))));
  r.post('/team-head-ata', handler(services, (req, a) => org.teamHeadAta(a, b(req))));
  r.post('/team-head-kaldir', handler(services, (req, a) => org.teamHeadKaldir(a, b(req))));
  r.post('/unit-head-ata', handler(services, (req, a) => org.unitHeadAta(a, b(req))));
  r.patch('/profil', handler(services, (req, a) => org.profilGuncelle(a, b(req))));
  return r;
}
