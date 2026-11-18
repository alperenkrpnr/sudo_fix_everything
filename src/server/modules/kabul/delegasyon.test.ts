import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedDelegasyonDemo } from '../../seed/delegasyon-demo';

const t = useTestDb();

async function ekibeAta(requester: string, ekipId: string, baslik = 'Ekip işi') {
  return t.services.task.olustur(kullanici(requester), { baslik, assigneeEkipId: ekipId });
}

async function kutu(kim: string, filtre?: { ekipId?: string }) {
  const k = await t.services.kabul.ekipGelenKutusu(kullanici(kim), filtre);
  return k.kayitlar.map((x) => `${x.tur}:${x.ekipKod}:${x.task.baslik}`);
}

describe('Ekibe atama', () => {
  it('Ekibe atanan Task Sorumlu yöneticiye düşer (Team Head, yoksa Unit Head)', async () => {
    await ekibeAta(F.waf1, F.ekipCti, 'CTI işi');
    await ekibeAta(F.waf1, F.ekipOsint, 'OSINT işi');
    expect(await kutu(F.thCti)).toEqual(['KABUL:TEAM-CTI:CTI işi']);
    expect(await kutu(F.uhIstihbarat)).toEqual(['KABUL:TEAM-OSINT:OSINT işi']);
    expect(await kutu(F.cti1)).toEqual([]);
  });

  it("Direktör'ün Ekip'e ataması kabul adımı olmadan direkt Ekip havuzuna düşer", async () => {
    const task = await ekibeAta(F.direktor, F.ekipCti, 'Direktör işi');
    expect(task.durum).toBe('KABUL_EDILDI');
    expect(await kutu(F.thCti)).toEqual(['HAVUZ:TEAM-CTI:Direktör işi']);
    await t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.cti2);
    expect(await kutu(F.thCti)).toEqual(['DELEGASYON_BEKLIYOR:TEAM-CTI:Direktör işi']);
  });

  it('çok Ekipli yönetici tek birleşik gelen kutusunda Ekip etiketi ve filtresi görür', async () => {
    t.now = new Date('2026-03-02T09:00:00Z');
    await ekibeAta(F.cti1, F.ekipWaf, 'WAF işi');
    t.now = new Date('2026-03-02T10:00:00Z');
    await ekibeAta(F.cti1, F.ekipSoc, 'SOC işi');

    const k = await t.services.kabul.ekipGelenKutusu(kullanici(F.thCoklu));
    expect(k.ekipler.map((e) => e.kod)).toEqual(['TEAM-SOC', 'TEAM-WAF']);
    expect(await kutu(F.thCoklu)).toEqual(['KABUL:TEAM-WAF:WAF işi', 'KABUL:TEAM-SOC:SOC işi']);
    expect(await kutu(F.thCoklu, { ekipId: F.ekipSoc })).toEqual(['KABUL:TEAM-SOC:SOC işi']);
    await expect(t.services.kabul.ekipGelenKutusu(kullanici(F.thCoklu), { ekipId: F.ekipCti })).rejects.toMatchObject({ kod: 'YETKI' });
  });
});

