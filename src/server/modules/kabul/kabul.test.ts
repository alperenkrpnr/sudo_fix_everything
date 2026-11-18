import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedKabulDemo } from '../../seed/kabul-demo';
import { seedTaskDemo } from '../../seed/task-demo';

const t = useTestDb();

type Hedef = { assigneeKullaniciId: string } | { assigneeEkipId: string };

async function ata(requester: string, hedef: Hedef) {
  return t.services.task.olustur(kullanici(requester), { baslik: 'İş', ...hedef });
}

/** Zincirin kısa gösterimi: DIREKT:<neden> veya adım başına "<tur>:<onaylayıcılar>". */
async function zincirOzeti(requester: string, taskId: string): Promise<string[]> {
  const z = await t.services.kabul.zincir(kullanici(requester), taskId);
  return z.adimlar.map((a) => (a.tur === 'DIREKT' ? `DIREKT:${a.not}` : `${a.tur}:${a.onaylayicilar.join(',')}`));
}

async function bildirimTurleri(kullaniciId: string, taskId: string): Promise<string[]> {
  const bs = await t.services.bildirim.listele(kullanici(kullaniciId));
  return bs.filter((b) => b.varlikId === taskId).map((b) => b.tur);
}

describe('Kabul zinciri kuralları (her Requester→Assignee satırı)', () => {
  it.each([
    ['Self-assign', F.waf1, { assigneeKullaniciId: F.waf1 }, ['DIREKT:SELF_ASSIGN']],
    ['Team Head → kendi Çalışanı', F.thCoklu, { assigneeKullaniciId: F.soc1 }, ['DIREKT:REQUESTER_VE_ONAYLAYICI']],
    ["Team Head'siz Ekip: Unit Head → Çalışanı (çifte rol)", F.uhSavunma, { assigneeKullaniciId: F.pentest1 }, ['DIREKT:REQUESTER_VE_ONAYLAYICI']],
    ["Unit Head → kendi Unit'i", F.uhSavunma, { assigneeKullaniciId: F.soc1 }, ['DIREKT:UST_YONETICI']],
    ['Direktör → herkes', F.direktor, { assigneeKullaniciId: F.osint1 }, ['DIREKT:UST_YONETICI']],
    ['Sorumlu yönetici → kendi Ekibi', F.thCoklu, { assigneeEkipId: F.ekipSoc }, ['DIREKT:REQUESTER_VE_ONAYLAYICI']],
    ["Unit Head → Team Head'siz Ekibi", F.uhSavunma, { assigneeEkipId: F.ekipPentest }, ['DIREKT:REQUESTER_VE_ONAYLAYICI']],
    ['Çalışan → aynı Ekipten Çalışan', F.waf1, { assigneeKullaniciId: F.waf2 }, [`ASSIGNEE:${F.waf2}`]],
    ['Çalışan → aynı Unit, başka Ekip Çalışanı', F.waf1, { assigneeKullaniciId: F.soc1 }, [`ASSIGNEE:${F.soc1}`, `SORUMLU:${F.thCoklu}`]],
    ["Çalışan → Team Head'siz Ekip Çalışanı", F.waf1, { assigneeKullaniciId: F.pentest1 }, [`ASSIGNEE:${F.pentest1}`, `SORUMLU:${F.uhSavunma}`]],
    ['Çalışan → başka Unit Çalışanı', F.waf1, { assigneeKullaniciId: F.cti1 }, [`ASSIGNEE:${F.cti1}`, `SORUMLU:${F.thCti}`]],
    ["Çalışan → başka Unit'te Team Head'siz Ekip Çalışanı", F.waf1, { assigneeKullaniciId: F.osint1 }, [`ASSIGNEE:${F.osint1}`, `SORUMLU:${F.uhIstihbarat}`]],
    ['Çalışan → kendi yöneticisi', F.waf1, { assigneeKullaniciId: F.thCoklu }, [`ASSIGNEE:${F.thCoklu}`]],
    ['Yönetici → yönetici', F.thCti, { assigneeKullaniciId: F.thCoklu }, [`ASSIGNEE:${F.thCoklu}`]],
    ['Unit Head → başka Unit Head', F.uhIstihbarat, { assigneeKullaniciId: F.uhSavunma }, [`ASSIGNEE:${F.uhSavunma}`]],
    ['Yönetici → başka yöneticinin Çalışanı', F.thCti, { assigneeKullaniciId: F.waf1 }, [`ASSIGNEE:${F.waf1}`, `SORUMLU:${F.thCoklu}`]],
    ["Unit Head → başka Unit'in Çalışanı", F.uhIstihbarat, { assigneeKullaniciId: F.soc2 }, [`ASSIGNEE:${F.soc2}`, `SORUMLU:${F.thCoklu}`]],
    ['Çalışan → başka Ekip', F.waf1, { assigneeEkipId: F.ekipCti }, [`SORUMLU:${F.thCti}`]],
    ["Çalışan → Team Head'siz Ekip", F.waf1, { assigneeEkipId: F.ekipPentest }, [`SORUMLU:${F.uhSavunma}`]],
  ] as const)('%s', async (_ad, requester, hedef, beklenen) => {
    const task = await ata(requester, hedef);
    expect(await zincirOzeti(requester, task.id)).toEqual(beklenen);
    expect(task.durum).toBe(beklenen[0].startsWith('DIREKT') ? 'KABUL_EDILDI' : 'KABUL_BEKLIYOR');
  });

  it("başka Unit'te karşı Unit Head'e yalnızca bilgi gider, onay gerekmez", async () => {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    expect(await bildirimTurleri(F.uhIstihbarat, task.id)).toEqual(['TASK_BILGI']);
    expect(await bildirimTurleri(F.cti1, task.id)).toEqual(['KABUL_TALEBI']);
    // Aynı Unit'te bilgi gitmez
    const ic = await ata(F.waf1, { assigneeKullaniciId: F.soc1 });
    expect(await bildirimTurleri(F.uhSavunma, ic.id)).toEqual([]);
  });

  it('direkt kabulde Assignee yeni atama bildirimi alır', async () => {
    const task = await ata(F.thCoklu, { assigneeKullaniciId: F.soc1 });
    expect(await bildirimTurleri(F.soc1, task.id)).toEqual(['TASK_ATAMA']);
  });
});

