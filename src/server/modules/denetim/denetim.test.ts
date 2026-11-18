import { describe, expect, it } from 'vitest';
import { TEST_NOW, useTestDb } from '../../../../test/harness';
import { ajan, kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

describe('Denetim izi', () => {
  it('giriş işlemi kullanıcı ve zamanla denetim izine yazılır', async () => {
    await t.services.oturum.girisYap(F.waf1);
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'oturum.ac' });
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]).toMatchObject({ kullaniciId: F.waf1, ajan: false, zaman: TEST_NOW, varlikId: F.waf1 });
  });

  it('ajan işlemi ayrıca işaretlenir', async () => {
    await t.services.organizasyon.yapiyiGetir(ajan(F.waf1));
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'organizasyon.yapiyiGetir' });
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]).toMatchObject({ kullaniciId: F.waf1, ajan: true });
  });

  it('ajan kullanıcının göremediğini göremez', async () => {
    const insan = await t.services.organizasyon.yapiyiGetir(kullanici(F.waf1));
    const ajanGorunumu = await t.services.organizasyon.yapiyiGetir(ajan(F.waf1));
    expect(ajanGorunumu).toEqual(insan);
  });

  it('salt okunur ajan token ile yazma işlemi reddedilir', async () => {
    // Yazma işlemini yetki katmanının yaz() kapısından geçiren herhangi bir servis yeterli.
    const { yaz } = await import('../yetki');
    const yazma = yaz(t.services.ctx, ajan(F.waf1), 'test.yazma', async () => ({ sonuc: 1 }));
    await expect(yazma).rejects.toMatchObject({ kod: 'YETKI' });
    const yazabilen = await yaz(t.services.ctx, ajan(F.waf1, { kapsamlar: ['okuma', 'yazma'] }), 'test.yazma', async () => ({
      sonuc: 1,
    }));
    expect(yazabilen).toBe(1);
  });

  it('denetim kaydı silinemez ve değiştirilemez, yalnızca arşivlenebilir', async () => {
    await t.services.oturum.girisYap(F.waf1);
    await expect(t.db.denetimKaydi.deleteMany({})).rejects.toThrow(/yalnizca eklenir/);
    await expect(t.db.denetimKaydi.updateMany({ data: { islem: 'sahte' } })).rejects.toThrow(/yalnizca eklenir/);
    await t.db.denetimKaydi.updateMany({ data: { arsivlendi: TEST_NOW } });
    expect(await t.services.denetim.listele(kullanici(F.direktor), { islem: 'oturum.ac' })).toHaveLength(0);
    expect(await t.db.denetimKaydi.count()).toBe(1);
  });

  it('saklama süresi yapılandırılabilir, varsayılan 5 yıl', () => {
    expect(t.services.ctx.config.denetimSaklamaYil).toBe(5);
  });

  it('Direktör dışındaki kullanıcı denetim izini listeleyemez', async () => {
    await expect(t.services.denetim.listele(kullanici(F.uhSavunma))).rejects.toMatchObject({ kod: 'YETKI' });
  });
});
