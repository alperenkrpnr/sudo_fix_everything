// Eskalasyon süresi (saf fonksiyonlar). Task kabulü ve dış Etkinlik onayı aynı sayacı kullanır
// (spec "Etkinlik onayı"): `isGunu` iş günü (Cumartesi/Pazar sayılmaz; resmi tatil yok, gün sınırı UTC).
// Etkinlik onayında Etkinlik bu süreden önce başlıyorsa eskalasyon Etkinlikten bir gün önceye çekilir.

const GUN_MS = 24 * 3600 * 1000;

function haftaSonuMu(t: Date): boolean {
  const g = t.getUTCDay();
  return g === 0 || g === 6;
}

/** `baslangic`'a `isGunu` iş günü ekler; saat korunur. Hafta sonunda başlayan sayaç Pazartesiden sayar. */
export function isGunuEkle(baslangic: Date, isGunu: number): Date {
  let t = baslangic.getTime();
  let kalan = isGunu;
  while (kalan > 0) {
    t += GUN_MS;
    if (!haftaSonuMu(new Date(t))) kalan--;
  }
  return new Date(t);
}

export interface EskalasyonSecenekleri {
  /** Eskalasyon süresi (iş günü); genelde `ctx.config.eskalasyonIsGunu`. */
  isGunu: number;
  /** Etkinlik onayı: Etkinliğin başlangıcı. Verilirse eskalasyon en geç bir gün öncesidir. */
  etkinlikBaslangic?: Date | null;
}

/** Karar beklemeye `baslangic`ta başlayan bir onayın eskale edileceği an (asla `baslangic`tan önce değil). */
export function eskalasyonZamani(baslangic: Date, s: EskalasyonSecenekleri): Date {
  const normal = isGunuEkle(baslangic, s.isGunu);
  if (!s.etkinlikBaslangic) return normal;
  const birGunOnce = s.etkinlikBaslangic.getTime() - GUN_MS;
  return new Date(Math.max(baslangic.getTime(), Math.min(normal.getTime(), birGunOnce)));
}
