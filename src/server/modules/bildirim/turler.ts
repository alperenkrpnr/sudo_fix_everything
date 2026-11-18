// Kullanıcının açıp kapatabildiği bildirim türleri (ticket 08). Yeni bir `tur` gönderen modül
// buraya bir satır ekler; listede olmayan türler her zaman gönderilir.
export const BILDIRIM_TURLERI = [
  { tur: 'TASK_ATAMA', ad: 'Yeni atama' },
  { tur: 'KABUL_TALEBI', ad: 'Kabul talebi' },
  { tur: 'TASK_KABUL', ad: 'Task kabul edildi' },
  { tur: 'TASK_RET', ad: 'Task reddedildi' },
  { tur: 'TASK_BILGI', ad: 'Atama bilgisi' },
  { tur: 'TASK_BLOK', ad: 'Task bloklandı' },
  { tur: 'TERMIN_YAKLASIYOR', ad: 'Termin yaklaşıyor' },
  { tur: 'TERMIN_GECTI', ad: 'Termin geçti' },
  { tur: 'ESKALASYON', ad: 'Eskalasyon' },
  { tur: 'YETKINLIK_BITIS', ad: 'Sertifika bitişi' },
  { tur: 'ETKINLIK_DAVETI', ad: 'Etkinlik daveti' },
  { tur: 'DUYURU', ad: 'Yeni duyuru' },
] as const;

export type BildirimTuru = (typeof BILDIRIM_TURLERI)[number]['tur'];

export function bilinenTur(tur: string): tur is BildirimTuru {
  return BILDIRIM_TURLERI.some((x) => x.tur === tur);
}
