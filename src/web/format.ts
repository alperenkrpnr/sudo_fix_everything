// Görüntüleme yardımcıları (iş kuralı yok).
import type { TaskDurum, TaskGorunumu, TaskOncelik } from './types';

const ROL_ADI: Record<string, string> = { DIREKTOR: 'Direktör', UNIT_HEAD: 'Unit Head', TEAM_HEAD: 'Team Head', CALISAN: 'Çalışan' };
export const rolAdi = (r: string) => ROL_ADI[r] ?? r;
const ROL_SIRASI = ['DIREKTOR', 'UNIT_HEAD', 'TEAM_HEAD', 'CALISAN'];
/** En üst rol (gösterim için). */
export const anaRol = (roller: string[]) => ROL_SIRASI.find((r) => roller.includes(r)) ?? 'CALISAN';

export const ONCELIK_ADI: Record<TaskOncelik, string> = { KRITIK: 'Kritik', YUKSEK: 'Yüksek', ORTA: 'Orta', DUSUK: 'Düşük' };
export const ONCELIK_SINIF: Record<TaskOncelik, string> = { KRITIK: 'crit', YUKSEK: 'high', ORTA: 'med', DUSUK: 'low' };
export const ONCELIKLER: TaskOncelik[] = ['KRITIK', 'YUKSEK', 'ORTA', 'DUSUK'];
export const ONCELIK_RENK: Record<TaskOncelik, string> = { KRITIK: '#EF5350', YUKSEK: '#F5C518', ORTA: '#4A7DF7', DUSUK: '#8C9CB7' };

export const DURUM_ADI: Record<TaskDurum, string> = {
  TASLAK: 'Taslak',
  KABUL_BEKLIYOR: 'Kabul Bekliyor',
  KABUL_EDILDI: 'Kabul Edildi',
  DEVAM_EDIYOR: 'Devam Ediyor',
  BLOKLU: 'Bloklu',
  TAMAMLANDI: 'Tamamlandı',
  REDDEDILDI: 'Reddedildi',
  IPTAL: 'İptal',
};
export const DURUM_SINIF: Record<TaskDurum, string> = {
  TASLAK: '',
  KABUL_BEKLIYOR: 'wait',
  KABUL_EDILDI: 'pool',
  DEVAM_EDIYOR: 'prog',
  BLOKLU: 'block',
  TAMAMLANDI: 'done',
  REDDEDILDI: 'rej',
  IPTAL: '',
};
export const KAPALI: TaskDurum[] = ['TAMAMLANDI', 'IPTAL', 'REDDEDILDI'];
export const acikMi = (t: TaskGorunumu) => !KAPALI.includes(t.durum) && t.durum !== 'TASLAK';

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const ayAdi = (d: Date) => AYLAR[d.getMonth()];

/** Yalnızca tarih olarak girilmiş değer mi (UTC gece yarısı)? */
const tarihSadece = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;

/** Bir tarih değerinin yerel takvim günü (yalnızca tarih değerlerinde UTC günü). */
export function takvimGunu(v: string | Date): Date {
  const d = new Date(v);
  return tarihSadece(d) ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const bugun = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
/** Bugünden kaç gün sonra (negatif = geçmiş). */
export const gunFarki = (v: string | Date) => Math.round((takvimGunu(v).getTime() - bugun().getTime()) / 86_400_000);

/** Tarih: "25 Kas 2026"; saat bilgisi varsa "25 Kas 2026 14:30". */
export function tarihGoster(v: string | Date | null | undefined, saatli = true): string {
  if (!v) return '—';
  const d = new Date(v);
  const g = takvimGunu(d);
  const gun = `${g.getDate()} ${ayAdi(g)} ${g.getFullYear()}`;
  if (!saatli || tarihSadece(d)) return gun;
  return `${gun} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const saatGoster = (v: string | Date) => {
  const d = new Date(v);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Termin çipi metni ve sınıfı. null = Backlog. */
export function terminBilgisi(t: Pick<TaskGorunumu, 'bitisTarihi' | 'durum'>): { metin: string; sinif: string } {
  if (!t.bitisTarihi) return { metin: 'Backlog', sinif: '' };
  const fark = gunFarki(t.bitisTarihi);
  const kapali = KAPALI.includes(t.durum);
  const g = takvimGunu(t.bitisTarihi);
  const metin =
    fark === 0 ? 'Bugün' : fark === 1 ? 'Yarın' : fark < 0 && !kapali ? `${-fark} gün gecikti` : `${g.getDate()} ${ayAdi(g)}`;
  const sinif = kapali ? '' : fark < 0 ? 'late' : fark <= 1 ? 'soon' : '';
  return { metin, sinif };
}

/** Geciken: açık ve bitiş tarihi geçmiş. */
export const gecikti = (t: TaskGorunumu) => acikMi(t) && !!t.bitisTarihi && gunFarki(t.bitisTarihi) < 0;

/** Süre (saat cinsinden) → "45 dk", "3,5 sa", "2g 4s". */
export function saatSure(saat: number | null | undefined): string {
  if (saat === null || saat === undefined) return '—';
  if (saat < 1 / 60) return '< 1 dk';
  if (saat < 1) return `${Math.round(saat * 60)} dk`;
  if (saat < 24) return `${saat.toFixed(1).replace('.', ',')} sa`;
  return `${Math.floor(saat / 24)}g ${Math.round(saat % 24)}s`;
}
export const msSure = (ms: number) => saatSure(ms / 3_600_000);

export const basHarfler = (ad: string) =>
  ad
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr'))
    .join('');

export const kucuk = (s: string) => s.toLocaleLowerCase('tr');
