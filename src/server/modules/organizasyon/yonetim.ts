// Organizasyon yazma işlemleri (ticket 02): yapı, üyelik, rol ataması, profil.
// Tarih aralıklı kayıtlar silinmez (ADR-0002): biten ilişkinin gecerliBitis'i doldurulur.
// Her işlem `yaz` kapısından geçer, dolayısıyla denetim izine yazılır.
import { randomUUID } from 'node:crypto';
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { aktif, ekipYonetebilir, unitYonetebilir, yaz, yetkiGerekli } from '../yetki';

async function ekipBul(tx: Tx, ekipId: string) {
  const e = await tx.ekip.findUnique({ where: { id: ekipId } });
  if (!e || e.arsivlendi) throw new BulunamadiHatasi('Ekip bulunamadı');
  return e;
}

async function kullaniciBul(tx: Tx, kullaniciId: string) {
  const k = await tx.kullanici.findUnique({ where: { id: kullaniciId } });
  if (!k || k.arsivlendi) throw new BulunamadiHatasi('Kullanıcı bulunamadı');
  return k;
}

const DIREKTOR_GEREKLI = 'Bu işlemi yalnızca Direktör yapar';

export function organizasyonYonetimi(ctx: ServiceContext) {
  return {
    unitOlustur(actor: Actor, g: { kod: string; ad: string }) {
      return yaz(ctx, actor, 'organizasyon.unitOlustur', async (kimlik, tx) => {
        yetkiGerekli(kimlik.rolVar('DIREKTOR'), DIREKTOR_GEREKLI);
        if (!g.kod?.trim() || !g.ad?.trim()) throw new DogrulamaHatasi('Kod ve ad zorunlu');
        if (await tx.unit.count({ where: { kod: g.kod } })) throw new DogrulamaHatasi('Bu kod kullanılıyor');
        const dir = await tx.direktorluk.findFirstOrThrow();
        const u = await tx.unit.create({ data: { id: randomUUID(), kod: g.kod, ad: g.ad, direktorlukId: dir.id } });
        return { sonuc: u, denetim: { varlikTuru: 'Unit', varlikId: u.id, veri: g } };
      });
    },

    ekipOlustur(actor: Actor, g: { unitId: string; kod: string; ad: string }) {
      return yaz(ctx, actor, 'organizasyon.ekipOlustur', async (kimlik, tx) => {
        yetkiGerekli(kimlik.rolVar('DIREKTOR'), DIREKTOR_GEREKLI);
        if (!g.kod?.trim() || !g.ad?.trim()) throw new DogrulamaHatasi('Kod ve ad zorunlu');
        const unit = await tx.unit.findUnique({ where: { id: g.unitId } });
        if (!unit || unit.arsivlendi) throw new BulunamadiHatasi('Unit bulunamadı');
        if (await tx.ekip.count({ where: { kod: g.kod } })) throw new DogrulamaHatasi('Bu kod kullanılıyor');
        const e = await tx.ekip.create({ data: { id: randomUUID(), ...g } });
        return { sonuc: e, denetim: { varlikTuru: 'Ekip', varlikId: e.id, veri: g } };
      });
    },

    /** Ekip ve Unit adını/kodunu düzenler. Direktör. */
    ekipDuzenle(actor: Actor, g: { ekipId: string; ad?: string; unitId?: string }) {
      return yaz(ctx, actor, 'organizasyon.ekipDuzenle', async (kimlik, tx) => {
        yetkiGerekli(kimlik.rolVar('DIREKTOR'), DIREKTOR_GEREKLI);
        await ekipBul(tx, g.ekipId);
        const e = await tx.ekip.update({ where: { id: g.ekipId }, data: { ad: g.ad, unitId: g.unitId } });
        return { sonuc: e, denetim: { varlikTuru: 'Ekip', varlikId: e.id, veri: g } };
      });
    },

    kullaniciOlustur(actor: Actor, g: { ad: string; eposta: string; unvan?: string }) {
      return yaz(ctx, actor, 'organizasyon.kullaniciOlustur', async (kimlik, tx) => {
        yetkiGerekli(kimlik.rolVar('DIREKTOR'), DIREKTOR_GEREKLI);
        if (!g.ad?.trim() || !g.eposta?.trim()) throw new DogrulamaHatasi('Ad ve e-posta zorunlu');
        if (await tx.kullanici.count({ where: { eposta: g.eposta } })) throw new DogrulamaHatasi('Bu e-posta kullanılıyor');
        const k = await tx.kullanici.create({
          data: { id: `u-${randomUUID()}`, ad: g.ad, eposta: g.eposta, unvan: g.unvan ?? null },
        });
        return { sonuc: k, denetim: { varlikTuru: 'Kullanici', varlikId: k.id, veri: g } };
      });
    },

    /** Kendi profilini düzenler (yalnızca ad/unvan; rol buradan değişmez). Herkes, yalnızca kendisi için. */
    profilGuncelle(actor: Actor, g: { ad?: string; unvan?: string | null }) {
      return yaz(ctx, actor, 'organizasyon.profilGuncelle', async (kimlik, tx) => {
        const data = { ad: g.ad?.trim() || undefined, unvan: g.unvan === undefined ? undefined : g.unvan?.trim() || null };
        const k = await tx.kullanici.update({ where: { id: kimlik.kullaniciId }, data });
        return {
          sonuc: { id: k.id, ad: k.ad, unvan: k.unvan, eposta: k.eposta, roller: kimlik.roller },
          denetim: { varlikTuru: 'Kullanici', varlikId: k.id, veri: data },
        };
      });
    },

    /** Unit Head atar. Direktör. */
    unitHeadAta(actor: Actor, g: { unitId: string; kullaniciId: string }) {
      return yaz(ctx, actor, 'organizasyon.unitHeadAta', async (kimlik, tx) => {
        yetkiGerekli(kimlik.rolVar('DIREKTOR'), DIREKTOR_GEREKLI);
        const unit = await tx.unit.findUnique({ where: { id: g.unitId } });
        if (!unit || unit.arsivlendi) throw new BulunamadiHatasi('Unit bulunamadı');
        await kullaniciBul(tx, g.kullaniciId);
        if (await tx.yoneticilik.count({ where: { tur: 'UNIT_HEAD', ...g, ...aktif(kimlik.zaman) } }))
          throw new DogrulamaHatasi('Kullanıcı zaten bu Unit’in Unit Head’i');
        const y = await tx.yoneticilik.create({ data: { tur: 'UNIT_HEAD', ...g, gecerliBaslangic: kimlik.zaman } });
        return { sonuc: y, denetim: { varlikTuru: 'Yoneticilik', varlikId: y.id, veri: { tur: 'UNIT_HEAD', ...g } } };
      });
    },

    /** Çalışanı bir Ekip'ten diğerine taşır: eski üyelik biter, yenisi başlar. İki Ekibi de yönetmek gerekir. */
    calisanTasi(actor: Actor, g: { kullaniciId: string; eskiEkipId: string; yeniEkipId: string }) {
      return yaz(ctx, actor, 'organizasyon.calisanTasi', async (kimlik, tx) => {
        const t = kimlik.zaman;
        await ekipBul(tx, g.eskiEkipId);
        await ekipBul(tx, g.yeniEkipId);
        yetkiGerekli(
          (await ekipYonetebilir(tx, kimlik.kullaniciId, g.eskiEkipId, t)) &&
            (await ekipYonetebilir(tx, kimlik.kullaniciId, g.yeniEkipId, t)),
          'Çalışanı taşımak için iki Ekibi de yönetmelisiniz',
        );
        const { count } = await tx.uyelik.updateMany({
          where: { ekipId: g.eskiEkipId, kullaniciId: g.kullaniciId, ...aktif(t) },
          data: { gecerliBitis: t },
        });
        if (!count) throw new DogrulamaHatasi('Kullanıcı eski Ekibin üyesi değil');
        const u = await tx.uyelik.create({ data: { kullaniciId: g.kullaniciId, ekipId: g.yeniEkipId, gecerliBaslangic: t } });
        return { sonuc: u, denetim: { varlikTuru: 'Kullanici', varlikId: g.kullaniciId, veri: g } };
      });
    },

    /** Ekip'e üye ekler. Sorumlu yönetici veya Üst yönetici; onay gerekmez. */
    uyeEkle(actor: Actor, g: { ekipId: string; kullaniciId: string }) {
      return yaz(ctx, actor, 'organizasyon.uyeEkle', async (kimlik, tx) => {
        const t = kimlik.zaman;
        await ekipBul(tx, g.ekipId);
        await kullaniciBul(tx, g.kullaniciId);
        yetkiGerekli(await ekipYonetebilir(tx, kimlik.kullaniciId, g.ekipId, t), 'Bu Ekibin üyeliğini yönetemezsiniz');
        const var_ = await tx.uyelik.count({ where: { ekipId: g.ekipId, kullaniciId: g.kullaniciId, ...aktif(t) } });
        if (var_) throw new DogrulamaHatasi('Kullanıcı zaten bu Ekibin üyesi');
        const u = await tx.uyelik.create({ data: { ...g, gecerliBaslangic: t } });
        return { sonuc: u, denetim: { varlikTuru: 'Uyelik', varlikId: u.id, veri: g } };
      });
    },

    /** Ekip'ten üye çıkarır (üyeliğin gecerliBitis'i doldurulur). */
    uyeCikar(actor: Actor, g: { ekipId: string; kullaniciId: string }) {
      return yaz(ctx, actor, 'organizasyon.uyeCikar', async (kimlik, tx) => {
        const t = kimlik.zaman;
        await ekipBul(tx, g.ekipId);
        yetkiGerekli(await ekipYonetebilir(tx, kimlik.kullaniciId, g.ekipId, t), 'Bu Ekibin üyeliğini yönetemezsiniz');
        const { count } = await tx.uyelik.updateMany({
          where: { ekipId: g.ekipId, kullaniciId: g.kullaniciId, ...aktif(t) },
          data: { gecerliBitis: t },
        });
        if (!count) throw new DogrulamaHatasi('Kullanıcı bu Ekibin üyesi değil');
        return { sonuc: { ok: true }, denetim: { varlikTuru: 'Ekip', varlikId: g.ekipId, veri: g } };
      });
    },

    /** Ekip'e Team Head atar (bir Ekibin birden fazla Team Head'i olabilir). Direktör veya Unit Head. */
    teamHeadAta(actor: Actor, g: { ekipId: string; kullaniciId: string }) {
      return yaz(ctx, actor, 'organizasyon.teamHeadAta', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const e = await ekipBul(tx, g.ekipId);
        await kullaniciBul(tx, g.kullaniciId);
        yetkiGerekli(await unitYonetebilir(tx, kimlik.kullaniciId, e.unitId, t), 'Team Head atamasını yalnızca Unit Head veya Direktör yapar');
        const var_ = await tx.yoneticilik.count({ where: { tur: 'TEAM_HEAD', ...g, ...aktif(t) } });
        if (var_) throw new DogrulamaHatasi('Kullanıcı zaten bu Ekibin Team Head’i');
        const y = await tx.yoneticilik.create({ data: { tur: 'TEAM_HEAD', ...g, gecerliBaslangic: t } });
        return { sonuc: y, denetim: { varlikTuru: 'Yoneticilik', varlikId: y.id, veri: { tur: 'TEAM_HEAD', ...g } } };
      });
    },

    /** Team Head atamasını sonlandırır. */
    teamHeadKaldir(actor: Actor, g: { ekipId: string; kullaniciId: string }) {
      return yaz(ctx, actor, 'organizasyon.teamHeadKaldir', async (kimlik, tx) => {
        const t = kimlik.zaman;
        const e = await ekipBul(tx, g.ekipId);
        yetkiGerekli(await unitYonetebilir(tx, kimlik.kullaniciId, e.unitId, t), 'Team Head atamasını yalnızca Unit Head veya Direktör yapar');
        const { count } = await tx.yoneticilik.updateMany({
          where: { tur: 'TEAM_HEAD', ...g, ...aktif(t) },
          data: { gecerliBitis: t },
        });
        if (!count) throw new DogrulamaHatasi('Kullanıcı bu Ekibin Team Head’i değil');
        return { sonuc: { ok: true }, denetim: { varlikTuru: 'Ekip', varlikId: g.ekipId, veri: { tur: 'TEAM_HEAD', ...g } } };
      });
    },
  };
}
