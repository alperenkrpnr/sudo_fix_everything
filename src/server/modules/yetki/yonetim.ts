// Yönetim yetkisi soruları (ADR-0001): "bu kullanıcı X'i yönetebilir mi?".
// Üst yönetici kuralı yonetimKapsami üzerinden uygulanır: Direktör her şeyi, Unit Head
// kendi Unit'lerini ve tüm Ekiplerini, Team Head kendi Ekiplerini yönetir.
import { YetkiHatasi } from '../../core/errors';
import type { Tx } from '../../db/client';
import { yonetimKapsami } from './cozumleme';

export async function ekipYonetebilir(tx: Tx, kullaniciId: string, ekipId: string, t: Date): Promise<boolean> {
  const k = await yonetimKapsami(tx, kullaniciId, t);
  return k.tumu || k.ekipIds.includes(ekipId);
}

/** Unit yönetimi (Team Head ataması dahil): Direktör veya o Unit'in Unit Head'i. */
export async function unitYonetebilir(tx: Tx, kullaniciId: string, unitId: string, t: Date): Promise<boolean> {
  const k = await yonetimKapsami(tx, kullaniciId, t);
  return k.tumu || k.unitIds.includes(unitId);
}

/** `izin` false ise YetkiHatasi fırlatır. */
export function yetkiGerekli(izin: boolean, mesaj: string): void {
  if (!izin) throw new YetkiHatasi(mesaj);
}
