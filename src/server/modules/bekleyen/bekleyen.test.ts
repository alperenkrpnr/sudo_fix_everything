import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

describe('Bekleyen işlerim', () => {
  it('Çalışan kendisine gelen kabul bekleyen Task ile Etkinlik davetini görür; termine sonra yaşa göre sıralı', async () => {
    // cti1 → waf1: farklı Unit, direkt kabul değil → KABUL_BEKLIYOR
    t.now = new Date('2026-03-02T09:00:00Z');
    const eski = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Tarihsiz eski', assigneeKullaniciId: F.waf1 });
    t.now = new Date('2026-03-02T10:00:00Z');
    const tarihsizYeni = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Tarihsiz yeni', assigneeKullaniciId: F.waf1 });
    const acil = await t.services.task.olustur(kullanici(F.soc1), {
      baslik: 'Acil',
      assigneeKullaniciId: F.waf1,
      bitisTarihi: new Date('2026-03-04T00:00:00Z'),
    });
    // waf2'ye giden ve waf1'in kendi açtığı (direkt kabul) Task'lar listede yok
    await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Başkasının', assigneeKullaniciId: F.waf2 });
    await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Self-assign' });
    const etk = await t.services.etkinlik.icEtkinlikOlustur(kullanici(F.thCoklu), {
      baslik: 'İletişim toplantısı',
      baslangic: new Date('2026-03-03T12:00:00Z'),
      davetliIds: [F.waf1],
    });

    const liste = await t.services.bekleyen.listele(kullanici(F.waf1));

    expect(liste.map((x) => [x.tur, x.id])).toEqual([
      ['ETKINLIK_DAVETI', etk.id],
      ['TASK_KABUL', acil.id],
      ['TASK_KABUL', eski.id],
      ['TASK_KABUL', tarihsizYeni.id],
    ]);
  });

  it("Yönetici Sorumlu yöneticisi olduğu Ekip'e gelen kabul bekleyen Task'ı da görür; Ekip üyesi görmez", async () => {
    const ekibe = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'WAF ekibine', assigneeEkipId: F.ekipWaf });
    const pentestEkibine = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Pentest ekibine', assigneeEkipId: F.ekipPentest });

    expect((await t.services.bekleyen.listele(kullanici(F.thCoklu))).map((x) => x.id)).toEqual([ekibe.id]);
    // Team Head yok → Sorumlu yönetici Unit Head
    expect((await t.services.bekleyen.listele(kullanici(F.uhSavunma))).map((x) => x.id)).toEqual([pentestEkibine.id]);
    expect(await t.services.bekleyen.listele(kullanici(F.waf1))).toEqual([]);
  });

  it('Vekil işleri ve eskale edilenler ayrı grupta görünür', async () => {
    await t.services.vekalet.ata(kullanici(F.thCti), {
      vekilId: F.uhSavunma,
      baslangic: new Date('2026-03-02T00:00:00Z'),
      bitis: new Date('2026-03-20T00:00:00Z'),
    });
    // SAVUNMA'ya gelen, uhSavunma'nın kendi onayı (Team Head'siz Ekip)
    const kendi = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Pentest ekibine', assigneeEkipId: F.ekipPentest });
    // thCti'nin onayı → uhSavunma Vekil
    const vekil = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'CTI ekibine', assigneeEkipId: F.ekipCti });
    // TEAM-WAF'a gelen, thCoklu'nun onayı; 3 iş günü sonra uhSavunma'ya eskale
    const eskale = await t.services.task.olustur(kullanici(F.cti2), { baslik: 'WAF ekibine', assigneeEkipId: F.ekipWaf });
    t.now = new Date('2026-03-05T09:00:00Z');
    await t.services.eskalasyon.eskalasyonlariIsle();

    const liste = await t.services.bekleyen.listele(kullanici(F.uhSavunma));
    const ozet = liste.map((x) => [x.id, x.grup, x.adinaKullaniciId ?? null]);
    expect(ozet).toEqual(expect.arrayContaining([
      [kendi.id, 'KENDI', null],
      [vekil.id, 'VEKIL', F.thCti],
      [eskale.id, 'ESKALASYON', null],
    ]));
    // kendi Pentest talebi de eskale edildi (Direktör'e); uhSavunma için KENDI kalır
    expect(liste).toHaveLength(3);
  });
});
