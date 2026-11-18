// Ajan token modülü (ticket 13): kullanıcı adına çalışan AI ajanları için token üretimi,
// listeleme, iptal ve token → ajan Actor çözümü. Ajanın ne görüp yapabileceğine burada
// karar verilmez: çözülen Actor her işlemde yetki katmanından (oku/yaz) geçer, salt
// okunurluk da orada uygulanır.
import { createHash, randomBytes } from 'node:crypto';
import { ajan, type Actor, type AjanKapsami } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { BulunamadiHatasi, DogrulamaHatasi, KimlikHatasi } from '../../core/errors';
import { oku, yaz, yetkiGerekli } from '../yetki';

const ONEK = 'ajan:';
const KAPSAMLAR: readonly AjanKapsami[] = ['okuma', 'yazma'];

export interface AjanTokenGorunumu {
  id: string;
  ad: string;
  kapsamlar: AjanKapsami[];
  olusturma: Date;
  iptal: Date | null;
}

/** SHA-256 of the token; only this is stored. Exported for the dev seed's fixed demo tokens. */
export function tokenOzeti(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function kapsamlariDogrula(kapsamlar: string[] | undefined): AjanKapsami[] {
  const k = [...new Set(kapsamlar ?? ['okuma'])];
  if (!k.length || k.some((x) => !KAPSAMLAR.includes(x as AjanKapsami)))
    throw new DogrulamaHatasi("Kapsamlar yalnızca 'okuma' ve 'yazma' olabilir");
  return k as AjanKapsami[];
}

const gorunum = (r: { id: string; ad: string; kapsamlar: string[]; olusturma: Date; iptal: Date | null }): AjanTokenGorunumu => ({
  id: r.id,
  ad: r.ad,
  kapsamlar: r.kapsamlar as AjanKapsami[],
  olusturma: r.olusturma,
  iptal: r.iptal,
});

export function ajanTokenServisi(ctx: ServiceContext) {
  return {
    /**
     * Kullanıcının kendisi için token üretir. Token yalnızca bu yanıtta görünür.
     * Ajanlar token üretemez (yetkiyi kendi kendine çoğaltamaz).
     */
    olustur(actor: Actor, g: { ad: string; kapsamlar?: AjanKapsami[] }): Promise<AjanTokenGorunumu & { token: string }> {
      return yaz(ctx, actor, 'ajanToken.olustur', async (kimlik, tx) => {
        yetkiGerekli(!kimlik.ajan, 'Ajan token üretemez');
        const ad = String(g.ad ?? '').trim();
        if (!ad) throw new DogrulamaHatasi('Token adı gerekli');
        const kapsamlar = kapsamlariDogrula(g.kapsamlar);
        const token = ONEK + randomBytes(24).toString('base64url');
        const row = await tx.ajanToken.create({
          data: { kullaniciId: kimlik.kullaniciId, ad, kapsamlar, tokenOzeti: tokenOzeti(token), olusturma: kimlik.zaman },
        });
        return {
          sonuc: { ...gorunum(row), token },
          denetim: { varlikTuru: 'AjanToken', varlikId: row.id, veri: { ad, kapsamlar } },
        };
      });
    },

    /** Kullanıcının kendi token'ları (sır olmadan). */
    listele(actor: Actor): Promise<AjanTokenGorunumu[]> {
      return oku(ctx, actor, 'ajanToken.listele', async (kimlik, tx) => {
        const rows = await tx.ajanToken.findMany({ where: { kullaniciId: kimlik.kullaniciId }, orderBy: { olusturma: 'desc' } });
        return rows.map(gorunum);
      });
    },

    /** Kendi token'ını iptal eder (satır silinmez). */
    iptalEt(actor: Actor, id: string): Promise<AjanTokenGorunumu> {
      return yaz(ctx, actor, 'ajanToken.iptalEt', async (kimlik, tx) => {
        yetkiGerekli(!kimlik.ajan, 'Ajan token iptal edemez');
        const row = await tx.ajanToken.findFirst({ where: { id, kullaniciId: kimlik.kullaniciId } });
        if (!row) throw new BulunamadiHatasi('Token bulunamadı');
        const guncel = row.iptal ? row : await tx.ajanToken.update({ where: { id }, data: { iptal: kimlik.zaman } });
        return { sonuc: gorunum(guncel), denetim: { varlikTuru: 'AjanToken', varlikId: id } };
      });
    },

    /**
     * Bearer token → ajan Actor. `null` when the string is not an agent token (e.g. a mock
     * session token), so adapters can fall back to `oturum.tokenCoz`. System op: no actor yet.
     */
    async tokenCoz(token: string | undefined): Promise<Actor | null> {
      if (!token?.startsWith(ONEK)) return null;
      const row = await ctx.db.ajanToken.findUnique({ where: { tokenOzeti: tokenOzeti(token) } });
      if (!row || row.iptal) throw new KimlikHatasi('Geçersiz ajan token');
      return ajan(row.kullaniciId, { tokenId: row.id, kapsamlar: row.kapsamlar as AjanKapsami[] });
    },
  };
}
