// Vekil kuralları ve Vekil çözümü (spec "Vekalet", ADR-0001): kimin Vekil olabileceği, t anında kimin
// kimin adına onay verebileceği yalnızca burada yaşar. Kalıcılık `modules/vekalet` içindedir.
import type { Tx } from '../../db/client';
import { aktif, roller, ustYoneticiler, yonetimKapsami } from './cozumleme';

/** t anında yürürlükteki Vekalet: [baslangic, bitis). Süre bitince kendiliğinden düşer. */
export function aktifVekalet(t: Date) {
  return { baslangic: { lte: t }, bitis: { gt: t } };
}

/**
 * Yöneticinin seçebileceği Vekil adayları: kendi Ekibi'nin (yönetim kapsamındaki Ekiplerin) Çalışanları
 * veya Direktörlük'teki başka bir Yönetici. Başka Ekip'in Çalışanı aday değildir. Çalışan için boş.
 */
export async function vekilAdaylari(tx: Tx, asilId: string, t: Date): Promise<string[]> {
  const r = await roller(tx, asilId, t);
  if (r.every((x) => x === 'CALISAN')) return [];
  const kapsam = await yonetimKapsami(tx, asilId, t);
  const [uyeler, yoneticiler] = await Promise.all([
    tx.uyelik.findMany({ where: { ...(kapsam.tumu ? {} : { ekipId: { in: kapsam.ekipIds } }), ...aktif(t) }, select: { kullaniciId: true } }),
    tx.yoneticilik.findMany({ where: aktif(t), select: { kullaniciId: true } }),
  ]);
  const ids = new Set([...uyeler, ...yoneticiler].map((x) => x.kullaniciId));
  ids.delete(asilId);
  return [...ids];
}

/** Bir onayda karar verebilen kişinin sıfatı. */
export type KararSifati =
  /** Adımın kendi onaylayıcısı. */
  | { sifat: 'ASIL' }
  /** Vekil: "adinaKullaniciId adına" karar verir. */
  | { sifat: 'VEKIL'; adinaKullaniciId: string }
  /** Asil'in Vekili talebin ilgilisi olduğundan talep asil'in en yakın Üst yöneticisine düştü. */
  | { sifat: 'UST_YONETICI'; adinaKullaniciId: string }
  /** Süresinde karar verilmediği için eskale edildi. */
  | { sifat: 'ESKALASYON' };

/**
 * t anında bir onayda kimlerin hangi sıfatla karar verebileceği.
 * - `asilIds`: onayın kendi onaylayıcıları (hep yetkili kalır).
 * - Asil'in yürürlükte Vekili varsa Vekil de yetkilidir; ancak Vekil talebin ilgilisiyse (`ilgililer`:
 *   Requester / Assignee) onaylayamaz ve talep asil'in en yakın Üst yöneticisine düşer.
 * - `eskalasyonHedefleri`: eskalasyonla yetki kazananlar.
 * Aynı kişi birden çok sıfatla gelirse önce ASIL, sonra Vekil sıfatı, en son ESKALASYON geçerlidir.
 */
export async function kararYetkilileri(
  tx: Tx,
  asilIds: string[],
  ilgililer: (string | null | undefined)[],
  t: Date,
  eskalasyonHedefleri: string[] = [],
): Promise<Map<string, KararSifati>> {
  const out = new Map<string, KararSifati>(asilIds.map((id) => [id, { sifat: 'ASIL' }]));
  const ekle = (id: string, s: KararSifati) => {
    if (!out.has(id) && !ilgililer.includes(id)) out.set(id, s);
  };
  if (asilIds.length) {
    const vekaletler = await tx.vekalet.findMany({ where: { asilId: { in: asilIds }, ...aktifVekalet(t) }, orderBy: { baslangic: 'asc' } });
    for (const v of vekaletler) {
      if (!ilgililer.includes(v.vekilId)) ekle(v.vekilId, { sifat: 'VEKIL', adinaKullaniciId: v.asilId });
      else {
        const ust = (await ustYoneticiler(tx, v.asilId, t)).find((id) => !ilgililer.includes(id));
        if (ust) ekle(ust, { sifat: 'UST_YONETICI', adinaKullaniciId: v.asilId });
      }
    }
  }
  for (const id of eskalasyonHedefleri) ekle(id, { sifat: 'ESKALASYON' });
  return out;
}
