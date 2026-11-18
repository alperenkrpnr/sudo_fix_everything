import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

// Saat: TEST_NOW = 2026-03-02T09:00Z. Varsayılan yaklaşma penceresi 2 gün.
const t = useTestDb();

const terminBildirimleri = async (userId: string) =>
  (await t.services.bildirim.listele(kullanici(userId))).filter((b) => b.tur.startsWith('TERMIN_'));

/** thCoklu → soc1: direkt kabul. */
const task = (bitis: string, baslik = 'SIEM kuralı') =>
  t.services.task.olustur(kullanici(F.thCoklu), { baslik, assigneeKullaniciId: F.soc1, bitisTarihi: new Date(bitis) });

describe('Termin bildirimleri', () => {
  it('Termini yaklaşan açık Task için Assignee ve Requester bildirim alır', async () => {
    const tk = await task('2026-03-03T17:00:00Z');
    await task('2026-03-10T17:00:00Z', 'Uzak termin');
    expect(await t.services.bildirim.terminBildirimleriniIsle()).toBe(2);
    for (const kim of [F.soc1, F.thCoklu])
      expect(await terminBildirimleri(kim)).toEqual([expect.objectContaining({ tur: 'TERMIN_YAKLASIYOR', varlikTuru: 'Task', varlikId: tk.id })]);
  });

  it('Tekrar çalıştırmak aynı bildirimi yeniden göndermez', async () => {
    await task('2026-03-03T17:00:00Z');
    await t.services.bildirim.terminBildirimleriniIsle();
    expect(await t.services.bildirim.terminBildirimleriniIsle()).toBe(0);
    expect(await terminBildirimleri(F.soc1)).toHaveLength(1);
  });

  it('Termini geçen Task için TERMIN_GECTI; yaklaşma bildirimi almış olsa da', async () => {
    const tk = await task('2026-03-03T17:00:00Z');
    await t.services.bildirim.terminBildirimleriniIsle();
    t.now = new Date('2026-03-04T09:00:00Z');
    await t.services.bildirim.terminBildirimleriniIsle();
    expect((await terminBildirimleri(F.soc1)).map((b) => [b.tur, b.varlikId])).toEqual([
      ['TERMIN_GECTI', tk.id],
      ['TERMIN_YAKLASIYOR', tk.id],
    ]);
  });

  it('Kapalı Task için bildirim gitmez', async () => {
    const tk = await task('2026-03-01T17:00:00Z');
    await t.services.task.durumDegistir(kullanici(F.soc1), tk.id, { durum: 'TAMAMLANDI' });
    expect(await t.services.bildirim.terminBildirimleriniIsle()).toBe(0);
  });

  it("Ekip'e atanan Task için Sorumlu yönetici bildirim alır", async () => {
    const tk = await t.services.task.olustur(kullanici(F.uhSavunma), {
      baslik: 'Alarm triyajı',
      assigneeEkipId: F.ekipSoc,
      bitisTarihi: new Date('2026-03-01T17:00:00Z'),
    });
    await t.services.bildirim.terminBildirimleriniIsle();
    expect(await terminBildirimleri(F.thCoklu)).toEqual([expect.objectContaining({ tur: 'TERMIN_GECTI', varlikId: tk.id })]);
    expect(await terminBildirimleri(F.uhSavunma)).toHaveLength(1);
  });

  it('Termin değişince yeniden bildirilir', async () => {
    const tk = await task('2026-03-03T17:00:00Z');
    await t.services.bildirim.terminBildirimleriniIsle();
    await t.services.task.guncelle(kullanici(F.thCoklu), tk.id, { bitisTarihi: new Date('2026-03-03T12:00:00Z') });
    await t.services.bildirim.terminBildirimleriniIsle();
    expect(await terminBildirimleri(F.soc1)).toHaveLength(2);
  });

  it('Kullanıcı termin bildirimini kapattıysa almaz', async () => {
    await t.services.bildirim.tercihGuncelle(kullanici(F.soc1), 'TERMIN_YAKLASIYOR', false);
    await task('2026-03-03T17:00:00Z');
    await t.services.bildirim.terminBildirimleriniIsle();
    expect(await terminBildirimleri(F.soc1)).toEqual([]);
    expect(await terminBildirimleri(F.thCoklu)).toHaveLength(1);
  });
});
