import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedRaporDemo } from '../../seed/rapor-demo';

const t = useTestDb();
const d = (s: string) => new Date(`2026-${s}Z`);

// Saat: 2026-03-02T09:00Z (TEST_NOW). Bu Task'lar tarihçesiz doğrudan yazılır
// (yedek: çözüm süresi = olusturma → guncelleme). Tarihçeli senaryo aşağıda servis üzerinden.
beforeEach(async () => {
  const task = (id: string, ekipId: string, k: string | null, durum: string, olusturma: string, guncelleme: string, bitis?: string) => ({
    id,
    baslik: id,
    requesterId: F.direktor,
    assigneeKullaniciId: k,
    assigneeEkipId: k ? null : ekipId,
    ekipId,
    durum: durum as never,
    olusturma: d(olusturma),
    guncelleme: d(guncelleme),
    bitisTarihi: bitis ? d(bitis) : null,
  });
  await t.db.task.createMany({
    data: [
      task('w1', F.ekipWaf, F.waf1, 'TAMAMLANDI', '02-20T09:00:00', '02-22T09:00:00'), // 48 sa
      task('w2', F.ekipWaf, F.waf1, 'TAMAMLANDI', '02-25T09:00:00', '02-26T09:00:00'), // 24 sa
      task('w3', F.ekipWaf, F.waf2, 'DEVAM_EDIYOR', '02-20T09:00:00', '02-21T09:00:00', '03-01T00:00:00'), // geciken
      task('w4', F.ekipWaf, F.waf2, 'KABUL_EDILDI', '02-20T09:00:00', '02-21T09:00:00', '03-10T00:00:00'),
      task('w5', F.ekipWaf, F.waf1, 'TASLAK', '02-20T09:00:00', '02-21T09:00:00', '02-01T00:00:00'), // sayılmaz
      task('s1', F.ekipSoc, F.soc1, 'TAMAMLANDI', '02-20T09:00:00', '02-23T09:00:00'), // 72 sa
      task('s2', F.ekipSoc, F.soc1, 'BLOKLU', '02-20T09:00:00', '02-21T09:00:00', '02-28T00:00:00'), // geciken
      task('s3', F.ekipSoc, F.soc2, 'IPTAL', '02-20T09:00:00', '02-21T09:00:00', '02-01T00:00:00'), // kapalı, gecikmez
      task('c1', F.ekipCti, F.cti1, 'DEVAM_EDIYOR', '02-20T09:00:00', '02-21T09:00:00'),
      task('c2', F.ekipCti, F.cti2, 'TAMAMLANDI', '02-20T09:00:00', '02-20T21:00:00'), // 12 sa
      task('e1', F.ekipPentest, null, 'KABUL_BEKLIYOR', '02-20T09:00:00', '02-20T09:00:00', '02-27T00:00:00'), // Ekip'e, geciken
    ],
  });
});

