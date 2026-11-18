import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/harness';
import { ajan, kullanici } from '../../core/actor';
import { F } from '../../seed/fixture';

const t = useTestDb();

/** thCoklu → soc1 (direkt kabul), sonra soc1 bloklar: thCoklu'ya TASK_BLOK gider. */
async function blokla() {
  const task = await t.services.task.olustur(kullanici(F.thCoklu), { baslik: 'SIEM kuralı', assigneeKullaniciId: F.soc1 });
  await t.services.task.durumDegistir(kullanici(F.soc1), task.id, { durum: 'BLOKLU', neden: 'Erişim yok' });
  return task;
}

describe('Bildirim tercihleri', () => {
  it('Varsayılan: tüm türler açık', async () => {
    const tercihler = await t.services.bildirim.tercihler(kullanici(F.waf1));
    expect(tercihler.length).toBeGreaterThan(5);
    expect(tercihler.every((x) => x.acik)).toBe(true);
    expect(tercihler).toContainEqual(expect.objectContaining({ tur: 'TASK_BLOK', acik: true }));
    expect(tercihler).toContainEqual(expect.objectContaining({ tur: 'TERMIN_GECTI', acik: true }));
  });

  it('Kapatılan tür o kullanıcıya gönderilmez; diğer alıcılar etkilenmez', async () => {
    await t.services.bildirim.tercihGuncelle(kullanici(F.thCoklu), 'TASK_BLOK', false);
    await blokla();
    expect(await t.services.bildirim.listele(kullanici(F.thCoklu))).toEqual([]);
    expect((await t.services.bildirim.tercihler(kullanici(F.thCoklu))).find((x) => x.tur === 'TASK_BLOK')?.acik).toBe(false);
    // Başka bir kullanıcının tercihi değişmedi.
    expect((await t.services.bildirim.tercihler(kullanici(F.waf1))).find((x) => x.tur === 'TASK_BLOK')?.acik).toBe(true);
  });

  it('Tercih yalnızca o türü etkiler', async () => {
    await t.services.bildirim.tercihGuncelle(kullanici(F.thCoklu), 'TERMIN_GECTI', false);
    const task = await blokla();
    expect(await t.services.bildirim.listele(kullanici(F.thCoklu))).toEqual([expect.objectContaining({ tur: 'TASK_BLOK', varlikId: task.id })]);
  });

  it('Yeniden açılınca tekrar gönderilir', async () => {
    await t.services.bildirim.tercihGuncelle(kullanici(F.thCoklu), 'TASK_BLOK', false);
    await t.services.bildirim.tercihGuncelle(kullanici(F.thCoklu), 'TASK_BLOK', true);
    const task = await blokla();
    expect(await t.services.bildirim.listele(kullanici(F.thCoklu))).toEqual([expect.objectContaining({ tur: 'TASK_BLOK', varlikId: task.id })]);
  });

  it('Bilinmeyen tür reddedilir', async () => {
    await expect(t.services.bildirim.tercihGuncelle(kullanici(F.waf1), 'YOK_BOYLE', false)).rejects.toMatchObject({ kod: 'DOGRULAMA' });
  });

  it('Okuma kapsamlı ajan tercih değiştiremez', async () => {
    await expect(t.services.bildirim.tercihGuncelle(ajan(F.waf1), 'TASK_BLOK', false)).rejects.toMatchObject({ kod: 'YETKI' });
  });
});
