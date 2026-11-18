import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

const d = (s: string) => new Date(s);
const HAFTA = { baslangic: d('2026-03-02T00:00:00Z'), bitis: d('2026-03-09T00:00:00Z') };

describe('Vekil kuralları', () => {
  it("Yönetici yalnızca kendi Ekibi'nin Çalışanlarını veya başka Yöneticileri aday görür", async () => {
    const adaylar = await t.services.vekalet.adaylar(kullanici(F.thCoklu));
    expect(adaylar.map((a) => a.id).sort()).toEqual(
      [F.waf1, F.waf2, F.soc1, F.soc2, F.direktor, F.uhSavunma, F.uhIstihbarat, F.thCti].sort(),
    );
  });

  it("başka Ekip'in Çalışanı Vekil olamaz; izinli aday atanabilir", async () => {
    await expect(t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.cti1, ...HAFTA })).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.pentest1, ...HAFTA })).rejects.toMatchObject({ kod: 'YETKI' });
    const v = await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    expect(v).toMatchObject({ asilId: F.thCoklu, vekilId: F.waf1 });
    const v2 = await t.services.vekalet.ata(kullanici(F.uhSavunma), { vekilId: F.thCti, ...HAFTA });
    expect(v2).toMatchObject({ asilId: F.uhSavunma, vekilId: F.thCti });
  });

  it('Çalışan Vekil atayamaz; tarih aralığı geçerli olmalı; çakışan Vekalet olmaz', async () => {
    await expect(t.services.vekalet.ata(kullanici(F.waf1), { vekilId: F.waf2, ...HAFTA })).rejects.toMatchObject({ kod: 'YETKI' });
    await expect(
      t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, baslangic: HAFTA.bitis, bitis: HAFTA.baslangic }),
    ).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    await expect(
      t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf2, baslangic: d('2026-03-05T00:00:00Z'), bitis: d('2026-03-12T00:00:00Z') }),
    ).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });
});

describe('Vekil kararları', () => {
  async function socEkibineTalep() {
    // cti1 → TEAM-SOC: Sorumlu yönetici thCoklu onaylar
    return t.services.task.olustur(kullanici(F.cti1), { baslik: 'SOC ekibine', assigneeEkipId: F.ekipSoc });
  }

  it("Vekil asil adına onaylar; karar 'X adına Y tarafından' kaydedilir", async () => {
    await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    const task = await socEkibineTalep();

    const bekleyen = await t.services.kabul.bekleyenler(kullanici(F.waf1));
    expect(bekleyen.map((b) => [b.task.id, b.sifat])).toEqual([[task.id, { sifat: 'VEKIL', adinaKullaniciId: F.thCoklu }]]);

    const sonuc = await t.services.kabul.kabulEt(kullanici(F.waf1), task.id);
    expect(sonuc.durum).toBe('KABUL_EDILDI');
    const z = await t.services.kabul.zincir(kullanici(F.cti1), task.id);
    expect(z.adimlar[0]).toMatchObject({ karar: 'KABUL', kararVerenId: F.waf1, adinaKullaniciId: F.thCoklu });
    const [kayit] = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'kabul.kabulEt', varlikId: task.id });
    expect(kayit).toMatchObject({ kullaniciId: F.waf1, adinaKullaniciId: F.thCoklu });
  });

  it('Vekalet süresi bitince Vekil onaylayamaz', async () => {
    await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    const task = await socEkibineTalep();
    t.now = d('2026-03-09T00:00:00Z');
    expect(await t.services.kabul.bekleyenler(kullanici(F.waf1))).toEqual([]);
    await expect(t.services.kabul.kabulEt(kullanici(F.waf1), task.id)).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it('erken sonlandırılan Vekalet hemen biter', async () => {
    const v = await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    const task = await socEkibineTalep();
    t.now = d('2026-03-03T09:00:00Z');
    await t.services.vekalet.sonlandir(kullanici(F.thCoklu), v.id);
    await expect(t.services.kabul.kabulEt(kullanici(F.waf1), task.id)).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it("Vekil kendi ilişkili olduğu talebi onaylayamaz; talep asil'in Üst yöneticisine düşer", async () => {
    await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    // waf1 → soc1: ASSIGNEE soc1, sonra SORUMLU thCoklu. Requester = Vekil.
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Kendi talebim', assigneeKullaniciId: F.soc1 });
    t.now = d('2026-03-02T10:00:00Z');
    await t.services.kabul.kabulEt(kullanici(F.soc1), task.id);

    expect(await t.services.kabul.bekleyenler(kullanici(F.waf1))).toEqual([]);
    await expect(t.services.kabul.kabulEt(kullanici(F.waf1), task.id)).rejects.toMatchObject({ kod: 'YETKI' });
    const ust = await t.services.kabul.bekleyenler(kullanici(F.uhSavunma));
    expect(ust.map((b) => [b.task.id, b.sifat])).toEqual([[task.id, { sifat: 'UST_YONETICI', adinaKullaniciId: F.thCoklu }]]);
    expect((await t.services.kabul.kabulEt(kullanici(F.uhSavunma), task.id)).durum).toBe('KABUL_EDILDI');
  });

  it('Vekalet atama ve sonlandırma denetim izine yazılır', async () => {
    const v = await t.services.vekalet.ata(kullanici(F.thCoklu), { vekilId: F.waf1, ...HAFTA });
    await t.services.vekalet.sonlandir(kullanici(F.thCoklu), v.id);
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { varlikTuru: 'Vekalet', varlikId: v.id });
    expect(kayitlar.map((k) => [k.islem, k.kullaniciId])).toEqual([
      ['vekalet.sonlandir', F.thCoklu],
      ['vekalet.ata', F.thCoklu],
    ]);
  });
});
