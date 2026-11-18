import { describe, expect, it } from 'vitest';
import { eskalasyonZamani } from './sure';

const d = (s: string) => new Date(s);

describe('Eskalasyon zamanı (iş günü sayacı)', () => {
  it.each([
    ['Pazartesi + 3 iş günü = Perşembe aynı saat', '2026-03-02T09:00:00Z', '2026-03-05T09:00:00Z'],
    ['Perşembe + 3 iş günü hafta sonunu atlar = Salı', '2026-03-05T09:00:00Z', '2026-03-10T09:00:00Z'],
    ['Cumartesi başlayan talep Pazartesiden saymaya başlar', '2026-03-07T10:00:00Z', '2026-03-11T10:00:00Z'],
  ])('%s', (_ad, baslangic, beklenen) => {
    expect(eskalasyonZamani(d(baslangic), { isGunu: 3 })).toEqual(d(beklenen));
  });

  it('süre ayarlanabilir', () => {
    expect(eskalasyonZamani(d('2026-03-02T09:00:00Z'), { isGunu: 1 })).toEqual(d('2026-03-03T09:00:00Z'));
  });

  it.each([
    ['Etkinlik süreden önce başlıyorsa eskalasyon Etkinlikten bir gün önce', '2026-03-05T12:00:00Z', '2026-03-04T12:00:00Z'],
    ['Etkinlik süreden sonra başlıyorsa normal süre', '2026-03-06T10:00:00Z', '2026-03-05T09:00:00Z'],
    ['Etkinlik bir günden yakınsa hemen eskale edilir', '2026-03-02T20:00:00Z', '2026-03-02T09:00:00Z'],
  ])('%s', (_ad, etkinlikBaslangic, beklenen) => {
    expect(eskalasyonZamani(d('2026-03-02T09:00:00Z'), { isGunu: 3, etkinlikBaslangic: d(etkinlikBaslangic) })).toEqual(d(beklenen));
  });
});