describe('Rapor: rol kapsamı ve sayılar', () => {
  it('Direktör tüm Task\'ları görür: açık/kapalı, ortalama çözüm süresi, geciken; Ekip bazlı performans', async () => {
    const r = await t.services.rapor.ozet(kullanici(F.direktor));

    expect(r.kapsam).toBe('TUMU');
    expect(r.genel).toEqual({ toplam: 10, acik: 5, kapali: 5, tamamlanan: 4, geciken: 3, ortCozumSaat: 39 });
    const ekip = (id: string) => r.ekipler!.find((e) => e.ekipId === id);
    expect(ekip(F.ekipWaf)).toMatchObject({ kod: 'TEAM-WAF', toplam: 4, acik: 2, kapali: 2, geciken: 1, ortCozumSaat: 36 });
    expect(ekip(F.ekipSoc)).toMatchObject({ toplam: 3, acik: 1, kapali: 2, geciken: 1, ortCozumSaat: 72 });
    expect(ekip(F.ekipCti)).toMatchObject({ toplam: 2, acik: 1, kapali: 1, geciken: 0, ortCozumSaat: 12 });
    expect(ekip(F.ekipPentest)).toMatchObject({ toplam: 1, acik: 1, kapali: 0, geciken: 1, ortCozumSaat: null });
    expect(ekip(F.ekipOsint)).toMatchObject({ toplam: 0, ortCozumSaat: null });
  });

  it("Team Head yalnızca kendi Ekiplerini görür ve Çalışan sıralaması alır", async () => {
    const r = await t.services.rapor.ozet(kullanici(F.thCoklu));

    expect(r.kapsam).toBe('YONETICI');
    expect(r.genel).toEqual({ toplam: 7, acik: 3, kapali: 4, tamamlanan: 3, geciken: 2, ortCozumSaat: 48 });
    expect(r.ekipler!.map((e) => e.ekipId).sort()).toEqual([F.ekipSoc, F.ekipWaf].sort());
    // Sıralama: tamamlanan çok → ortalama çözüm kısa → geciken az
    expect(r.calisanlar!.map((c) => [c.kullaniciId, c.tamamlanan, c.ortCozumSaat, c.geciken])).toEqual([
      [F.waf1, 2, 36, 0],
      [F.soc1, 1, 72, 1],
      [F.soc2, 0, null, 0],
      [F.waf2, 0, null, 1],
    ]);
  });

  it('Unit Head kendi Unit\'ini görür', async () => {
    const r = await t.services.rapor.ozet(kullanici(F.uhIstihbarat));
    expect(r.genel).toMatchObject({ toplam: 2, acik: 1, kapali: 1, ortCozumSaat: 12 });
    expect(r.calisanlar!.map((c) => c.kullaniciId)).toEqual([F.cti2, F.cti1]);
  });

  it('Çalışan yalnızca kendi raporunu görür; Ekip ve Çalışan sıralaması yok', async () => {
    const r = await t.services.rapor.ozet(kullanici(F.waf1));
    expect(r.kapsam).toBe('KENDI');
    expect(r.genel).toEqual({ toplam: 2, acik: 0, kapali: 2, tamamlanan: 2, geciken: 0, ortCozumSaat: 36 });
    expect(r.ekipler).toBeNull();
    expect(r.calisanlar).toBeNull();
  });

  it('Unit ve Ekip filtresi kapsamla kesişir; kapsam dışı Ekip filtresi reddedilir', async () => {
    expect((await t.services.rapor.ozet(kullanici(F.direktor), { unitId: F.unitSavunma })).genel.toplam).toBe(8);
    expect((await t.services.rapor.ozet(kullanici(F.thCoklu), { ekipId: F.ekipWaf })).genel.toplam).toBe(4);
    await expect(t.services.rapor.ozet(kullanici(F.thCoklu), { ekipId: F.ekipCti })).rejects.toMatchObject({ kod: 'YETKI' });
  });

  it('Kabul zinciri kaydı olmayan kapsamda kabul bekleme ve ret raporu boş; tarihçesiz kapsamda blok süresi boş', async () => {
    const r = await t.services.rapor.ozet(kullanici(F.direktor));
    expect(r.kabulBekleme).toBeNull();
    expect(r.retRaporu).toBeNull();
    expect(r.blokSuresi).toEqual({ adet: 0, ortSaat: null });
  });

  it('Çözüm süresi ve blok süresi durum tarihçesinden hesaplanır (sonraki alan düzenlemesi etkilemez)', async () => {
    const osint = kullanici(F.osint1);
    const durum = (id: string, yeni: 'DEVAM_EDIYOR' | 'BLOKLU' | 'TAMAMLANDI', saat: string) => {
      t.now = d(saat);
      return t.services.task.durumDegistir(osint, id, { durum: yeni, neden: yeni === 'BLOKLU' ? 'Erişim bekleniyor' : null });
    };
    t.now = d('03-02T09:00:00');
    const a = await t.services.task.olustur(kullanici(F.uhIstihbarat), { baslik: 'A', assigneeKullaniciId: F.osint1 });
    const b = await t.services.task.olustur(kullanici(F.uhIstihbarat), { baslik: 'B', assigneeKullaniciId: F.osint1 });
    await durum(a.id, 'DEVAM_EDIYOR', '03-02T10:00:00');
    await durum(a.id, 'BLOKLU', '03-02T12:00:00');
    await durum(a.id, 'DEVAM_EDIYOR', '03-02T17:00:00'); // 5 sa blok
    await durum(a.id, 'TAMAMLANDI', '03-03T09:00:00'); // çözüm 24 sa
    await durum(b.id, 'BLOKLU', '03-05T06:00:00'); // hâlâ bloklu: 3 sa (rapor anına kadar)
    t.now = d('03-05T09:00:00');
    await t.services.task.guncelle(kullanici(F.uhIstihbarat), a.id, { baslik: 'A (düzenlendi)' });

    const r = await t.services.rapor.ozet(kullanici(F.direktor), { ekipId: F.ekipOsint });
    expect(r.genel).toMatchObject({ toplam: 2, tamamlanan: 1, ortCozumSaat: 24 });
    expect(r.blokSuresi).toEqual({ adet: 2, ortSaat: 4 });
  });

  it('Dev demo verisi rapora girer', async () => {
    await seedRaporDemo(t.db, t.now);
    expect((await t.services.rapor.ozet(kullanici(F.direktor))).genel.toplam).toBe(19);
  });
});
