// Task dosya ekleri: tür ve boyut kuralları + disk deposu. İçerik `ctx.config.ekDizini/<ekId>` dosyasında;
// diskteki ad kullanıcı girdisinden türemez (path traversal yok). MIME türü uzantıdan sunucuda belirlenir.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../../core/context';
import { DogrulamaHatasi } from '../../core/errors';

/** İzinli uzantılar → sunucunun döndüreceği MIME türü. Çalıştırılabilir ve HTML/SVG gibi aktif içerik yok. */
export const IZINLI_TURLER: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

/** Dosya adını temizler ve tür/boyut sınırını uygular; geçersizse DOGRULAMA. */
export function ekDogrula(config: Config, dosyaAdi: unknown, icerik: unknown): { dosyaAdi: string; mimeTuru: string; boyut: number } {
  if (!Buffer.isBuffer(icerik)) throw new DogrulamaHatasi('Dosya içeriği eksik');
  const ad = path
    .basename(String(dosyaAdi ?? '').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 200);
  const uzanti = ad.includes('.') ? ad.split('.').pop()!.toLowerCase() : '';
  const mimeTuru = IZINLI_TURLER[uzanti];
  if (!ad || !mimeTuru) throw new DogrulamaHatasi(`İzinli dosya türleri: ${Object.keys(IZINLI_TURLER).join(', ')}`);
  if (icerik.length === 0) throw new DogrulamaHatasi('Dosya boş');
  if (icerik.length > config.ekMaxBayt) throw new DogrulamaHatasi(`Dosya en fazla ${config.ekMaxBayt} bayt olabilir`);
  return { dosyaAdi: ad, mimeTuru, boyut: icerik.length };
}

const dosyaYolu = (config: Config, ekId: string) => path.join(path.resolve(config.ekDizini), ekId);

export async function ekYaz(config: Config, ekId: string, icerik: Buffer): Promise<void> {
  await mkdir(path.resolve(config.ekDizini), { recursive: true });
  await writeFile(dosyaYolu(config, ekId), icerik, { flag: 'wx' });
}

export function ekOku(config: Config, ekId: string): Promise<Buffer> {
  return readFile(dosyaYolu(config, ekId));
}