describe('Delegasyon', () => {
  async function havuzdaTask() {
    const task = await ekibeAta(F.waf1, F.ekipCti, 'CTI işi');
    await t.services.kabul.kabulEt(kullanici(F.thCti), task.id);
    return task;
  }

  it("Sorumlu yönetici kabul edince Task Ekip havuzuna girer, Ekip içi Çalışan'a delege eder, Çalışan kabul edince Assignee olur", async () => {
    const task = await havuzdaTask();
    expect(await kutu(F.thCti)).toEqual(['HAVUZ:TEAM-CTI:CTI işi']);

    await t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.cti1);
    expect(await kutu(F.thCti)).toEqual(['DELEGASYON_BEKLIYOR:TEAM-CTI:CTI işi']);
    expect((await t.services.kabul.bekleyenDelegasyonlar(kullanici(F.cti1))).map((d) => d.task.id)).toEqual([task.id]);

    const kabul = await t.services.kabul.delegasyonKabulEt(kullanici(F.cti1), task.id);
    expect(kabul).toMatchObject({ assigneeKullaniciId: F.cti1, assigneeEkipId: null, ekipId: F.ekipCti, durum: 'KABUL_EDILDI' });
    expect(await kutu(F.thCti)).toEqual([]);
    expect(await t.services.kabul.bekleyenDelegasyonlar(kullanici(F.cti1))).toEqual([]);
  });

  it("yalnızca Ekip'i yöneten delege eder, yalnızca Ekip üyesine, yalnızca havuzdaki Task", async () => {
    const task = await havuzdaTask();
    await expect(t.services.kabul.delegeEt(kullanici(F.cti2), task.id, F.cti1)).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.waf2)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    const bekleyen = await ekibeAta(F.waf1, F.ekipCti, 'Kabul bekleyen');
    await expect(t.services.kabul.delegeEt(kullanici(F.thCti), bekleyen.id, F.cti1)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    // Üst yönetici (Unit Head) de delege edebilir; delege edilmeyen Çalışan yanıt veremez
    await t.services.kabul.delegeEt(kullanici(F.uhIstihbarat), task.id, F.cti2);
    await expect(t.services.kabul.delegasyonKabulEt(kullanici(F.cti1), task.id)).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it("delegasyon sonrası Çalışan reddi Task'ı Reddedildi yapmaz, Ekip havuzuna döndürür; Sorumlu yönetici başka Çalışan seçer", async () => {
    const task = await havuzdaTask();
    await t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.cti1);
    await expect(t.services.kabul.delegasyonReddet(kullanici(F.cti1), task.id, ' ')).rejects.toMatchObject({ kod: 'DOGRULAMA' });

    t.now = new Date('2026-03-02T12:00:00Z');
    const ret = await t.services.kabul.delegasyonReddet(kullanici(F.cti1), task.id, 'İzindeyim');
    expect(ret).toMatchObject({ durum: 'KABUL_EDILDI', assigneeEkipId: F.ekipCti, assigneeKullaniciId: null });
    const k = await t.services.kabul.ekipGelenKutusu(kullanici(F.thCti));
    expect(k.kayitlar.map((x) => [x.tur, x.beklemeBaslangici.toISOString()])).toEqual([['HAVUZ', '2026-03-02T12:00:00.000Z']]);
    const bildirimler = await t.services.bildirim.listele(kullanici(F.thCti));
    expect(bildirimler.filter((b) => b.varlikId === task.id).map((b) => b.tur)).toContain('TASK_HAVUZA_DONUS');

    await t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.cti2);
    expect((await t.services.kabul.delegasyonKabulEt(kullanici(F.cti2), task.id)).assigneeKullaniciId).toBe(F.cti2);
  });

  it('Bekleyen işlerim: Çalışan delegasyonu, Sorumlu yönetici Ekip havuzunu görür', async () => {
    const task = await havuzdaTask();
    const bekleyen = async (kim: string) => (await t.services.bekleyen.listele(kullanici(kim))).map((b) => `${b.tur}:${b.neden}`);
    expect(await bekleyen(F.thCti)).toEqual(['EKIP_HAVUZU:Delege et: TEAM-CTI']);
    await t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.cti1);
    expect(await bekleyen(F.thCti)).toEqual([]);
    expect(await bekleyen(F.cti1)).toEqual(['DELEGASYON:Delegasyon: TEAM-CTI']);
  });

  it('dev demo verisi geçerli: çok Ekipli gelen kutusu ve bekleyen delegasyon', async () => {
    await seedDelegasyonDemo(t.services);
    expect(await kutu(F.thCoklu)).toEqual(
      expect.arrayContaining([
        'HAVUZ:TEAM-WAF:WAF kural seti yıllık gözden geçirme',
        'KABUL:TEAM-WAF:WAF: yeni IOC listesi için engelleme kuralı',
        'DELEGASYON_BEKLIYOR:TEAM-SOC:SOC: phishing kampanyası log analizi',
      ]),
    );
    expect(await kutu(F.uhSavunma)).toEqual(['HAVUZ:TEAM-PENTEST:Pentest: yeni WAF önündeki uygulama']);
    expect((await t.services.kabul.bekleyenDelegasyonlar(kullanici(F.soc1))).length).toBe(1);
  });

  it('delegasyon ve havuza dönüş denetim izine yazılır', async () => {
    const task = await havuzdaTask();
    await t.services.kabul.delegeEt(kullanici(F.thCti), task.id, F.cti1);
    await t.services.kabul.delegasyonReddet(kullanici(F.cti1), task.id, 'Yoğunum');
    const izler = await t.services.denetim.listele(kullanici(F.direktor), { varlikId: task.id });
    const ozet = izler.map((d) => [d.islem, d.kullaniciId]);
    expect(ozet).toContainEqual(['kabul.delegeEt', F.thCti]);
    expect(ozet).toContainEqual(['kabul.delegasyonReddet', F.cti1]);
    const ret = izler.find((d) => d.islem === 'kabul.delegasyonReddet')!;
    expect(ret.veri).toMatchObject({ calisanId: F.cti1, ekipId: F.ekipCti, gerekce: 'Yoğunum', havuzaDondu: true });
  });
});
