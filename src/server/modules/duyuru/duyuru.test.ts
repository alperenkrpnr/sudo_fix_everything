import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

const bildirimTurleri = async (id: string) => (await t.services.bildirim.listele(kullanici(id))).map((b) => b.tur);

describe('Duyuru hedef kitlesi Ekip, Unit veya Direktörlük', () => {
  it('Team Head Ekip duyurusu yayınlar; yalnızca o Ekip görür ve bildirim alır', async () => {
    await t.services.duyuru.yayinla(kullanici(F.thCoklu), {
      baslik: 'WAF kural güncellemesi',
      metin: 'Cuma bakım var',
      hedefTuru: 'EKIP',
      hedefId: F.ekipWaf,
    });
    expect(await bildirimTurleri(F.waf1)).toEqual(['DUYURU']);
    expect(await bildirimTurleri(F.soc1)).toEqual([]);
    expect(await bildirimTurleri(F.thCoklu)).toEqual([]);
    expect((await t.services.duyuru.listele(kullanici(F.waf2))).map((d) => d.baslik)).toEqual(['WAF kural güncellemesi']);
    expect(await t.services.duyuru.listele(kullanici(F.soc1))).toEqual([]);
    expect(await t.services.duyuru.listele(kullanici(F.uhSavunma))).toHaveLength(1);
  });

  it('Unit Head Unit duyurusu yayınlar; Unit içindeki herkes alır, diğer Unit almaz', async () => {
    await t.services.duyuru.yayinla(kullanici(F.uhSavunma), {
      baslik: 'Savunma toplantısı',
      metin: '...',
      hedefTuru: 'UNIT',
      hedefId: F.unitSavunma,
    });
    for (const id of [F.waf1, F.soc2, F.pentest1, F.thCoklu]) expect(await bildirimTurleri(id)).toEqual(['DUYURU']);
    expect(await bildirimTurleri(F.cti1)).toEqual([]);
  });

  it('Direktörlük duyurusunu herkes alır', async () => {
    await t.services.duyuru.yayinla(kullanici(F.direktor), {
      baslik: 'Yılsonu',
      metin: '...',
      hedefTuru: 'DIREKTORLUK',
      hedefId: F.direktorluk,
    });
    for (const id of [F.osint1, F.uhIstihbarat, F.waf2]) expect(await bildirimTurleri(id)).toEqual(['DUYURU']);
  });

  it('kapsam dışındaki hedefe yayın yapılamaz', async () => {
    const yayinla = (actor: string, hedefTuru: 'EKIP' | 'UNIT' | 'DIREKTORLUK', hedefId: string) =>
      t.services.duyuru.yayinla(kullanici(actor), { baslik: 'x', metin: 'y', hedefTuru, hedefId });
    await expect(yayinla(F.thCoklu, 'UNIT', F.unitSavunma)).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(yayinla(F.thCoklu, 'EKIP', F.ekipCti)).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(yayinla(F.uhSavunma, 'DIREKTORLUK', F.direktorluk)).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(yayinla(F.waf1, 'EKIP', F.ekipWaf)).rejects.toMatchObject({ kod: 'YETKI' });
  });
});
