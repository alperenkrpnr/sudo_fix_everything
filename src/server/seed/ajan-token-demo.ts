// Demo ajan token'ları (ticket 13; yalnızca `npm run dev`). Sabit metin, böylece dev her
// açılışta veritabanını yeniden kursa da `claude mcp add` kaydı geçerli kalır. Yalnızca demo.
import type { Db } from '../db/client';
import { tokenOzeti } from '../modules/ajan-token';
import { F, FIXTURE_BASLANGIC } from './fixture';

export const DEMO_AJAN_TOKENLARI = {
  /** waf1 (Çalışan), salt okunur. */
  okuma: 'ajan:demo-waf1-okuma',
  /** thCoklu (Team Head WAF & SOC), okuma + yazma. */
  yazma: 'ajan:demo-thcoklu-yazma',
} as const;

export async function seedAjanTokenDemo(db: Db): Promise<void> {
  await db.ajanToken.createMany({
    data: [
      { kullaniciId: F.waf1, ad: 'Demo (salt okunur)', kapsamlar: ['okuma'], tokenOzeti: tokenOzeti(DEMO_AJAN_TOKENLARI.okuma), olusturma: FIXTURE_BASLANGIC },
      { kullaniciId: F.thCoklu, ad: 'Demo (yazma)', kapsamlar: ['okuma', 'yazma'], tokenOzeti: tokenOzeti(DEMO_AJAN_TOKENLARI.yazma), olusturma: FIXTURE_BASLANGIC },
    ],
  });
}
