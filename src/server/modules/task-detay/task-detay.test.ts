import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedTaskDemo } from '../../seed/task-demo';
import { seedTaskDetayDemo } from '../../seed/task-detay-demo';

const ekDizini = mkdtempSync(path.join(tmpdir(), 'ekler-'));
const t = useTestDb({ ekDizini, ekMaxBayt: 1000 });

const wafTask = () => t.services.task.olustur(kullanici(F.waf1), { baslik: 'WAF kural seti', assigneeKullaniciId: F.waf1 });

describe('alt task', () => {
  it('alt task eklenir, tamamlanır ve ilerleme üst Task detayında görünür', async () => {
    const task = await wafTask();
    const a = await t.services.taskDetay.altTaskEkle(kullanici(F.waf1), task.id, { baslik: 'Kural yaz' });
    await t.services.taskDetay.altTaskEkle(kullanici(F.waf1), task.id, { baslik: 'Test et' });
    await t.services.taskDetay.altTaskTamamla(kullanici(F.waf1), a.id, true);

    const d = await t.services.taskDetay.detay(kullanici(F.waf1), task.id);
    expect(d.altTasklar.map((x) => [x.baslik, x.tamamlandi])).toEqual([['Kural yaz', true], ['Test et', false]]);
    expect(d.ilerleme).toEqual({ tamamlanan: 1, toplam: 2 });
  });
});

describe('yorum', () => {
  it('yorumlar durum geçişleriyle birlikte zaman sırasıyla tarihçede görünür', async () => {
    const task = await wafTask();
    t.now = new Date('2026-03-02T10:00:00Z');
    await t.services.taskDetay.yorumEkle(kullanici(F.waf1), task.id, { metin: 'Başlıyorum' });
    t.now = new Date('2026-03-02T11:00:00Z');
    await t.services.task.durumDegistir(kullanici(F.waf1), task.id, { durum: 'DEVAM_EDIYOR' });
    t.now = new Date('2026-03-02T12:00:00Z');
    await t.services.taskDetay.yorumEkle(kullanici(F.thCoklu), task.id, { metin: 'Kolay gelsin' });

    const d = await t.services.taskDetay.detay(kullanici(F.waf1), task.id);
    expect(d.tarihce.map((x) => (x.tur === 'YORUM' ? `${x.kullaniciId}: ${x.metin}` : `${x.eski}->${x.yeni}`))).toEqual([
      `${F.waf1}: Başlıyorum`,
      'KABUL_EDILDI->DEVAM_EDIYOR',
      `${F.thCoklu}: Kolay gelsin`,
    ]);
  });

  it("Task'ı göremeyen kullanıcı yorum yazamaz, detayı ve yorumları göremez", async () => {
    const task = await wafTask();
    await t.services.taskDetay.yorumEkle(kullanici(F.waf1), task.id, { metin: 'Gizli not' });
    await expect(t.services.taskDetay.yorumEkle(kullanici(F.cti1), task.id, { metin: 'x' })).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    await expect(t.services.taskDetay.detay(kullanici(F.cti1), task.id)).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    await expect(t.services.taskDetay.altTaskEkle(kullanici(F.cti1), task.id, { baslik: 'x' })).rejects.toMatchObject({ kod: 'BULUNAMADI' });
  });

  it('boş yorum reddedilir', async () => {
    const task = await wafTask();
    await expect(t.services.taskDetay.yorumEkle(kullanici(F.waf1), task.id, { metin: '  ' })).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });
});

describe('Backlog', () => {
  it('yalnızca görünür, tarihsiz ve açık Task\'ları önceliğe göre listeler (Backlog durum değildir)', async () => {
    const w = kullanici(F.waf1);
    const dusuk = await t.services.task.olustur(w, { baslik: 'Düşük', oncelik: 'DUSUK' });
    t.now = new Date('2026-03-02T10:00:00Z');
    const kritik = await t.services.task.olustur(w, { baslik: 'Kritik', oncelik: 'KRITIK' });
    await t.services.task.olustur(w, { baslik: 'Tarihli', bitisTarihi: new Date('2026-03-10T00:00:00Z') });
    const iptal = await t.services.task.olustur(w, { baslik: 'İptal' });
    await t.services.task.durumDegistir(w, iptal.id, { durum: 'IPTAL' });
    await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Başkasının' });
    await t.services.taskDetay.altTaskEkle(w, kritik.id, { baslik: 'Adım' });

    const b = await t.services.taskDetay.backlog(w);
    expect(b.map((x) => x.baslik)).toEqual(['Kritik', 'Düşük']);
    expect(b.map((x) => x.durum)).toEqual(['KABUL_EDILDI', 'KABUL_EDILDI']);
    expect(b[0].ilerleme).toEqual({ tamamlanan: 0, toplam: 1 });
    expect(b[1]).toMatchObject({ id: dusuk.id, ilerleme: { tamamlanan: 0, toplam: 0 } });
  });
});

