import { expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb({ eskalasyonIsGunu: 1 });

it('eskalasyon süresi ayardan gelir (eskalasyonIsGunu)', async () => {
  await t.services.task.olustur(kullanici(F.waf1), { baslik: 'CTI ekibine', assigneeEkipId: F.ekipCti });
  expect(await t.services.eskalasyon.eskalasyonlariIsle(new Date('2026-03-03T08:59:00Z'))).toBe(0);
  expect(await t.services.eskalasyon.eskalasyonlariIsle(new Date('2026-03-03T09:00:00Z'))).toBe(1);
});
