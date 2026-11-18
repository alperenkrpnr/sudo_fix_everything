import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import type { OrgYapisi } from './index';

const t = useTestDb();

/** ekip kodu -> görünen üye id'leri (null = üyeler görünmüyor) */
function uyeHaritasi(yapi: OrgYapisi): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {};
  for (const u of yapi.unitler)
    for (const e of u.ekipler) out[e.kod] = e.uyeler ? e.uyeler.map((k) => k.id).sort() : null;
  return out;
}

describe('Organizasyon yapısı rol yetkisine göre görüntülenir', () => {
  it('Direktör tüm Unit, Ekip ve Çalışanları görür', async () => {
    const yapi = await t.services.organizasyon.yapiyiGetir(kullanici(F.direktor));
    expect(uyeHaritasi(yapi)).toEqual({
      'TEAM-WAF': [F.waf1, F.waf2],
      'TEAM-SOC': [F.soc1, F.soc2],
      'TEAM-PENTEST': [F.pentest1],
      'TEAM-CTI': [F.cti1, F.cti2],
      'TEAM-OSINT': [F.osint1],
    });
  });

  it('Çalışan iskeleti görür ama yalnızca kendi Ekibinin üyelerini görür', async () => {
    const yapi = await t.services.organizasyon.yapiyiGetir(kullanici(F.waf1));
    expect(uyeHaritasi(yapi)).toEqual({
      'TEAM-WAF': [F.waf1, F.waf2],
      'TEAM-SOC': null,
      'TEAM-PENTEST': null,
      'TEAM-CTI': null,
      'TEAM-OSINT': null,
    });
  });

  it('çok Ekipli Team Head yönettiği iki Ekibin üyelerini görür, diğerlerini görmez', async () => {
    const yapi = await t.services.organizasyon.yapiyiGetir(kullanici(F.thCoklu));
    expect(uyeHaritasi(yapi)).toEqual({
      'TEAM-WAF': [F.waf1, F.waf2],
      'TEAM-SOC': [F.soc1, F.soc2],
      'TEAM-PENTEST': null,
      'TEAM-CTI': null,
      'TEAM-OSINT': null,
    });
  });

  it("Unit Head kendi Unit'inin tüm Ekiplerini (Team Head'siz dahil) görür ve yönetebilir", async () => {
    const yapi = await t.services.organizasyon.yapiyiGetir(kullanici(F.uhSavunma));
    expect(uyeHaritasi(yapi)).toEqual({
      'TEAM-WAF': [F.waf1, F.waf2],
      'TEAM-SOC': [F.soc1, F.soc2],
      'TEAM-PENTEST': [F.pentest1],
      'TEAM-CTI': null,
      'TEAM-OSINT': null,
    });
    const yonetilen = yapi.unitler.flatMap((u) => u.ekipler.filter((e) => e.yonetebilir).map((e) => e.kod));
    expect(yonetilen.sort()).toEqual(['TEAM-PENTEST', 'TEAM-SOC', 'TEAM-WAF']);
  });

  it("Team Head'siz Ekibin Sorumlu yöneticisi Unit Head'dir", async () => {
    const yapi = await t.services.organizasyon.yapiyiGetir(kullanici(F.osint1));
    const ekipler = Object.fromEntries(yapi.unitler.flatMap((u) => u.ekipler).map((e) => [e.kod, e]));
    expect(ekipler['TEAM-OSINT'].sorumluYonetici.map((k) => k.id)).toEqual([F.uhIstihbarat]);
    expect(ekipler['TEAM-CTI'].sorumluYonetici.map((k) => k.id)).toEqual([F.thCti]);
  });

  it('üyelik tarih aralıklıdır: taşınan Çalışan geçmiş tarihte eski Ekibinde görünür', async () => {
    const tasima = new Date('2026-02-01T00:00:00Z');
    await t.db.uyelik.updateMany({ where: { kullaniciId: F.waf2, ekipId: F.ekipWaf }, data: { gecerliBitis: tasima } });
    await t.db.uyelik.create({ data: { kullaniciId: F.waf2, ekipId: F.ekipSoc, gecerliBaslangic: tasima } });

    const simdi = uyeHaritasi(await t.services.organizasyon.yapiyiGetir(kullanici(F.direktor)));
    expect(simdi['TEAM-WAF']).toEqual([F.waf1]);
    expect(simdi['TEAM-SOC']).toEqual([F.soc1, F.soc2, F.waf2]);

    const gecmis = uyeHaritasi(
      await t.services.organizasyon.yapiyiGetir(kullanici(F.direktor), { tarih: new Date('2026-01-15T00:00:00Z') }),
    );
    expect(gecmis['TEAM-WAF']).toEqual([F.waf1, F.waf2]);
    expect(gecmis['TEAM-SOC']).toEqual([F.soc1, F.soc2]);
  });
});

describe('Mock kullanıcı girişi', () => {
  it('giriş ekranı Direktör, Unit Head, Team Head ve Çalışan rollerini ayrıştırır', async () => {
    const liste = await t.services.organizasyon.mockKullanicilar();
    const rol = Object.fromEntries(liste.map((k) => [k.id, k.roller]));
    expect(rol[F.direktor]).toEqual(['DIREKTOR']);
    expect(rol[F.uhSavunma]).toEqual(['UNIT_HEAD']);
    expect(rol[F.thCoklu]).toEqual(['TEAM_HEAD']);
    expect(rol[F.waf1]).toEqual(['CALISAN']);
    expect(liste[0].id).toBe(F.direktor);
  });

  it('giriş yapan kullanıcı token ile kendi profilini ve rolünü görür', async () => {
    const { token } = await t.services.oturum.girisYap(F.thCoklu);
    const ben = await t.services.organizasyon.ben(t.services.oturum.tokenCoz(token));
    expect(ben).toMatchObject({ id: F.thCoklu, roller: ['TEAM_HEAD'] });
  });

  it('bilinmeyen kullanıcı ile giriş reddedilir', async () => {
    await expect(t.services.oturum.girisYap('u-yok')).rejects.toMatchObject({ kod: 'KIMLIK' });
  });
});
