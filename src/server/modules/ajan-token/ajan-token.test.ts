// Seam tests: agent tokens (ticket 13). The token resolves to an agent Actor that runs
// through the same service layer as its user, read-only unless the 'yazma' scope is granted.
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { DEMO_AJAN_TOKENLARI, seedAjanTokenDemo } from '../../seed/ajan-token-demo';

const t = useTestDb();

async function tokenAl(userId: string, kapsamlar?: ('okuma' | 'yazma')[]) {
  const { token } = await t.services.ajanToken.olustur(kullanici(userId), { ad: 'test', kapsamlar });
  const actor = await t.services.ajanToken.tokenCoz(token);
  if (!actor) throw new Error('token çözülemedi');
  return actor;
}

describe('ajan token', () => {
  it('varsayılan token salt okunurdur: okur ama yazamaz', async () => {
    const ajan = await tokenAl(F.waf1);
    expect(ajan.ajan?.kapsamlar).toEqual(['okuma']);
    await expect(t.services.task.listele(ajan)).resolves.toEqual([]);
    await expect(t.services.task.olustur(ajan, { baslik: 'Ajan' })).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it('yazma kapsamlı token kullanıcı adına yazar; denetim izinde ajan işlemi olarak işaretlenir', async () => {
    const ajan = await tokenAl(F.waf1, ['okuma', 'yazma']);
    const task = await t.services.task.olustur(ajan, { baslik: 'Ajan task' });
    expect(task.requesterId).toBe(F.waf1);
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'task.olustur' });
    expect(kayitlar).toMatchObject([{ kullaniciId: F.waf1, ajan: true, varlikId: task.id }]);
  });

  it('ajan okumaları da denetim izine ajan işlemi olarak yazılır', async () => {
    const ajan = await tokenAl(F.waf1);
    await t.services.task.listele(ajan);
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'task.listele' });
    expect(kayitlar).toMatchObject([{ kullaniciId: F.waf1, ajan: true }]);
  });

  it('ajan kullanıcısının göremediğini göremez', async () => {
    const gizli = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'CTI iç' });
    const ajan = await tokenAl(F.waf1);
    await expect(t.services.task.getir(ajan, gizli.id)).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    expect(await t.services.task.listele(ajan)).toEqual([]);
  });

  it('iptal edilen, bilinmeyen token reddedilir; mock oturum token\'ı ajan token\'ı değildir', async () => {
    const { id, token } = await t.services.ajanToken.olustur(kullanici(F.waf1), { ad: 'geçici' });
    await t.services.ajanToken.iptalEt(kullanici(F.waf1), id);
    await expect(t.services.ajanToken.tokenCoz(token)).rejects.toMatchObject({ kod: 'KIMLIK' });
    await expect(t.services.ajanToken.tokenCoz('ajan:uydurma')).rejects.toMatchObject({ kod: 'KIMLIK' });
    await expect(t.services.ajanToken.tokenCoz(`mock:${F.waf1}`)).resolves.toBeNull();
  });

  it('başkasının token\'ını iptal edemez; ajan token üretemez; liste sırrı göstermez', async () => {
    const { id } = await t.services.ajanToken.olustur(kullanici(F.waf1), { ad: 'benim', kapsamlar: ['okuma', 'yazma'] });
    await expect(t.services.ajanToken.iptalEt(kullanici(F.waf2), id)).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    const ajan = await tokenAl(F.waf1, ['okuma', 'yazma']);
    await expect(t.services.ajanToken.olustur(ajan, { ad: 'x' })).rejects.toMatchObject({ kod: 'YETKI' });
    const liste = await t.services.ajanToken.listele(kullanici(F.waf1));
    expect(liste.find((x) => x.id === id)).toMatchObject({ ad: 'benim', kapsamlar: ['okuma', 'yazma'], iptal: null });
    expect(JSON.stringify(liste)).not.toMatch(/ajan:|hash/i);
  });

  it('dev seed demo token\'ları çözülür', async () => {
    await seedAjanTokenDemo(t.db);
    const okuma = await t.services.ajanToken.tokenCoz(DEMO_AJAN_TOKENLARI.okuma);
    const yazma = await t.services.ajanToken.tokenCoz(DEMO_AJAN_TOKENLARI.yazma);
    expect(okuma).toMatchObject({ kullaniciId: F.waf1, ajan: { kapsamlar: ['okuma'] } });
    expect(yazma).toMatchObject({ kullaniciId: F.thCoklu, ajan: { kapsamlar: ['okuma', 'yazma'] } });
  });
});