describe('Accept / refuse', () => {
  it('zincir sırayla ilerler: önce Çalışan, sonra Sorumlu yöneticisi; son kabul Task\'ı Kabul Edildi yapar', async () => {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    const bekleyen = async (id: string) => (await t.services.kabul.bekleyenler(kullanici(id))).map((b) => b.task.id);

    expect(await bekleyen(F.cti1)).toEqual([task.id]);
    expect(await bekleyen(F.thCti)).toEqual([]);
    await expect(t.services.kabul.kabulEt(kullanici(F.thCti), task.id)).rejects.toMatchObject({ kod: 'YETKI' });

    t.now = new Date('2026-03-02T11:00:00Z');
    const ara = await t.services.kabul.kabulEt(kullanici(F.cti1), task.id);
    expect(ara.durum).toBe('KABUL_BEKLIYOR');
    expect(await bekleyen(F.cti1)).toEqual([]);
    expect(await bekleyen(F.thCti)).toEqual([task.id]);
    expect(await bildirimTurleri(F.thCti, task.id)).toEqual(['KABUL_TALEBI']);

    t.now = new Date('2026-03-02T15:00:00Z');
    const son = await t.services.kabul.kabulEt(kullanici(F.thCti), task.id);
    expect(son.durum).toBe('KABUL_EDILDI');
    expect(await bekleyen(F.thCti)).toEqual([]);
    expect(await bildirimTurleri(F.waf1, task.id)).toEqual(['TASK_KABUL', 'TASK_KABUL']);

    const z = await t.services.kabul.zincir(kullanici(F.waf1), task.id);
    expect(z.adimlar.map((a) => [a.karar, a.kararVerenId, a.baslangic?.toISOString(), a.kararZamani?.toISOString()])).toEqual([
      ['KABUL', F.cti1, '2026-03-02T09:00:00.000Z', '2026-03-02T11:00:00.000Z'],
      ['KABUL', F.thCti, '2026-03-02T11:00:00.000Z', '2026-03-02T15:00:00.000Z'],
    ]);
  });

  it('ret gerekçesi zorunlu; herhangi bir halka reddederse Task Reddedildi olur, silinmez ve zincir baştan başlamaz', async () => {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    await t.services.kabul.kabulEt(kullanici(F.cti1), task.id);
    await expect(t.services.kabul.reddet(kullanici(F.thCti), task.id, '  ')).rejects.toMatchObject({ kod: 'DOGRULAMA' });

    const r = await t.services.kabul.reddet(kullanici(F.thCti), task.id, 'Ekip kapasitesi dolu');
    expect(r.durum).toBe('REDDEDILDI');
    expect((await t.services.task.getir(kullanici(F.waf1), task.id)).durum).toBe('REDDEDILDI');
    expect(await t.services.kabul.bekleyenler(kullanici(F.cti1))).toEqual([]);
    expect(await t.services.kabul.bekleyenler(kullanici(F.thCti))).toEqual([]);
    expect(await bildirimTurleri(F.waf1, task.id)).toContain('TASK_RET');

    const z = await t.services.kabul.zincir(kullanici(F.waf1), task.id);
    expect(z.adimlar[1]).toMatchObject({
      karar: 'RET',
      kararVerenId: F.thCti,
      kararVerenEkipId: F.ekipCti,
      requesterEkipId: F.ekipWaf,
      gerekce: 'Ekip kapasitesi dolu',
    });
  });

  it('ilk halka reddederse ikinci halkaya hiç sıra gelmez', async () => {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    await t.services.kabul.reddet(kullanici(F.cti1), task.id, 'Yetkinliğim yok');
    expect(await t.services.kabul.bekleyenler(kullanici(F.thCti))).toEqual([]);
    await expect(t.services.kabul.kabulEt(kullanici(F.thCti), task.id)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });

  it('kabul ve ret kararları denetim izine yazılır', async () => {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    await t.services.kabul.kabulEt(kullanici(F.cti1), task.id);
    await t.services.kabul.reddet(kullanici(F.thCti), task.id, 'Öncelik düşük');
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { varlikTuru: 'Task', varlikId: task.id });
    expect(kayitlar.map((k) => [k.islem, k.kullaniciId])).toEqual([
      ['kabul.reddet', F.thCti],
      ['kabul.kabulEt', F.cti1],
      ['task.olustur', F.waf1],
    ]);
    expect(kayitlar[0].veri).toMatchObject({ karar: 'RET', gerekce: 'Öncelik düşük', durum: 'REDDEDILDI' });
  });
});

