// MCP adaptörü (ADR-0001, ticket 13): iş kuralı içermez. Her tool tek bir servis çağrısına
// yönlenir; yetki, görünürlük, ajan kapsamı ve denetim izi servis katmanındadır. Sunucu tek
// bir ajan için kurulur (stdio: bir süreç = bir token). `kimlik` bir fonksiyonsa her tool
// çağrısında yeniden çözülür (iptal edilen token hemen durur).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Actor } from '../core/actor';
import type { Services } from '../services';

const DURUMLAR = ['TASLAK', 'KABUL_BEKLIYOR', 'KABUL_EDILDI', 'DEVAM_EDIYOR', 'BLOKLU', 'TAMAMLANDI', 'REDDEDILDI', 'IPTAL'] as const;
const ONCELIKLER = ['DUSUK', 'ORTA', 'YUKSEK', 'KRITIK'] as const;

type ToolSonucu = { content: { type: 'text'; text: string }[]; isError?: boolean };

/** Runs one service call; service errors become MCP tool errors ("KOD: mesaj"). */
async function calistir(kimlik: () => Promise<Actor>, fn: (actor: Actor) => Promise<unknown>): Promise<ToolSonucu> {
  try {
    const veri = await fn(await kimlik());
    return { content: [{ type: 'text', text: JSON.stringify(veri, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }] };
  } catch (err) {
    const kod = (err as { kod?: string })?.kod;
    if (!kod) throw err;
    return { isError: true, content: [{ type: 'text', text: `${kod}: ${(err as Error).message}` }] };
  }
}

const tarih = (s: string | undefined) => (s ? new Date(s) : undefined);

export function mcpSunucusu(services: Services, kimlik: Actor | (() => Promise<Actor>)): McpServer {
  const s = new McpServer({ name: 'siber-task', version: '0.1.0' });
  const actorCoz = typeof kimlik === 'function' ? kimlik : async () => kimlik;
  const sonuc = (fn: (actor: Actor) => Promise<unknown>) => calistir(actorCoz, fn);
  const oku = { readOnlyHint: true } as const;

  s.registerTool(
    'task_listele',
    { description: 'Kullanıcının görebildiği Task listesini döner (isteğe bağlı durum filtresi).', inputSchema: { durum: z.enum(DURUMLAR).optional() }, annotations: oku },
    ({ durum }) => sonuc((actor) => services.task.listele(actor, { durum })),
  );

  s.registerTool(
    'task_getir',
    { description: 'Tek bir Task\'ı id ile getirir.', inputSchema: { id: z.string() }, annotations: oku },
    ({ id }) => sonuc((actor) => services.task.getir(actor, id)),
  );

  s.registerTool(
    'bekleyen_islerim',
    { description: 'Kullanıcının Bekleyen işlerim listesi (kabul bekleyen Task\'lar, etkinlik davetleri).', annotations: oku },
    () => sonuc((actor) => services.bekleyen.listele(actor)),
  );

  s.registerTool(
    'rapor_ozet',
    { description: 'Kullanıcının kapsamındaki Task raporu özeti (isteğe bağlı Ekip/Unit filtresi).', inputSchema: { ekipId: z.string().optional(), unitId: z.string().optional() }, annotations: oku },
    ({ ekipId, unitId }) => sonuc((actor) => services.rapor.ozet(actor, { ekipId, unitId })),
  );

  s.registerTool(
    'task_olustur',
    {
      description: "Kullanıcı adına Task oluşturur. Token'da 'yazma' kapsamı gerekir. Assignee yoksa Self-assign.",
      inputSchema: {
        baslik: z.string(),
        aciklama: z.string().optional(),
        oncelik: z.enum(ONCELIKLER).optional(),
        bitisTarihi: z.string().optional().describe('ISO tarih; yoksa Backlog'),
        etiketler: z.array(z.string()).optional(),
        hariciRef: z.string().optional(),
        assigneeKullaniciId: z.string().optional(),
        assigneeEkipId: z.string().optional(),
      },
    },
    (g) => sonuc((actor) => services.task.olustur(actor, { ...g, bitisTarihi: tarih(g.bitisTarihi) })),
  );

  s.registerTool(
    'task_durum_degistir',
    {
      description: "Task durumunu değiştirir (BLOKLU için neden gerekir). Token'da 'yazma' kapsamı gerekir.",
      inputSchema: { id: z.string(), durum: z.enum(DURUMLAR), neden: z.string().optional() },
    },
    ({ id, durum, neden }) => sonuc((actor) => services.task.durumDegistir(actor, id, { durum, neden })),
  );

  return s;
}
