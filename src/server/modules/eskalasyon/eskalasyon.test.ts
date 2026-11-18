import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedVekaletDemo } from '../../seed/vekalet-demo';

const t = useTestDb();
const d = (s: string) => new Date(s);

async function bildirimTurleri(kullaniciId: string, taskId: string): Promise<string[]> {
  return (await t.services.bildirim.listele(kullanici(kullaniciId))).filter((b) => b.varlikId === taskId).map((b) => b.tur);
}

describe('Vekalet demo verisi', () => {
  it('Vekil işi ve eskale edilen iş üretir', async () => {
    t.now = d('2026-03-04T09:00:00Z');
    await seedVekaletDemo(t.services);
    expect((await t.services.bekleyen.listele(kullanici(F.waf1))).map((x) => x.grup)).toContain('VEKIL');
    expect((await t.services.bekleyen.listele(kullanici(F.uhIstihbarat))).map((x) => x.grup)).toContain('ESKALASYON');
  });
});

describe('Eskalasyon', () => {
  it("3 iş günü içinde karar verilmeyen talep Unit Head'e eskale edilir; bir kez", async () => {
    // Pazartesi 09:00: waf1 → TEAM-CTI, Sorumlu yönetici thCti onaylar
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'CTI ekibine', assigneeEkipId: F.ekipCti });

    expect(await t.services.eskalasyon.eskalasyonlariIsle(d('2026-03-05T08:59:00Z'))).toBe(0);
    expect(await t.services.bekleyen.listele(kullanici(F.uhIstihbarat))).toEqual([]);

    t.now = d('2026-03-05T09:00:00Z');
    expect(await t.services.eskalasyon.eskalasyonlariIsle()).toBe(1);
    expect(await t.services.eskalasyon.eskalasyonlariIsle()).toBe(0);

    const bekleyen = await t.services.kabul.bekleyenler(kullanici(F.uhIstihbarat));
    expect(bekleyen.map((b) => [b.task.id, b.sifat.sifat])).toEqual([[task.id, 'ESKALASYON']]);
    expect(await bildirimTurleri(F.uhIstihbarat, task.id)).toContain('ESKALASYON');
    // asil onaylayıcı yetkisini korur; Unit Head de karar verebilir
    expect((await t.services.kabul.bekleyenler(kullanici(F.thCti))).map((b) => b.sifat.sifat)).toEqual(['ASIL']);
    expect((await t.services.kabul.kabulEt(kullanici(F.uhIstihbarat), task.id)).durum).toBe('KABUL_EDILDI');
  });

  it("Unit Head zaten onaylayıcıysa (Team Head'siz Ekip) Direktör'e eskale edilir", async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'OSINT ekibine', assigneeEkipId: F.ekipOsint });
    t.now = d('2026-03-05T09:00:00Z');
    await t.services.eskalasyon.eskalasyonlariIsle();
    expect((await t.services.kabul.bekleyenler(kullanici(F.direktor))).map((b) => [b.task.id, b.sifat.sifat])).toEqual([[task.id, 'ESKALASYON']]);
  });

  it('karar verilmiş veya sırası gelmemiş adım eskale edilmez', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'CTI ekibine', assigneeEkipId: F.ekipCti });
    t.now = d('2026-03-03T09:00:00Z');
    await t.services.kabul.kabulEt(kullanici(F.thCti), task.id);
    // waf1 → cti1: ASSIGNEE (Pzt 09:00 başlar), SORUMLU (cti1 kabul edince başlar)
    t.now = d('2026-03-02T09:00:00Z');
    const iki = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'cti1e', assigneeKullaniciId: F.cti1 });
    t.now = d('2026-03-04T09:00:00Z');
    await t.services.kabul.kabulEt(kullanici(F.cti1), iki.id);

    t.now = d('2026-03-05T09:00:00Z');
    expect(await t.services.eskalasyon.eskalasyonlariIsle()).toBe(0);
    // SORUMLU adımı Çarşamba başladı → Pazartesi eskale olur
    t.now = d('2026-03-09T09:00:00Z');
    expect(await t.services.eskalasyon.eskalasyonlariIsle()).toBe(1);
  });

  it('eskalasyon denetim izine yazılır; REST tetikleyici yalnızca Direktör', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'CTI ekibine', assigneeEkipId: F.ekipCti });
    t.now = d('2026-03-05T09:00:00Z');
    await expect(t.services.eskalasyon.isle(kullanici(F.thCti))).rejects.toMatchObject({ kod: 'YETKI' });
    expect(await t.services.eskalasyon.isle(kullanici(F.direktor))).toEqual({ eskaleEdilen: 1 });
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'eskalasyon.eskaleEt', varlikId: task.id });
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]).toMatchObject({ varlikTuru: 'Task', veri: { hedefIds: [F.uhIstihbarat] } });
  });
});
