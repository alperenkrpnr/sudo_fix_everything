import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export interface DenetimGirdisi {
  islem: string;
  zaman: Date;
  kullaniciId?: string | null;
  /** Vekil kararı: "adinaKullaniciId adına kullaniciId tarafından". */
  adinaKullaniciId?: string | null;
  ajan?: boolean;
  ajanTokenId?: string | null;
  varlikTuru?: string | null;
  varlikId?: string | null;
  veri?: Prisma.InputJsonValue;
}

/** Appends one denetim izi record. The only write path to DenetimKaydi. */
export async function denetimeEkle(tx: Tx, g: DenetimGirdisi): Promise<void> {
  await tx.denetimKaydi.create({ data: { ...g, ajan: g.ajan ?? false } });
}
