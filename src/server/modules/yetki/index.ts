// Yetki servis katmanı (ADR-0001): every service operation runs through `oku` or `yaz`.
// They resolve the caller's Kimlik, enforce the agent scope, run the operation, and
// write the denetim izi (always for writes, and for every agent operation).
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { KimlikHatasi, YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { denetimeEkle, type DenetimGirdisi } from '../denetim/kaydet';
import { roller, type Rol } from './cozumleme';

export * from './cozumleme';
export * from './task';
export * from './kabul';
export * from './yonetim';
export * from './vekalet';
export * from './onay';
export * from './delegasyon';

/** Resolved caller identity, handed to the operation body. */
export interface Kimlik {
  kullaniciId: string;
  ad: string;
  roller: Rol[];
  /** True when an AI agent performs the operation on behalf of the user. */
  ajan: boolean;
  /** Operation time (ctx.now() at entry). */
  zaman: Date;
  rolVar(rol: Rol): boolean;
}

/** What a write operation reports to the denetim izi (actor/agent/time are filled in automatically). */
export type DenetimBilgisi = Omit<DenetimGirdisi, 'islem' | 'zaman' | 'kullaniciId' | 'ajan' | 'ajanTokenId'>;

async function kimlikCoz(tx: Tx, actor: Actor, zaman: Date): Promise<Kimlik> {
  const k = await tx.kullanici.findUnique({ where: { id: actor.kullaniciId } });
  if (!k || k.arsivlendi) throw new KimlikHatasi('Bilinmeyen kullanıcı');
  const r = await roller(tx, k.id, zaman);
  return { kullaniciId: k.id, ad: k.ad, roller: r, ajan: !!actor.ajan, zaman, rolVar: (x) => r.includes(x) };
}

function ajanKapsaminiDenetle(actor: Actor, gerekli: 'okuma' | 'yazma') {
  if (actor.ajan && !actor.ajan.kapsamlar.includes(gerekli))
    throw new YetkiHatasi(`Ajan token'ında '${gerekli}' kapsamı yok`);
}

function ajanAlanlari(actor: Actor) {
  return { kullaniciId: actor.kullaniciId, ajan: !!actor.ajan, ajanTokenId: actor.ajan?.tokenId ?? null };
}

/** Read operation. Agent reads are written to the denetim izi too. */
export async function oku<T>(
  ctx: ServiceContext,
  actor: Actor,
  islem: string,
  govde: (kimlik: Kimlik, tx: Tx) => Promise<T>,
): Promise<T> {
  ajanKapsaminiDenetle(actor, 'okuma');
  const zaman = ctx.now();
  const kimlik = await kimlikCoz(ctx.db, actor, zaman);
  const sonuc = await govde(kimlik, ctx.db);
  if (actor.ajan) await denetimeEkle(ctx.db, { islem, zaman, ...ajanAlanlari(actor) });
  return sonuc;
}

/**
 * Write operation: runs in one transaction together with its denetim izi record.
 * The body returns `{ sonuc, denetim }`; `denetim` describes the changed entity.
 */
export async function yaz<T>(
  ctx: ServiceContext,
  actor: Actor,
  islem: string,
  govde: (kimlik: Kimlik, tx: Tx) => Promise<{ sonuc: T; denetim?: DenetimBilgisi }>,
): Promise<T> {
  ajanKapsaminiDenetle(actor, 'yazma');
  const zaman = ctx.now();
  return ctx.db.$transaction(async (tx) => {
    const kimlik = await kimlikCoz(tx, actor, zaman);
    const { sonuc, denetim } = await govde(kimlik, tx);
    await denetimeEkle(tx, { islem, zaman, ...ajanAlanlari(actor), ...denetim });
    return sonuc;
  });
}
