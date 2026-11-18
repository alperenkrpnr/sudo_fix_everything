import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedTaskDemo } from '../../seed/task-demo';

const t = useTestDb();

describe('Task oluşturma', () => {
  it('Self-assign otomatik kabul edilir; Ekip Assignee Ekibidir', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), {
      baslik: 'WAF kural gözden geçirme',
      aciklama: 'OWASP CRS güncellemesi',
      oncelik: 'YUKSEK',
      bitisTarihi: new Date('2026-03-10T00:00:00Z'),
      etiketler: ['waf', 'crs'],
      hariciRef: 'JIRA-123',
      assigneeKullaniciId: F.waf1,
    });
    expect(task).toMatchObject({
      baslik: 'WAF kural gözden geçirme',
      oncelik: 'YUKSEK',
      etiketler: ['waf', 'crs'],
      hariciRef: 'JIRA-123',
      requesterId: F.waf1,
      assigneeKullaniciId: F.waf1,
      assigneeEkipId: null,
      ekipId: F.ekipWaf,
      durum: 'KABUL_EDILDI',
    });
  });

  it.each([
    ['Team Head → kendi Çalışanı', F.thCoklu, { assigneeKullaniciId: F.soc1 }, 'KABUL_EDILDI'],
    ["Unit Head → Unit'indeki Team Head'siz Ekip Çalışanı", F.uhSavunma, { assigneeKullaniciId: F.pentest1 }, 'KABUL_EDILDI'],
    ["Unit Head → Unit'indeki Team Head", F.uhSavunma, { assigneeKullaniciId: F.thCoklu }, 'KABUL_EDILDI'],
    ['Direktör → herkes', F.direktor, { assigneeKullaniciId: F.osint1 }, 'KABUL_EDILDI'],
    ['Sorumlu yönetici → kendi Ekibi', F.thCoklu, { assigneeEkipId: F.ekipSoc }, 'KABUL_EDILDI'],
    ['Çalışan → aynı Ekipten Çalışan', F.waf1, { assigneeKullaniciId: F.waf2 }, 'KABUL_BEKLIYOR'],
    ['Çalışan → başka Unit Çalışanı', F.waf1, { assigneeKullaniciId: F.cti1 }, 'KABUL_BEKLIYOR'],
    ['Çalışan → kendi yöneticisi', F.waf1, { assigneeKullaniciId: F.thCoklu }, 'KABUL_BEKLIYOR'],
    ['Yönetici → başka yöneticinin Çalışanı', F.thCti, { assigneeKullaniciId: F.waf1 }, 'KABUL_BEKLIYOR'],
    ["Unit Head → başka Unit'in Çalışanı", F.uhIstihbarat, { assigneeKullaniciId: F.soc2 }, 'KABUL_BEKLIYOR'],
    ['Çalışan → başka Ekip', F.waf1, { assigneeEkipId: F.ekipCti }, 'KABUL_BEKLIYOR'],
  ] as const)('%s: %s', async (_ad, requester, hedef, durum) => {
    const task = await t.services.task.olustur(kullanici(requester), { baslik: 'İş', ...hedef });
    expect(task.durum).toBe(durum);
  });

  it('Ekip ataması Task Ekibini o Ekip yapar', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'IOC analizi', assigneeEkipId: F.ekipCti });
    expect(task).toMatchObject({ assigneeKullaniciId: null, assigneeEkipId: F.ekipCti, ekipId: F.ekipCti });
  });
});

const KULLANICILAR: string[] = Object.values(F).filter((id) => id.startsWith('u-'));

/** Task'ı listesinde gören kullanıcılar (sıralı). */
async function gorenler(taskId: string): Promise<string[]> {
  const out: string[] = [];
  for (const id of KULLANICILAR) {
    const liste = await t.services.task.listele(kullanici(id));
    if (liste.some((x) => x.id === taskId)) out.push(id);
  }
  return out.sort();
}

