import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import type { OrgYapisi } from './index';

const t = useTestDb();

function ekip(yapi: OrgYapisi, kod: string) {
  const e = yapi.unitler.flatMap((u) => u.ekipler).find((x) => x.kod === kod);
  if (!e) throw new Error(`Ekip yok: ${kod}`);
  return e;
}
const uyeIdleri = (yapi: OrgYapisi, kod: string) => ekip(yapi, kod).uyeler?.map((k) => k.id).sort() ?? null;
const yapi = (tarih?: Date) => t.services.organizasyon.yapiyiGetir(kullanici(F.direktor), { tarih });
const org = () => t.services.organizasyon;

describe('Team Head kendi Ekibinin üyeliğini yönetir', () => {
  it("Team Head kendi Ekibi'ne Unit Head onayı olmadan üye ekler", async () => {
    await org().uyeEkle(kullanici(F.thCoklu), { ekipId: F.ekipWaf, kullaniciId: F.pentest1 });
    expect(uyeIdleri(await yapi(), 'TEAM-WAF')).toEqual([F.pentest1, F.waf1, F.waf2]);
  });

  it('Team Head yönetmediği Ekibe üye ekleyemez', async () => {
    await expect(
      org().uyeEkle(kullanici(F.thCoklu), { ekipId: F.ekipCti, kullaniciId: F.pentest1 }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it('Team Head üye çıkarır; geçmiş yapıda üye hâlâ görünür', async () => {
    const once = t.now;
    t.now = new Date('2026-03-05T09:00:00Z');
    await org().uyeCikar(kullanici(F.thCoklu), { ekipId: F.ekipWaf, kullaniciId: F.waf2 });
    expect(uyeIdleri(await yapi(), 'TEAM-WAF')).toEqual([F.waf1]);
    expect(uyeIdleri(await yapi(once), 'TEAM-WAF')).toEqual([F.waf1, F.waf2]);
  });

  it("Üst yönetici kuralı: Unit Head, Team Head'li Ekibin üyeliğini de yönetir", async () => {
    await org().uyeEkle(kullanici(F.uhSavunma), { ekipId: F.ekipSoc, kullaniciId: F.pentest1 });
    expect(uyeIdleri(await yapi(), 'TEAM-SOC')).toEqual([F.pentest1, F.soc1, F.soc2]);
    await expect(
      org().uyeEkle(kullanici(F.uhIstihbarat), { ekipId: F.ekipSoc, kullaniciId: F.cti1 }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
  });
});

describe('Direktör yapıyı oluşturur, düzenler ve Çalışan taşır', () => {
  it('Direktör Unit, Ekip ve Çalışan oluşturur, Unit Head atar; hepsi denetim izine yazılır', async () => {
    const d = kullanici(F.direktor);
    const unit = await org().unitOlustur(d, { kod: 'UNIT-ARGE', ad: 'Ar-Ge' });
    const yeniEkip = await org().ekipOlustur(d, { unitId: unit.id, kod: 'TEAM-ML', ad: 'Makine Öğrenmesi' });
    const k = await org().kullaniciOlustur(d, { ad: 'Nur Ak', eposta: 'nur@siber.example', unvan: 'ML Mühendisi' });
    await org().unitHeadAta(d, { unitId: unit.id, kullaniciId: F.cti2 });
    await org().uyeEkle(d, { ekipId: yeniEkip.id, kullaniciId: k.id });
    await org().ekipDuzenle(d, { ekipId: yeniEkip.id, ad: 'Yapay Zekâ' });

    const y = await yapi();
    const arge = y.unitler.find((u) => u.kod === 'UNIT-ARGE')!;
    expect(arge.unitHead.map((x) => x.id)).toEqual([F.cti2]);
    expect(uyeIdleri(y, 'TEAM-ML')).toEqual([k.id]);
    expect(ekip(y, 'TEAM-ML').ad).toBe('Yapay Zekâ');
    expect(ekip(y, 'TEAM-ML').sorumluYonetici.map((x) => x.id)).toEqual([F.cti2]);

    const islemler = (await t.services.denetim.listele(d)).map((r) => r.islem);
    expect(islemler).toEqual(
      expect.arrayContaining([
        'organizasyon.unitOlustur',
        'organizasyon.ekipOlustur',
        'organizasyon.kullaniciOlustur',
        'organizasyon.unitHeadAta',
        'organizasyon.uyeEkle',
      ]),
    );
  });

  it('Direktör Çalışanı başka Unit’teki Ekibe taşır; eski üyelik geçmişte kalır', async () => {
    const once = t.now;
    t.now = new Date('2026-03-05T09:00:00Z');
    await org().calisanTasi(kullanici(F.direktor), { kullaniciId: F.waf2, eskiEkipId: F.ekipWaf, yeniEkipId: F.ekipCti });
    const simdi = await yapi();
    expect(uyeIdleri(simdi, 'TEAM-WAF')).toEqual([F.waf1]);
    expect(uyeIdleri(simdi, 'TEAM-CTI')).toEqual([F.cti1, F.cti2, F.waf2]);
    expect(uyeIdleri(await yapi(once), 'TEAM-WAF')).toEqual([F.waf1, F.waf2]);
  });

  it('Direktör olmayan yapı oluşturamaz; Team Head kapsamı dışına Çalışan taşıyamaz', async () => {
    await expect(org().unitOlustur(kullanici(F.uhSavunma), { kod: 'X', ad: 'X' })).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(
      org().ekipOlustur(kullanici(F.waf1), { unitId: F.unitSavunma, kod: 'X', ad: 'X' }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(
      org().calisanTasi(kullanici(F.thCoklu), { kullaniciId: F.waf2, eskiEkipId: F.ekipWaf, yeniEkipId: F.ekipCti }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
  });
});

describe('Çalışan yalnızca kendi profilini düzenler', () => {
  it('Çalışan adını ve unvanını günceller; rolü değişmez ve kendine rol atayamaz', async () => {
    const ben = await org().profilGuncelle(kullanici(F.waf1), { ad: 'Fatma Ç.', unvan: 'Kıdemli WAF Uzmanı', roller: ['DIREKTOR'] } as never);
    expect(ben).toMatchObject({ id: F.waf1, ad: 'Fatma Ç.', unvan: 'Kıdemli WAF Uzmanı', roller: ['CALISAN'] });
    await expect(
      org().teamHeadAta(kullanici(F.waf1), { ekipId: F.ekipWaf, kullaniciId: F.waf1 }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(
      org().unitHeadAta(kullanici(F.waf1), { unitId: F.unitSavunma, kullaniciId: F.waf1 }),
    ).rejects.toMatchObject({ kod: 'YETKI' });
  });
});

describe("Unit Head kendi Unit'inde Team Head atar", () => {
  it("Team Head'siz Ekibe Team Head atanınca Sorumlu yönetici o olur; kaldırılınca Unit Head'e döner", async () => {
    expect(ekip(await yapi(), 'TEAM-PENTEST').sorumluYonetici.map((k) => k.id)).toEqual([F.uhSavunma]);

    await org().teamHeadAta(kullanici(F.uhSavunma), { ekipId: F.ekipPentest, kullaniciId: F.pentest1 });
    expect(ekip(await yapi(), 'TEAM-PENTEST').sorumluYonetici.map((k) => k.id)).toEqual([F.pentest1]);
    expect((await org().ben(kullanici(F.pentest1))).roller).toContain('TEAM_HEAD');

    t.now = new Date('2026-03-05T09:00:00Z');
    await org().teamHeadKaldir(kullanici(F.uhSavunma), { ekipId: F.ekipPentest, kullaniciId: F.pentest1 });
    expect(ekip(await yapi(), 'TEAM-PENTEST').sorumluYonetici.map((k) => k.id)).toEqual([F.uhSavunma]);
  });

  it("başka Unit'in Unit Head'i ve Team Head, Team Head atayamaz", async () => {
    const g = { ekipId: F.ekipPentest, kullaniciId: F.pentest1 };
    await expect(org().teamHeadAta(kullanici(F.uhIstihbarat), g)).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(org().teamHeadAta(kullanici(F.thCoklu), g)).rejects.toMatchObject({ kod: 'YETKI' });
  });
});