describe('dev seed', () => {
  it('task detay demo verisi demo Task\'larının üstüne yüklenir', async () => {
    await seedTaskDemo(t.db, t.now);
    await seedTaskDetayDemo(t.services);
    const b = await t.services.taskDetay.backlog(kullanici(F.waf2));
    expect(b.find((x) => x.baslik === 'WAF kural envanteri temizliği')?.ilerleme).toEqual({ tamamlanan: 0, toplam: 1 });
  });
});

describe('etiket ve harici ref', () => {
  it('etiketler temizlenip tekilleştirilir, harici ref link veya ID olarak kaydedilir ve Task\'ta görünür', async () => {
    const task = await wafTask();
    await t.services.taskDetay.etiketRefGuncelle(kullanici(F.waf1), task.id, { etiketler: [' waf ', 'waf', '', 'acil'], hariciRef: ' SEC-123 ' });
    expect(await t.services.task.getir(kullanici(F.waf1), task.id)).toMatchObject({ etiketler: ['waf', 'acil'], hariciRef: 'SEC-123' });

    await t.services.taskDetay.etiketRefGuncelle(kullanici(F.thCoklu), task.id, { hariciRef: 'https://jira.local/browse/SEC-9' });
    expect(await t.services.task.getir(kullanici(F.waf1), task.id)).toMatchObject({ etiketler: ['waf', 'acil'], hariciRef: 'https://jira.local/browse/SEC-9' });

    await t.services.taskDetay.etiketRefGuncelle(kullanici(F.waf1), task.id, { hariciRef: '' });
    expect((await t.services.task.getir(kullanici(F.waf1), task.id)).hariciRef).toBeNull();
  });

  it('script linki ve Task\'ı göremeyen kullanıcı reddedilir', async () => {
    const task = await wafTask();
    await expect(t.services.taskDetay.etiketRefGuncelle(kullanici(F.waf1), task.id, { hariciRef: 'javascript:alert(1)' })).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await expect(t.services.taskDetay.etiketRefGuncelle(kullanici(F.cti1), task.id, { etiketler: ['x'] })).rejects.toMatchObject({ kod: 'BULUNAMADI' });
  });
});

describe('dosya eki', () => {
  it("izinli ek yüklenir, detayda listelenir ve Task'ı gören indirir; göremeyen indiremez", async () => {
    const task = await wafTask();
    const ek = await t.services.taskDetay.ekYukle(kullanici(F.waf1), task.id, { dosyaAdi: 'rapor.pdf', icerik: Buffer.from('%PDF-1.4 demo') });
    expect(ek).toMatchObject({ dosyaAdi: 'rapor.pdf', mimeTuru: 'application/pdf', boyut: 13 });

    const d = await t.services.taskDetay.detay(kullanici(F.thCoklu), task.id);
    expect(d.ekler.map((e) => e.dosyaAdi)).toEqual(['rapor.pdf']);

    const indirilen = await t.services.taskDetay.ekIndir(kullanici(F.thCoklu), ek.id);
    expect(indirilen.icerik.toString()).toBe('%PDF-1.4 demo');
    expect(indirilen.mimeTuru).toBe('application/pdf');
    await expect(t.services.taskDetay.ekIndir(kullanici(F.cti1), ek.id)).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    await expect(
      t.services.taskDetay.ekYukle(kullanici(F.cti1), task.id, { dosyaAdi: 'a.txt', icerik: Buffer.from('x') }),
    ).rejects.toMatchObject({ kod: 'BULUNAMADI' });
  });

  it('boyut sınırını aşan veya izinsiz türdeki ek reddedilir', async () => {
    const task = await wafTask();
    const yukle = (dosyaAdi: string, boyut: number) =>
      t.services.taskDetay.ekYukle(kullanici(F.waf1), task.id, { dosyaAdi, icerik: Buffer.alloc(boyut, 1) });
    await expect(yukle('buyuk.pdf', 1001)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await expect(yukle('zararli.exe', 10)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await expect(yukle('uzantisiz', 10)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await expect(yukle('bos.txt', 0)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await yukle('tam-sinir.txt', 1000);
    const d = await t.services.taskDetay.detay(kullanici(F.waf1), task.id);
    expect(d.ekler.map((e) => e.dosyaAdi)).toEqual(['tam-sinir.txt']);
  });
});
