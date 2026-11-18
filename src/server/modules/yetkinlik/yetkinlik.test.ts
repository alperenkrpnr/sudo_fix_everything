import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

const sertifika = (bitisTarihi?: Date) => ({
  ad: 'OSCP',
  kurum: 'OffSec',
  tarih: new Date('2024-03-01T00:00:00Z'),
  bitisTarihi,
});

describe('Yetkinlik kaydı', () => {
  it('Çalışan kendi Yetkinliğini kaydeder; yöneticisi görür, başka Ekip görmez', async () => {
    await t.services.yetkinlik.ekle(kullanici(F.waf1), sertifika(new Date('2027-03-01T00:00:00Z')));
    await t.services.yetkinlik.ekle(kullanici(F.cti1), { ad: 'GCTI', kurum: 'SANS', tarih: new Date('2025-01-01') });

    const kendi = await t.services.yetkinlik.listele(kullanici(F.waf1));
    expect(kendi.map((y) => [y.kullaniciId, y.ad, y.kurum])).toEqual([[F.waf1, 'OSCP', 'OffSec']]);
    expect((await t.services.yetkinlik.listele(kullanici(F.thCoklu))).map((y) => y.ad)).toEqual(['OSCP']);
    expect((await t.services.yetkinlik.listele(kullanici(F.waf2))).map((y) => y.ad)).toEqual([]);
    expect((await t.services.yetkinlik.listele(kullanici(F.direktor))).map((y) => y.ad).sort()).toEqual(['GCTI', 'OSCP']);
  });

  it('ad ve kurum zorunlu; bitiş tarihi isteğe bağlı ama tarihten önce olamaz', async () => {
    await expect(t.services.yetkinlik.ekle(kullanici(F.waf1), { ...sertifika(), ad: ' ' })).rejects.toMatchObject({
      kod: 'DOGRULAMA',
    });
    await expect(
      t.services.yetkinlik.ekle(kullanici(F.waf1), sertifika(new Date('2023-01-01T00:00:00Z'))),
    ).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    const y = await t.services.yetkinlik.ekle(kullanici(F.waf1), sertifika());
    expect(y.bitisTarihi).toBeNull();
  });

  it('bitişi 30 gün içinde olan sertifika için sahibine bir kez hatırlatma gider', async () => {
    // TEST_NOW = 2026-03-02
    await t.services.yetkinlik.ekle(kullanici(F.waf1), sertifika(new Date('2026-03-20T00:00:00Z')));
    await t.services.yetkinlik.ekle(kullanici(F.waf2), sertifika(new Date('2026-09-01T00:00:00Z')));
    await t.services.yetkinlik.ekle(kullanici(F.soc1), sertifika());

    expect(await t.services.yetkinlik.yaklasanBitisleriBildir()).toBe(1);
    expect(await t.services.yetkinlik.yaklasanBitisleriBildir()).toBe(0);

    expect((await t.services.bildirim.listele(kullanici(F.waf1))).map((b) => b.tur)).toEqual(['YETKINLIK_BITIS']);
    expect(await t.services.bildirim.listele(kullanici(F.waf2))).toEqual([]);
  });
});
