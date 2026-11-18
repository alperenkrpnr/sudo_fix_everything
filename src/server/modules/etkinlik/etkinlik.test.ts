import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

const toplanti = {
  baslik: 'Aylık iletişim toplantısı',
  baslangic: new Date('2026-03-10T10:00:00Z'),
};

describe('İç etkinlik: davet ve katılım yanıtı', () => {
  it('Team Head Ekibini davet eder; davetliler bekleyen davet ve bildirim alır, onay gerekmez', async () => {
    const e = await t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), { ...toplanti, ekipIds: [F.ekipWaf] });
    expect(e.tip).toBe('IC');

    const bekleyen = await t.services.etkinlik.bekleyenDavetler(kullanici(F.waf1));
    expect(bekleyen.map((d) => d.etkinlik.baslik)).toEqual(['Aylık iletişim toplantısı']);
    expect(await t.services.etkinlik.bekleyenDavetler(kullanici(F.soc1))).toEqual([]);

    const bildirimler = await t.services.bildirim.listele(kullanici(F.waf2));
    expect(bildirimler.map((b) => b.tur)).toEqual(['ETKINLIK_DAVETI']);
    expect(await t.services.bildirim.listele(kullanici(F.soc1))).toEqual([]);
  });

  it('Çalışan iç etkinlik oluşturamaz', async () => {
    await expect(
      t.services.etkinlik.icEtkinlikOlustur(kullanici(F.waf1), { ...toplanti, ekipIds: [F.ekipWaf] }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it('Team Head yönetmediği Ekibi davet edemez', async () => {
    await expect(
      t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), { ...toplanti, ekipIds: [F.ekipCti] }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it('davetli katılıyorum der; davet bekleyenden düşer ve düzenleyen yanıtı görür', async () => {
    const e = await t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), {
      ...toplanti,
      davetliIds: [F.waf1, F.soc1],
    });
    await t.services.etkinlik.yanitla(kullanici(F.waf1), e.id, 'KATILIYORUM');
    await t.services.etkinlik.yanitla(kullanici(F.soc1), e.id, 'KATILMIYORUM');

    expect(await t.services.etkinlik.bekleyenDavetler(kullanici(F.waf1))).toEqual([]);
    const [gorulen] = await t.services.etkinlik.listele(kullanici(F.thCoklu));
    expect(Object.fromEntries(gorulen.davetler.map((d) => [d.kullaniciId, d.yanit]))).toEqual({
      [F.waf1]: 'KATILIYORUM',
      [F.soc1]: 'KATILMIYORUM',
    });
  });

  it('davetli olmayan yanıt veremez', async () => {
    const e = await t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), { ...toplanti, davetliIds: [F.waf1] });
    await expect(t.services.etkinlik.yanitla(kullanici(F.cti1), e.id, 'KATILIYORUM')).rejects.toMatchObject({
      kod: 'BULUNAMADI',
    });
  });

  it('yönetici kendi Ekibinin etkinlik geçmişini görür; başka Ekipteki Çalışan görmez', async () => {
    await t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), { ...toplanti, ekipIds: [F.ekipSoc] });
    expect(await t.services.etkinlik.listele(kullanici(F.uhSavunma))).toHaveLength(1);
    expect(await t.services.etkinlik.listele(kullanici(F.soc2))).toHaveLength(1);
    expect(await t.services.etkinlik.listele(kullanici(F.cti1))).toHaveLength(0);
    expect(await t.services.etkinlik.listele(kullanici(F.uhIstihbarat))).toHaveLength(0);
  });
});

describe('Bildirim', () => {
  it('kullanıcı kendi bildirimini okundu işaretler; başkasınınkini işaretleyemez', async () => {
    await t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), { ...toplanti, davetliIds: [F.waf1] });
    const [b] = await t.services.bildirim.listele(kullanici(F.waf1));
    expect(b.okundu).toBeNull();
    await expect(t.services.bildirim.okunduIsaretle(kullanici(F.waf2), b.id)).rejects.toMatchObject({
      kod: 'BULUNAMADI',
    });
    await t.services.bildirim.okunduIsaretle(kullanici(F.waf1), b.id);
    const [sonra] = await t.services.bildirim.listele(kullanici(F.waf1));
    expect(sonra.okundu).toEqual(t.now);
  });
});
