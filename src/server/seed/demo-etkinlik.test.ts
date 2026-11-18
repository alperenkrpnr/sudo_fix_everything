import { expect, it } from 'vitest';
import { useTestDb } from '../../../test/harness';
import { kullanici } from '../core/actor';
import { seedEtkinlikDemo } from './demo-etkinlik';
import { F } from './fixture';

const t = useTestDb();

it('dev demo verisi servisler üzerinden yüklenir', async () => {
  await seedEtkinlikDemo(t.services);
  expect(await t.services.etkinlik.bekleyenDavetler(kullanici(F.waf1))).toHaveLength(1);
  const turler = (await t.services.bildirim.listele(kullanici(F.waf1))).map((b) => b.tur).sort();
  expect(turler).toEqual(['DUYURU', 'DUYURU', 'ETKINLIK_DAVETI', 'YETKINLIK_BITIS']);
});
