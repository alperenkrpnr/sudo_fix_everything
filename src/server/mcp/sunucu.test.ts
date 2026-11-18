// Routing tests: MCP adapter (ticket 13). Client ↔ server over the SDK's in-memory transport.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/harness';
import { ajan, kullanici, type Actor, type AjanKapsami } from '../core/actor';
import { F } from '../seed/fixture';
import { mcpSunucusu } from './sunucu';

const t = useTestDb();

async function baglan(userId: string, kapsamlar?: AjanKapsami[], kimlik?: () => Promise<Actor>) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await mcpSunucusu(t.services, kimlik ?? ajan(userId, { kapsamlar })).connect(s);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(c);
  const cagir = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { hata: !!r.isError, metin: r.content[0].text, veri: r.isError ? null : JSON.parse(r.content[0].text) };
  };
  return { client, cagir };
}

describe('MCP adaptörü', () => {
  it('tool listesini sunar', async () => {
    const { client } = await baglan(F.waf1);
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual(
      ['bekleyen_islerim', 'rapor_ozet', 'task_durum_degistir', 'task_getir', 'task_listele', 'task_olustur'].sort(),
    );
  });

  it('okuma tool\'ları servis katmanına ajan olarak yönlenir', async () => {
    const task = await t.services.task.olustur(kullanici(F.waf1), { baslik: 'Benim' });
    const { cagir } = await baglan(F.waf1);
    expect((await cagir('task_listele')).veri.map((x: any) => x.id)).toEqual([task.id]);
    expect((await cagir('task_getir', { id: task.id })).veri).toMatchObject({ baslik: 'Benim' });
    expect((await cagir('bekleyen_islerim')).veri).toEqual([]);
    expect((await cagir('rapor_ozet')).veri).toMatchObject({ kapsam: 'KENDI' });
    const kayit = await t.services.denetim.listele(kullanici(F.direktor), { islem: 'task.getir' });
    expect(kayit).toMatchObject([{ kullaniciId: F.waf1, ajan: true }]);
  });

  it('salt okunur token ile yazma tool\'u ve görünmeyen Task hata döner', async () => {
    const gizli = await t.services.task.olustur(kullanici(F.cti1), { baslik: 'Gizli' });
    const { cagir } = await baglan(F.waf1);
    const yaz = await cagir('task_olustur', { baslik: 'x' });
    expect(yaz).toMatchObject({ hata: true });
    expect(yaz.metin).toMatch(/^YETKI/);
    expect((await cagir('task_getir', { id: gizli.id })).metin).toMatch(/^BULUNAMADI/);
  });

  it('yazma kapsamıyla Task oluşturur ve durumunu değiştirir', async () => {
    const { cagir } = await baglan(F.waf1, ['okuma', 'yazma']);
    const task = (await cagir('task_olustur', { baslik: 'Ajan task', bitisTarihi: '2026-03-20' })).veri;
    expect(task).toMatchObject({ requesterId: F.waf1, durum: 'KABUL_EDILDI', bitisTarihi: '2026-03-20T00:00:00.000Z' });
    expect((await cagir('task_durum_degistir', { id: task.id, durum: 'DEVAM_EDIYOR' })).veri).toMatchObject({ durum: 'DEVAM_EDIYOR' });
  });

  it('token her çağrıda çözülür: iptal edilen token sonraki çağrıda KIMLIK hatası alır', async () => {
    const { id, token } = await t.services.ajanToken.olustur(kullanici(F.waf1), { ad: 'mcp' });
    const { cagir } = await baglan(F.waf1, undefined, async () => (await t.services.ajanToken.tokenCoz(token))!);
    expect((await cagir('task_listele')).hata).toBe(false);
    await t.services.ajanToken.iptalEt(kullanici(F.waf1), id);
    expect((await cagir('task_listele')).metin).toMatch(/^KIMLIK/);
  });
});
