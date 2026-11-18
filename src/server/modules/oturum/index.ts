// Oturum: demo mock girişi. Token biçimi `mock:<kullaniciId>`; gerçek Entra ID/OIDC
// geldiğinde yalnızca bu modül ve web adaptörünün kimlik çözümü değişir.
import { kullanici, type Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import { KimlikHatasi } from '../../core/errors';
import { yaz } from '../yetki';

const ONEK = 'mock:';

export function oturumServisi(ctx: ServiceContext) {
  return {
    /** Mock kullanıcı ile giriş; denetim izine `oturum.ac` yazılır. */
    girisYap(kullaniciId: string): Promise<{ token: string }> {
      return yaz(ctx, kullanici(kullaniciId), 'oturum.ac', async (kimlik) => ({
        sonuc: { token: ONEK + kimlik.kullaniciId },
        denetim: { varlikTuru: 'Kullanici', varlikId: kimlik.kullaniciId },
      }));
    },

    /** Bearer token → Actor (kullanıcının varlığı servis çağrısında doğrulanır). */
    tokenCoz(token: string | undefined): Actor {
      if (!token?.startsWith(ONEK) || token.length === ONEK.length) throw new KimlikHatasi('Geçersiz oturum');
      return kullanici(token.slice(ONEK.length));
    },
  };
}