describe('Task görünürlüğü', () => {
  it('kabul bekleyen Task: Requester, hedef Çalışan ve her iki tarafın yöneticileri görür; Ekip arkadaşları görmez', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Talep', assigneeKullaniciId: F.cti1 });
    expect(await gorenler(task.id)).toEqual(
      [F.waf1, F.cti1, F.thCti, F.uhIstihbarat, F.thCoklu, F.uhSavunma, F.direktor].sort(),
    );
  });

  it("Ekip'e atanan Task kabul bekliyorken Sorumlu yöneticiye düşer, kabul edilince Ekip üyeleri de görür", async () => {
    const bekleyen = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'IOC', assigneeEkipId: F.ekipCti });
    expect(await gorenler(bekleyen.id)).toEqual([F.waf1, F.thCti, F.uhIstihbarat, F.thCoklu, F.uhSavunma, F.direktor].sort());

    const kabul = await t.services.task.olustur(kullanici(F.thCti), { baslik: 'Rapor', assigneeEkipId: F.ekipCti });
    expect(await gorenler(kabul.id)).toEqual([F.thCti, F.cti1, F.cti2, F.uhIstihbarat, F.direktor].sort());
  });

  it("Team Head'siz Ekipteki Çalışanın Task'ını Unit Head görür, diğer Unit görmez", async () => {
    const task = await t.services.task.olustur(kullanici(F.pentest1), { baslik: 'Sızma testi' });
    expect(await gorenler(task.id)).toEqual([F.pentest1, F.uhSavunma, F.direktor].sort());
  });

  it('getir görünmeyen Task için BULUNAMADI verir', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Özel', assigneeKullaniciId: F.waf2 });
    expect((await t.services.task.getir(kullanici(F.waf2), task.id)).id).toBe(task.id);
    await expect(t.services.task.getir(kullanici(F.soc1), task.id)).rejects.toMatchObject({ kod: 'BULUNAMADI' });
  });
});

describe('Taslak', () => {
  it('Taslak yalnızca Requester (ve Direktör) tarafından görülür; gönderilince kabul kuralı uygulanır', async () => {
    const taslak = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Hazırlık', assigneeKullaniciId: F.cti1, taslak: true });
    expect(taslak.durum).toBe('TASLAK');
    expect(await gorenler(taslak.id)).toEqual([F.waf1, F.direktor].sort());

    await expect(t.services.task.gonder(kullanici(F.cti1), taslak.id)).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    const gonderilen = await t.services.task.gonder(kullanici(F.waf1), taslak.id);
    expect(gonderilen.durum).toBe('KABUL_BEKLIYOR');
    expect(await gorenler(taslak.id)).toContain(F.cti1);
  });
});

describe('Task güncelleme', () => {
  it("Assignee ve yöneticisi Task alanlarını günceller; Task'ı görmeyen güncelleyemez", async () => {
    const task = await t.services.task.olustur(kullanici(F.thCoklu), { baslik: 'Log incele', assigneeKullaniciId: F.soc1 });
    const g1 = await t.services.task.guncelle(kullanici(F.soc1), task.id, { aciklama: 'SIEM üzerinden', etiketler: ['siem'] });
    expect(g1).toMatchObject({ aciklama: 'SIEM üzerinden', etiketler: ['siem'], durum: 'KABUL_EDILDI' });
    const g2 = await t.services.task.guncelle(kullanici(F.uhSavunma), task.id, { oncelik: 'KRITIK' });
    expect(g2.oncelik).toBe('KRITIK');
    await expect(t.services.task.guncelle(kullanici(F.soc2), task.id, { baslik: 'x' })).rejects.toMatchObject({ kod: 'BULUNAMADI' });
  });
});

describe('Denetim izi', () => {
  it('atama olayı Requester, Assignee ve durumla denetim izine yazılır', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Talep', assigneeKullaniciId: F.cti1 });
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { varlikTuru: 'Task', varlikId: task.id });
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]).toMatchObject({
      islem: 'task.olustur',
      kullaniciId: F.waf1,
      veri: { requesterId: F.waf1, assigneeKullaniciId: F.cti1, assigneeEkipId: null, durum: 'KABUL_BEKLIYOR' },
    });
  });
});

describe('Demo seed', () => {
  it("demo Task'ları yüklenir; Çalışan yalnızca ilişkili olduklarını görür", async () => {
    await seedTaskDemo(t.db, t.now);
    expect(await t.services.task.listele(kullanici(F.direktor))).toHaveLength(9);
    const cti1 = await t.services.task.listele(kullanici(F.cti1));
    expect(cti1.map((x) => x.baslik).sort()).toEqual(['Haftalık tehdit bülteni taslağı', 'Phishing kampanyası IOC zenginleştirme']);
  });
});

describe('Kullanıcı rehberi', () => {
  it("Çalışan başka Ekip'ten Assignee seçebilmek için tüm kullanıcıları Ekipleriyle görür", async () => {
    const rehber = await t.services.task.rehber(kullanici(F.waf1));
    expect(rehber.kullanicilar.find((k) => k.id === F.cti1)).toMatchObject({ ad: 'Kerem Özdemir', ekipler: [{ id: F.ekipCti, kod: 'TEAM-CTI' }] });
    expect(rehber.kullanicilar).toHaveLength(KULLANICILAR.length);
    expect(rehber.ekipler.map((e) => e.kod)).toContain('TEAM-OSINT');
  });
});
