import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';
import { seedTaskDemo } from '../../seed/task-demo';
import { seedTaskDurumDemo } from '../../seed/task-durum-demo';

const t = useTestDb();

/** thCoklu → soc1: direkt kabul (KABUL_EDILDI). */
const kabulEdilmisTask = () => t.services.task.olustur(kullanici(F.thCoklu), { baslik: 'SIEM kuralı', assigneeKullaniciId: F.soc1 });

describe('Durum makinesi', () => {
  it('Assignee işe başlar ve geçiş tarihçeye yazılır', async () => {
    const task = await kabulEdilmisTask();
    const sonuc = await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'DEVAM_EDIYOR' });
    expect(sonuc.durum).toBe('DEVAM_EDIYOR');
    const g = await t.services.task.durumGecmisi(kullanici(F.soc1), task.id);
    expect(g.gecisler).toMatchObject([{ eski: 'KABUL_EDILDI', yeni: 'DEVAM_EDIYOR', kullaniciId: F.soc1, zaman: t.now }]);
  });

  it('Geçersiz geçiş reddedilir', async () => {
    const task = await kabulEdilmisTask();
    await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'TAMAMLANDI' });
    await expect(t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'BLOKLU', neden: 'x' })).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    await expect(t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'KABUL_BEKLIYOR' })).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });

  it('Kabul Bekliyor durumunda işe başlanamaz', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Log incele', assigneeKullaniciId: F.waf2 });
    expect(task.durum).toBe('KABUL_BEKLIYOR');
    await expect(t.services.task.durumDegistir(kullanici(F.waf2), task.id, { durum: 'DEVAM_EDIYOR' })).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });

  it('Bloklu için neden zorunlu; blok bildirimi gider ve blok süresi ölçülür', async () => {
    const task = await kabulEdilmisTask();
    await expect(t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'BLOKLU', neden: '  ' })).rejects.toMatchObject({ kod: 'DOGRULAMA' });
    t.now = new Date('2026-03-02T10:00:00Z');
    await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'BLOKLU', neden: 'Firewall erişimi yok' });
    const bildirimler = await t.services.bildirim.listele(kullanici(F.thCoklu));
    expect(bildirimler).toEqual([expect.objectContaining({ tur: 'TASK_BLOK', varlikId: task.id })]);
    expect(bildirimler[0]!.mesaj).toContain('Firewall erişimi yok');

    t.now = new Date('2026-03-02T13:00:00Z');
    expect((await t.services.task.durumGecmisi(kullanici(F.soc1), task.id)).blokSuresiMs).toBe(3 * 3600_000);
    await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'DEVAM_EDIYOR' });
    t.now = new Date('2026-03-03T09:00:00Z');
    const g = await t.services.task.durumGecmisi(kullanici(F.soc1), task.id);
    expect(g.blokSuresiMs).toBe(3 * 3600_000);
    expect(g.gecisler.find((x) => x.yeni === 'BLOKLU')?.neden).toBe('Firewall erişimi yok');
  });

  it('Requester yalnızca İptal edebilir', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'IOC paylaş', assigneeKullaniciId: F.cti1 });
    await expect(t.services.task.durumDegistir(kullanici(F.waf1), task.id, { durum: 'DEVAM_EDIYOR' })).rejects.toMatchObject({ kod: 'YETKI' });
    const iptal = await t.services.task.durumDegistir(kullanici(F.waf1), task.id, { durum: 'IPTAL' });
    expect(iptal.durum).toBe('IPTAL');
  });

  it('Sorumlu yönetici, Üst yönetici ve Direktör değiştirebilir; ilgisiz kullanıcı değiştiremez', async () => {
    const task = await kabulEdilmisTask();
    await expect(t.services.task.durumDegistir(kullanici(F.soc2), task.id, { durum: 'DEVAM_EDIYOR' })).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    await expect(t.services.task.durumDegistir(kullanici(F.thCti), task.id, { durum: 'DEVAM_EDIYOR' })).rejects.toMatchObject({ kod: 'BULUNAMADI' });
    await t.services.task.durumDegistir(kullanici(F.uhSavunma), task.id, { durum: 'DEVAM_EDIYOR' });
    await t.services.task.durumDegistir(kullanici(F.thCoklu), task.id, { durum: 'BLOKLU', neden: 'Bekleme' });
    const son = await t.services.task.durumDegistir(kullanici(F.direktor), task.id, { durum: 'TAMAMLANDI' });
    expect(son.durum).toBe('TAMAMLANDI');
  });

  it("Ekip'e atanan Task'ı Ekip üyesi ilerletebilir", async () => {
    const task = await t.services.task.olustur(kullanici(F.thCoklu), { baslik: 'Alarm triyajı', assigneeEkipId: F.ekipSoc });
    const s = await t.services.task.durumDegistir(kullanici(F.soc2), task.id, { durum: 'DEVAM_EDIYOR' });
    expect(s.durum).toBe('DEVAM_EDIYOR');
  });

  it('Tamamlandı yeniden açılır: aynı Task, aynı tarihçe', async () => {
    const task = await kabulEdilmisTask();
    t.now = new Date('2026-03-02T12:00:00Z');
    await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'TAMAMLANDI' });
    expect((await t.services.task.durumGecmisi(kullanici(F.soc1), task.id)).tamamlanma).toEqual(t.now);
    const acik = await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'DEVAM_EDIYOR', neden: 'Regresyon' });
    expect(acik.id).toBe(task.id);
    expect((await t.services.task.listele(kullanici(F.soc1))).filter((x) => x.baslik === 'SIEM kuralı')).toHaveLength(1);
    const g = await t.services.task.durumGecmisi(kullanici(F.soc1), task.id);
    expect(g.gecisler.map((x) => x.yeni)).toEqual(['TAMAMLANDI', 'DEVAM_EDIYOR']);
    expect(g.tamamlanma).toBeNull();
  });

  it('Demo durum tarihçesi yüklenir; tamamlanan demo Task 10 saat bloklu kalmıştır', async () => {
    await seedTaskDemo(t.db, t.now);
    await seedTaskDurumDemo(t.db, t.now);
    const task = (await t.services.task.listele(kullanici(F.direktor), { durum: 'TAMAMLANDI' }))[0]!;
    const g = await t.services.task.durumGecmisi(kullanici(F.direktor), task.id);
    expect(g.blokSuresiMs).toBe(10 * 3600_000);
    expect(g.tamamlanma).toEqual(new Date(t.now.getTime() - 24 * 3600_000));
  });

  it('Durum değişiklikleri denetim izine yazılır', async () => {
    const task = await kabulEdilmisTask();
    await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'BLOKLU', neden: 'Lisans' });
    const kayitlar = await t.services.denetim.listele(kullanici(F.direktor), { varlikId: task.id, islem: 'task.durumDegistir' });
    expect(kayitlar).toMatchObject([{ kullaniciId: F.soc1, veri: { eski: 'KABUL_EDILDI', yeni: 'BLOKLU', neden: 'Lisans' } }]);
  });
});
