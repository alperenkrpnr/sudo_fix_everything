// Denetim izi modülü (ADR-0002): ekleme-tabanlı. Yazma yolu yalnızca `denetimeEkle`
// (yetki.yaz/oku tarafından otomatik çağrılır). Silme yoktur; DB trigger'ı UPDATE/DELETE'i
// engeller (yalnızca `arsivlendi` doldurulabilir). Saklama: ctx.config.denetimSaklamaYil.
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { YetkiHatasi } from '../../core/errors';
import { oku } from '../yetki';

export { denetimeEkle, type DenetimGirdisi } from './kaydet';

export interface DenetimKaydiGorunumu {
  id: string;
  zaman: Date;
  kullaniciId: string | null;
  adinaKullaniciId: string | null;
  ajan: boolean;
  islem: string;
  varlikTuru: string | null;
  varlikId: string | null;
  veri: unknown;
}

export function denetimServisi(ctx: ServiceContext) {
  return {
    /** Denetim izini listeler (yeniden eskiye). Şimdilik yalnızca Direktör. Arşivlenenler hariç. */
    listele(
      actor: Actor,
      filtre: { varlikTuru?: string; varlikId?: string; islem?: string; limit?: number } = {},
    ): Promise<DenetimKaydiGorunumu[]> {
      return oku(ctx, actor, 'denetim.listele', async (kimlik, tx) => {
        if (!kimlik.rolVar('DIREKTOR')) throw new YetkiHatasi('Denetim izini yalnızca Direktör görür');
        const rows = await tx.denetimKaydi.findMany({
          where: { arsivlendi: null, varlikTuru: filtre.varlikTuru, varlikId: filtre.varlikId, islem: filtre.islem },
          orderBy: { id: 'desc' },
          take: filtre.limit ?? 200,
        });
        return rows.map(({ ajanTokenId: _t, arsivlendi: _a, ...r }) => ({ ...r, id: r.id.toString() }));
      });
    },
  };
}
