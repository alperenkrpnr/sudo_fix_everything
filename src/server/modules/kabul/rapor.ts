// Kabul kararlarından rapor hesapları (ticket 05 → rapor modülünün swap point'leri).
// Kaynak: KabulAdimi karar kayıtları (DIREKT adımlar sayılmaz).
import type { Tx } from '../../db/client';

const SAAT = 3_600_000;
const yuvarla = (x: number) => Math.round(x * 10) / 10;

/**
 * Onay adımları `ref` anı itibarıyla: yalnızca o ana kadar başlamış adımlar; o andan sonra verilmiş
 * kararlar BEKLIYOR sayılır (geçmiş aralığın raporu sonradan değişmez).
 */
async function onayAdimlari(tx: Tx, taskIds: string[], ref: Date) {
  if (!taskIds.length) return [];
  const adimlar = await tx.kabulAdimi.findMany({ where: { taskId: { in: taskIds }, tur: { not: 'DIREKT' }, baslangic: { lte: ref } } });
  return adimlar.map((a) => (a.kararZamani && a.kararZamani > ref ? { ...a, karar: 'BEKLIYOR' as const, kararZamani: null } : a));
}

/**
 * Kabul bekleme süresi: karar verilmiş (KABUL/RET) her onay adımı için kararZamani − baslangic.
 * `adet` = karar verilmiş adım sayısı, `ortSaat` = ortalama (saat, 1 ondalık). Zincir kaydı yoksa null.
 */
export async function kabulBeklemeSureleri(tx: Tx, taskIds: string[], ref: Date): Promise<{ adet: number; ortSaat: number | null } | null> {
  const adimlar = await onayAdimlari(tx, taskIds, ref);
  if (!adimlar.length) return null;
  const sureler = adimlar
    .filter((a) => (a.karar === 'KABUL' || a.karar === 'RET') && a.baslangic && a.kararZamani)
    .map((a) => a.kararZamani!.getTime() - a.baslangic!.getTime());
  return { adet: sureler.length, ortSaat: sureler.length ? yuvarla(sureler.reduce((x, y) => x + y, 0) / sureler.length / SAAT) : null };
}

/**
 * Ret raporu. retOrani = en az bir ret almış Task / onay zinciri gerektirmiş Task (0..1).
 * gerekceler: ret kararlarının gerekçe dağılımı (çoktan aza). akis: Requester Ekibi → reddeden Ekip.
 * Zincir kaydı yoksa null.
 */
export async function retRaporuHesapla(tx: Tx, taskIds: string[], ref: Date) {
  const adimlar = await onayAdimlari(tx, taskIds, ref);
  if (!adimlar.length) return null;
  const retler = adimlar.filter((a) => a.karar === 'RET');
  const zincirli = new Set(adimlar.map((a) => a.taskId)).size;
  const reddedilen = new Set(retler.map((a) => a.taskId)).size;
  const say = <K extends string>(anahtar: (a: (typeof retler)[number]) => K) => {
    const m = new Map<K, number>();
    for (const a of retler) m.set(anahtar(a), (m.get(anahtar(a)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    retOrani: Math.round((reddedilen / zincirli) * 1000) / 1000,
    gerekceler: say((a) => a.gerekce ?? '').map(([gerekce, adet]) => ({ gerekce, adet })),
    akis: say((a) => `${a.requesterEkipId ?? ''}|${a.kararVerenEkipId ?? ''}`).map(([k, adet]) => {
      const [kaynak, hedef] = k.split('|');
      return { kaynakEkipId: kaynak || null, hedefEkipId: hedef || null, adet };
    }),
  };
}
