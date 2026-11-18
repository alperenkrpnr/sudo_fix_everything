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
});
