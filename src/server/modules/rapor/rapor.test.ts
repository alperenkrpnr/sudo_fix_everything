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

  it('Çalışan taşınınca geçmiş Task ve retleri eski Ekip\'te kalır; tarih aralığı taşıma öncesini verir (ADR-0002)', async () => {
    const [waf1, waf2, soc2] = [kullanici(F.waf1), kullanici(F.waf2), kullanici(F.soc2)];
    // Taşıma öncesi: WAF içinde iki Task (biri reddedildi, biri tamamlandı)
    t.now = d('03-03T09:00:00');
    const r1 = await t.services.task.olustur(waf2, { baslik: 'R1', assigneeKullaniciId: F.waf1 });
    const k1 = await t.services.task.olustur(waf2, { baslik: 'K1', assigneeKullaniciId: F.waf1 });
    t.now = d('03-03T11:00:00');
    await t.services.kabul.reddet(waf1, r1.id, 'Kapsam dışı');
    await t.services.kabul.kabulEt(waf1, k1.id);
    t.now = d('03-03T15:00:00');
    await t.services.task.durumDegistir(waf1, k1.id, { durum: 'TAMAMLANDI' });
    // Taşıma: WAF → SOC
    t.now = d('03-04T09:00:00');
    await t.services.organizasyon.calisanTasi(kullanici(F.thCoklu), { kullaniciId: F.waf1, eskiEkipId: F.ekipWaf, yeniEkipId: F.ekipSoc });
    // Taşıma sonrası: SOC içinde bir Task, reddedildi
    t.now = d('03-05T09:00:00');
    const r2 = await t.services.task.olustur(soc2, { baslik: 'R2', assigneeKullaniciId: F.waf1 });
    t.now = d('03-05T10:00:00');
    await t.services.kabul.reddet(waf1, r2.id, 'Yoğunluk');
    t.now = d('03-06T09:00:00');

    const aralik = { baslangic: d('03-03T00:00:00') };
    const r = await t.services.rapor.ozet(kullanici(F.direktor), aralik);
    const ekip = (id: string) => r.ekipler!.find((e) => e.ekipId === id)!;
    expect(ekip(F.ekipWaf)).toMatchObject({ toplam: 2, tamamlanan: 1, kapali: 2, ortCozumSaat: 6 });
    expect(ekip(F.ekipSoc)).toMatchObject({ toplam: 1, kapali: 1 });
    expect(r.retRaporu!.akis).toEqual(
      expect.arrayContaining([
        { kaynakEkipId: F.ekipWaf, hedefEkipId: F.ekipWaf, adet: 1 },
        { kaynakEkipId: F.ekipSoc, hedefEkipId: F.ekipSoc, adet: 1 },
      ]),
    );
    // WAF filtresi taşınmış Çalışanın eski işlerini hâlâ sayar
    const waf = await t.services.rapor.ozet(kullanici(F.thCoklu), { ...aralik, ekipId: F.ekipWaf });
    expect(waf.calisanlar!.map((c) => [c.kullaniciId, c.toplam])).toEqual([[F.waf1, 2]]);
    // Taşıma öncesi aralık: yalnızca WAF ve WAF→WAF ret akışı
    const once = await t.services.rapor.ozet(kullanici(F.direktor), { ...aralik, bitis: d('03-03T23:59:59') });
    expect(once.genel.toplam).toBe(2);
    expect(once.retRaporu).toMatchObject({ retOrani: 0.5, akis: [{ kaynakEkipId: F.ekipWaf, hedefEkipId: F.ekipWaf, adet: 1 }] });
  });

  it('Geçmiş aralık raporu aralık sonundaki duruma göre hesaplanır; sonraki olaylar onu değiştirmez', async () => {
    const osint = kullanici(F.osint1);
    t.now = d('03-02T09:00:00');
    const a = await t.services.task.olustur(kullanici(F.uhIstihbarat), { baslik: 'A', assigneeKullaniciId: F.osint1, bitisTarihi: d('03-02T12:00:00') });
    const b = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'B', assigneeKullaniciId: F.osint1 }); // ASSIGNEE → SORUMLU
    t.now = d('03-02T10:00:00');
    await t.services.task.durumDegistir(osint, a.id, { durum: 'DEVAM_EDIYOR' });
    t.now = d('03-02T20:00:00');
    await t.services.task.durumDegistir(osint, a.id, { durum: 'BLOKLU', neden: 'Erişim' });
    // Aralık bittikten sonra: blok kalkar, tamamlanır; B reddedilir
    t.now = d('03-04T09:00:00');
    await t.services.task.durumDegistir(osint, a.id, { durum: 'TAMAMLANDI' });
    await t.services.kabul.reddet(osint, b.id, 'Kapsam dışı');
    t.now = d('03-06T09:00:00');

    const r = await t.services.rapor.ozet(kullanici(F.direktor), { baslangic: d('03-02T00:00:00'), bitis: d('03-02T23:59:59.999') });
    expect(r.genel).toEqual({ toplam: 2, acik: 2, kapali: 0, tamamlanan: 0, geciken: 1, ortCozumSaat: null });
    expect(r.blokSuresi).toEqual({ adet: 1, ortSaat: 4 });
    expect(r.kabulBekleme).toEqual({ adet: 0, ortSaat: null });
    expect(r.retRaporu).toEqual({ retOrani: 0, gerekceler: [], akis: [] });
  });

  it('Sonradan arşivlenen Ekip geçmiş Task\'larıyla Ekip performansında kalır', async () => {
    await t.db.ekip.update({ where: { id: F.ekipPentest }, data: { arsivlendi: t.now } }); // geçmiş yapı düzenlemesi
    const r = await t.services.rapor.ozet(kullanici(F.direktor));
    expect(r.ekipler!.find((e) => e.ekipId === F.ekipPentest)).toMatchObject({ kod: 'TEAM-PENTEST', toplam: 1, geciken: 1 });
  });

  it('Dev demo verisi rapora girer', async () => {
    await seedRaporDemo(t.db, t.now);
    expect((await t.services.rapor.ozet(kullanici(F.direktor))).genel.toplam).toBe(19);
  });
});
