// `npm run mcp`: MCP sunucusu (stdio) tek bir ajan token'ı için. Çalışan `npm run dev`
// veritabanına bağlanır (dev, URL'yi .pgdata/dev-db-url dosyasına yazar) ya da DATABASE_URL.
//   AJAN_TOKEN=ajan:demo-waf1-okuma npm run --silent mcp
// Claude Code'a kayıt (dev açıkken; --silent şart, npm başlığı stdout'u bozar):
//   claude mcp add siber-task -e AJAN_TOKEN=ajan:demo-waf1-okuma -- npm --prefix <repo> run --silent mcp
// stdout MCP protokolüne aittir; günlükler stderr'e yazılır.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDb } from '../db/client';
import { ROOT } from '../db/postgres';
import { createServices } from '../services';
import { mcpSunucusu } from './sunucu';

export const DEV_DB_URL_DOSYASI = path.join(ROOT, '.pgdata', 'dev-db-url');

async function main() {
  const token = process.env.AJAN_TOKEN ?? process.argv[2];
  const url = process.env.DATABASE_URL ?? (await readFile(DEV_DB_URL_DOSYASI, 'utf8').catch(() => '')).trim();
  if (!token) throw new Error('AJAN_TOKEN gerekli (ör. ajan:demo-waf1-okuma)');
  if (!url) throw new Error('Veritabanı bulunamadı: önce `npm run dev` başlatın ya da DATABASE_URL verin');
  const services = createServices({ db: createDb(url) });
  // Token geçerliliği her tool çağrısında yeniden çözülür: iptal edilen token anında durur.
  const kimlik = async () => {
    const actor = await services.ajanToken.tokenCoz(token);
    if (!actor) throw new Error("Geçersiz ajan token (biçim 'ajan:...')");
    return actor;
  };
  await kimlik();
  await mcpSunucusu(services, kimlik).connect(new StdioServerTransport());
  console.error('siber-task MCP sunucusu hazır (stdio)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
