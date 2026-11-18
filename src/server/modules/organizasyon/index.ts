// Organizasyon modülü: Direktörlük / Unit / Ekip / Çalışan görüntüleme.
// Yazma işlemleri (yapı/üyelik/rol/profil) yonetim.ts içindedir.
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { aktif, oku, roller, sorumluYonetici, uyeOlduguEkipler, yonetimKapsami, type Rol } from '../yetki';
import { organizasyonYonetimi } from './yonetim';

export interface Kisi {
  id: string;
  ad: string;
  unvan: string | null;
}

export interface EkipGorunumu {
  id: string;
  kod: string;
  ad: string;
  teamHead: Kisi[];
  /** Team Head varsa o, yoksa Unit Head. */
  sorumluYonetici: Kisi[];
  /** null: çağıran bu Ekibin üyelerini görme yetkisine sahip değil. */
  uyeler: Kisi[] | null;
  /** Çağıran bu Ekibi yönetebilir mi (Sorumlu yönetici veya Üst yönetici). */
  yonetebilir: boolean;
}

export interface UnitGorunumu {
  id: string;
  kod: string;
  ad: string;
  unitHead: Kisi[];
  yonetebilir: boolean;
  ekipler: EkipGorunumu[];
}

export interface OrgYapisi {
  tarih: Date;
  direktorluk: { id: string; ad: string; direktor: Kisi[] };
  unitler: UnitGorunumu[];
}

export interface MockKullanici extends Kisi {
  roller: Rol[];
}

export interface Profil extends Kisi {
  eposta: string;
  roller: Rol[];
  ekipIds: string[];
}

const kisi = (k: { id: string; ad: string; unvan: string | null }): Kisi => ({ id: k.id, ad: k.ad, unvan: k.unvan });

export function organizasyonServisi(ctx: ServiceContext) {
  return {
    ...organizasyonYonetimi(ctx),

    /**
     * Organizasyon yapısı. Herkes iskeleti (Unit, Ekip, yöneticiler) görür; Ekip üyelerini
     * yalnızca kendi Ekibinin üyeleri ve o Ekibi yöneten (Sorumlu/Üst) yöneticiler görür.
     * `tarih` verilirse o andaki yapı döner (ADR-0002).
     */
    yapiyiGetir(actor: Actor, opts: { tarih?: Date } = {}): Promise<OrgYapisi> {
      return oku(ctx, actor, 'organizasyon.yapiyiGetir', async (kimlik, tx) => {
        const t = opts.tarih ?? kimlik.zaman;
        const kapsam = await yonetimKapsami(tx, kimlik.kullaniciId, t);
        const kendiEkipleri = await uyeOlduguEkipler(tx, kimlik.kullaniciId, t);
        const dir = await tx.direktorluk.findFirstOrThrow({
          include: { yoneticilikler: { where: { tur: 'DIREKTOR', ...aktif(t) }, include: { kullanici: true } } },
        });
        const unitler = await tx.unit.findMany({
          where: { arsivlendi: null },
          orderBy: { kod: 'asc' },
          include: {
            yoneticilikler: { where: { tur: 'UNIT_HEAD', ...aktif(t) }, include: { kullanici: true } },
            ekipler: {
              where: { arsivlendi: null },
              orderBy: { kod: 'asc' },
              include: {
                yoneticilikler: { where: { tur: 'TEAM_HEAD', ...aktif(t) }, include: { kullanici: true } },
                uyelikler: { where: aktif(t), include: { kullanici: true } },
              },
            },
          },
        });
        const kisiler = new Map<string, Kisi>();
        for (const u of unitler) {
          for (const y of u.yoneticilikler) kisiler.set(y.kullaniciId, kisi(y.kullanici));
          for (const e of u.ekipler) for (const y of e.yoneticilikler) kisiler.set(y.kullaniciId, kisi(y.kullanici));
        }
        return {
          tarih: t,
          direktorluk: { id: dir.id, ad: dir.ad, direktor: dir.yoneticilikler.map((y) => kisi(y.kullanici)) },
          unitler: await Promise.all(
            unitler.map(async (u) => ({
              id: u.id,
              kod: u.kod,
              ad: u.ad,
              unitHead: u.yoneticilikler.map((y) => kisi(y.kullanici)),
              yonetebilir: kapsam.tumu || kapsam.unitIds.includes(u.id),
              ekipler: await Promise.all(
                u.ekipler.map(async (e) => {
                  const yonetebilir = kapsam.ekipIds.includes(e.id);
                  const gorur = yonetebilir || kendiEkipleri.includes(e.id);
                  const sy = await sorumluYonetici(tx, e.id, t);
                  return {
                    id: e.id,
                    kod: e.kod,
                    ad: e.ad,
                    teamHead: e.yoneticilikler.map((y) => kisi(y.kullanici)),
                    sorumluYonetici: sy.flatMap((id) => kisiler.get(id) ?? []),
                    uyeler: gorur
                      ? e.uyelikler.map((m) => kisi(m.kullanici)).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
                      : null,
                    yonetebilir,
                  };
                }),
              ),
            })),
          ),
        };
      });
    },

    /** Çağıranın kendi profili ve rolleri. */
    ben(actor: Actor): Promise<Profil> {
      return oku(ctx, actor, 'organizasyon.ben', async (kimlik, tx) => {
        const k = await tx.kullanici.findUniqueOrThrow({ where: { id: kimlik.kullaniciId } });
        return { ...kisi(k), eposta: k.eposta, roller: kimlik.roller, ekipIds: await uyeOlduguEkipler(tx, k.id, kimlik.zaman) };
      });
    },

    /**
     * Demo giriş ekranı için seçilebilir mock kullanıcılar (kimlik doğrulama öncesi, actor yok).
     * Gerçek SSO'da bu uç kaldırılır.
     */
    async mockKullanicilar(): Promise<MockKullanici[]> {
      const t = ctx.now();
      const ks = await ctx.db.kullanici.findMany({ where: { arsivlendi: null }, orderBy: { ad: 'asc' } });
      const sira: Record<Rol, number> = { DIREKTOR: 0, UNIT_HEAD: 1, TEAM_HEAD: 2, CALISAN: 3 };
      const out = await Promise.all(ks.map(async (k) => ({ ...kisi(k), roller: await roller(ctx.db, k.id, t) })));
      return out.sort((a, b) => sira[a.roller[0]] - sira[b.roller[0]] || a.ad.localeCompare(b.ad, 'tr'));
    },
  };
}

export type OrganizasyonServisi = ReturnType<typeof organizasyonServisi>;
