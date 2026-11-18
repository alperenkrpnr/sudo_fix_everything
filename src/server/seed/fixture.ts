// Seed fixture (spec Testing Decisions): small Direktörlük with mock users.
// Used by tests (loaded before every test) and by `npm run dev`.
//
//  Direktörlük DIR (Direktör: direktor)
//  ├─ Unit SAVUNMA (Unit Head: uhSavunma)
//  │   ├─ Ekip TEAM-WAF      Team Head: thCoklu   Çalışanlar: waf1, waf2
//  │   ├─ Ekip TEAM-SOC      Team Head: thCoklu   Çalışanlar: soc1, soc2
//  │   └─ Ekip TEAM-PENTEST  (Team Head yok → Sorumlu yönetici uhSavunma)  Çalışanlar: pentest1
//  └─ Unit ISTIHBARAT (Unit Head: uhIstihbarat)
//      ├─ Ekip TEAM-CTI      Team Head: thCti     Çalışanlar: cti1, cti2
//      └─ Ekip TEAM-OSINT    (Team Head yok → Sorumlu yönetici uhIstihbarat)  Çalışanlar: osint1
import type { Db } from '../db/client';

export const FIXTURE_BASLANGIC = new Date('2025-01-01T00:00:00Z');

/** Stable ids. Import `F` in tests instead of hard-coding strings. */
export const F = {
  direktorluk: 'dir-siber',
  unitSavunma: 'unit-savunma',
  unitIstihbarat: 'unit-istihbarat',
  ekipWaf: 'ekip-waf',
  ekipSoc: 'ekip-soc',
  ekipPentest: 'ekip-pentest',
  ekipCti: 'ekip-cti',
  ekipOsint: 'ekip-osint',
  direktor: 'u-direktor',
  uhSavunma: 'u-uh-savunma',
  uhIstihbarat: 'u-uh-istihbarat',
  thCoklu: 'u-th-coklu',
  thCti: 'u-th-cti',
  waf1: 'u-waf1',
  waf2: 'u-waf2',
  soc1: 'u-soc1',
  soc2: 'u-soc2',
  pentest1: 'u-pentest1',
  cti1: 'u-cti1',
  cti2: 'u-cti2',
  osint1: 'u-osint1',
} as const;

const kullanicilar: Array<{ id: string; ad: string; unvan: string }> = [
  { id: F.direktor, ad: 'Deniz Demir', unvan: 'Direktör' },
  { id: F.uhSavunma, ad: 'Ayşe Kaya', unvan: 'Unit Head - Savunma' },
  { id: F.uhIstihbarat, ad: 'Burak Şahin', unvan: 'Unit Head - İstihbarat' },
  { id: F.thCoklu, ad: 'Cem Yıldız', unvan: 'Team Head - WAF & SOC' },
  { id: F.thCti, ad: 'Ece Arslan', unvan: 'Team Head - CTI' },
  { id: F.waf1, ad: 'Fatma Çelik', unvan: 'WAF Uzmanı' },
  { id: F.waf2, ad: 'Gökhan Öztürk', unvan: 'WAF Uzmanı' },
  { id: F.soc1, ad: 'Hande Aydın', unvan: 'SOC Analisti' },
  { id: F.soc2, ad: 'İlker Koç', unvan: 'SOC Analisti' },
  { id: F.pentest1, ad: 'Jale Kurt', unvan: 'Sızma Testi Uzmanı' },
  { id: F.cti1, ad: 'Kerem Özdemir', unvan: 'CTI Analisti' },
  { id: F.cti2, ad: 'Leyla Polat', unvan: 'CTI Analisti' },
  { id: F.osint1, ad: 'Mert Erdoğan', unvan: 'OSINT Analisti' },
];

export async function seedFixture(db: Db): Promise<void> {
  const g = FIXTURE_BASLANGIC;
  await db.direktorluk.create({ data: { id: F.direktorluk, ad: 'Siber Güvenlik Direktörlüğü' } });
  await db.unit.createMany({
    data: [
      { id: F.unitSavunma, kod: 'UNIT-SAVUNMA', ad: 'Savunma', direktorlukId: F.direktorluk },
      { id: F.unitIstihbarat, kod: 'UNIT-ISTIHBARAT', ad: 'Tehdit İstihbaratı', direktorlukId: F.direktorluk },
    ],
  });
  await db.ekip.createMany({
    data: [
      { id: F.ekipWaf, kod: 'TEAM-WAF', ad: 'WAF', unitId: F.unitSavunma },
      { id: F.ekipSoc, kod: 'TEAM-SOC', ad: 'SOC', unitId: F.unitSavunma },
      { id: F.ekipPentest, kod: 'TEAM-PENTEST', ad: 'Sızma Testi', unitId: F.unitSavunma },
      { id: F.ekipCti, kod: 'TEAM-CTI', ad: 'Siber Tehdit İstihbaratı', unitId: F.unitIstihbarat },
      { id: F.ekipOsint, kod: 'TEAM-OSINT', ad: 'OSINT', unitId: F.unitIstihbarat },
    ],
  });
  await db.kullanici.createMany({
    data: kullanicilar.map((k) => ({ ...k, eposta: `${k.id.replace(/^u-/, '')}@siber.example` })),
  });
  await db.yoneticilik.createMany({
    data: [
      { tur: 'DIREKTOR', kullaniciId: F.direktor, direktorlukId: F.direktorluk, gecerliBaslangic: g },
      { tur: 'UNIT_HEAD', kullaniciId: F.uhSavunma, unitId: F.unitSavunma, gecerliBaslangic: g },
      { tur: 'UNIT_HEAD', kullaniciId: F.uhIstihbarat, unitId: F.unitIstihbarat, gecerliBaslangic: g },
      { tur: 'TEAM_HEAD', kullaniciId: F.thCoklu, ekipId: F.ekipWaf, gecerliBaslangic: g },
      { tur: 'TEAM_HEAD', kullaniciId: F.thCoklu, ekipId: F.ekipSoc, gecerliBaslangic: g },
      { tur: 'TEAM_HEAD', kullaniciId: F.thCti, ekipId: F.ekipCti, gecerliBaslangic: g },
    ],
  });
  const uye = (kullaniciId: string, ekipId: string) => ({ kullaniciId, ekipId, gecerliBaslangic: g });
  await db.uyelik.createMany({
    data: [
      uye(F.waf1, F.ekipWaf),
      uye(F.waf2, F.ekipWaf),
      uye(F.soc1, F.ekipSoc),
      uye(F.soc2, F.ekipSoc),
      uye(F.pentest1, F.ekipPentest),
      uye(F.cti1, F.ekipCti),
      uye(F.cti2, F.ekipCti),
      uye(F.osint1, F.ekipOsint),
    ],
  });
}