describe('Reddedilen Task: yeniden atama ve iptal', () => {
  async function reddedilmis() {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    await t.services.kabul.reddet(kullanici(F.cti1), task.id, 'Yoğunum');
    return task;
  }

  it('Requester başka birine yeniden atar (düzenleyerek); yeni zincir başlar, eski karar tarihçede kalır', async () => {
    const task = await reddedilmis();
    const yeni = await t.services.kabul.yenidenAta(kullanici(F.waf1), task.id, {
      assigneeKullaniciId: F.cti2,
      baslik: 'İş (revize)',
    });
    expect(yeni).toMatchObject({ durum: 'KABUL_BEKLIYOR', assigneeKullaniciId: F.cti2, baslik: 'İş (revize)', ekipId: F.ekipCti });
    expect((await t.services.kabul.bekleyenler(kullanici(F.cti2))).map((b) => b.task.id)).toEqual([task.id]);
    const z = await t.services.kabul.zincir(kullanici(F.waf1), task.id);
    expect(z.adimlar.map((a) => [a.deneme, a.karar])).toEqual([
      [1, 'RET'],
      [1, 'BEKLIYOR'],
      [2, 'BEKLIYOR'],
      [2, 'BEKLIYOR'],
    ]);
  });

  it('Requester aynı kişiye yeniden gönderebilir veya iptal edebilir; başkası edemez', async () => {
    const task = await reddedilmis();
    await expect(t.services.kabul.iptalEt(kullanici(F.cti1), task.id)).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(t.services.kabul.yenidenAta(kullanici(F.cti1), task.id, {})).rejects.toMatchObject({ kod: 'YETKI' });
    expect((await t.services.kabul.yenidenAta(kullanici(F.waf1), task.id, {})).durum).toBe('KABUL_BEKLIYOR');
    await t.services.kabul.reddet(kullanici(F.cti1), task.id, 'Hâlâ yoğunum');
    expect((await t.services.kabul.iptalEt(kullanici(F.waf1), task.id)).durum).toBe('IPTAL');
    await expect(t.services.kabul.yenidenAta(kullanici(F.waf1), task.id, {})).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });
});

describe('Organizasyon değişimi', () => {
  it("taşınan Çalışan'ın bekleyen onayı yeni Sorumlu yöneticiye geçer", async () => {
    const task = await ata(F.waf1, { assigneeKullaniciId: F.cti1 });
    await t.services.kabul.kabulEt(kullanici(F.cti1), task.id);
    t.now = new Date('2026-03-03T09:00:00Z');
    await t.services.organizasyon.calisanTasi(kullanici(F.uhIstihbarat), {
      kullaniciId: F.cti1,
      eskiEkipId: F.ekipCti,
      yeniEkipId: F.ekipOsint,
    });
    expect(await t.services.kabul.bekleyenler(kullanici(F.thCti))).toEqual([]);
    expect((await t.services.kabul.bekleyenler(kullanici(F.uhIstihbarat))).map((b) => b.task.id)).toEqual([task.id]);
    expect((await t.services.kabul.kabulEt(kullanici(F.uhIstihbarat), task.id)).durum).toBe('KABUL_EDILDI');
  });
});

describe('Demo seed', () => {
  it('demo zincirleri yüklenir: bekleyen, yarı kabul edilmiş ve reddedilmiş Task var', async () => {
    await seedTaskDemo(t.db, t.now);
    await seedKabulDemo(t.services);
    const cti1 = (await t.services.kabul.bekleyenler(kullanici(F.cti1))).map((b) => b.task.baslik);
    expect(cti1).toContain('Phishing kampanyası IOC zenginleştirme');
    expect((await t.services.kabul.bekleyenler(kullanici(F.uhIstihbarat))).length).toBeGreaterThan(0);
    const reddedilen = await t.services.task.listele(kullanici(F.waf2), { durum: 'REDDEDILDI' });
    expect(reddedilen.map((x) => x.baslik)).toEqual(['APT raporu çevirisi']);
  });
});
