// Eskalasyon modülü (ticket 09): süresinde karar verilmeyen kabul adımlarını Unit Head'e (Unit Head
// onaylayıcıysa Direktör'e) taşır. Zamanlayıcı yok: `eskalasyonlariIsle(now)` dev başlangıcında ve
// REST tetikleyicisinden (`isle`, Direktör) çağrılır; idempotenttir (bir adım bir kez eskale edilir).
// Süre: `sure.ts#eskalasyonZamani` (dış Etkinlik onayı, ticket 11, aynı fonksiyonu kullanır).
import type { Actor } from '../../core/actor';
import type { ServiceContext } from '../../core/context';
import type { Tx } from '../../db/client';
import { bildirimGonder } from '../bildirim';
import { denetimeEkle } from '../denetim/kaydet';
import { eskalasyonHedefleri, KABUL_ADIMI, yaz, yetkiGerekli } from '../yetki';
import { eskalasyonZamani } from './sure';

export { eskalasyonZamani, isGunuEkle } from './sure';

/** Süresi dolan bekleyen kabul adımlarını eskale eder; eskale edilen adım sayısını döner. */
export async function kabulEskalasyonlari(tx: Tx, isGunu: number, now: Date): Promise<number> {
  const adimlar = await tx.kabulAdimi.findMany({ where: { karar: 'BEKLIYOR', baslangic: { not: null, lte: now } }, orderBy: { baslangic: 'asc' } });
  if (!adimlar.length) return 0;
  const [tasklar, mevcut] = await Promise.all([
    tx.task.findMany({ where: { id: { in: adimlar.map((a) => a.taskId) }, durum: 'KABUL_BEKLIYOR' } }),
    tx.eskalasyon.findMany({ where: { varlikTuru: KABUL_ADIMI, varlikId: { in: adimlar.map((a) => a.id) } }, select: { varlikId: true } }),
  ]);
  const taskMap = new Map(tasklar.map((x) => [x.id, x]));
  const eskaleEdilmis = new Set(mevcut.map((e) => e.varlikId));
  let adet = 0;
  for (const a of adimlar) {
    const task = taskMap.get(a.taskId);
    if (!task || eskaleEdilmis.has(a.id)) continue;
    const sonTarih = eskalasyonZamani(a.baslangic!, { isGunu });
    if (sonTarih > now) continue;
    const hedefIds = await eskalasyonHedefleri(tx, a, task, now);
    await tx.eskalasyon.create({ data: { varlikTuru: KABUL_ADIMI, varlikId: a.id, taskId: task.id, hedefIds, sonTarih, zaman: now } });
    await bildirimGonder(tx, {
      kullaniciIds: hedefIds,
      tur: 'ESKALASYON',
      mesaj: `Süresinde karar verilmeyen Task size eskale edildi: ${task.baslik}`,
      varlikTuru: 'Task',
      varlikId: task.id,
      zaman: now,
    });
    await denetimeEkle(tx, {
      islem: 'eskalasyon.eskaleEt',
      zaman: now,
      varlikTuru: 'Task',
      varlikId: task.id,
      veri: { adimId: a.id, tur: a.tur, baslangic: a.baslangic!.toISOString(), sonTarih: sonTarih.toISOString(), hedefIds },
    });
    adet++;
  }
  return adet;
}

export function eskalasyonServisi(ctx: ServiceContext) {
  return {
    /** Sistem işlemi (aktör yok): dev başlangıcı / ileride zamanlayıcı çağırır. */
    eskalasyonlariIsle(now: Date = ctx.now()): Promise<number> {
      return ctx.db.$transaction((tx) => kabulEskalasyonlari(tx, ctx.config.eskalasyonIsGunu, now));
    },

    /** REST tetikleyicisi: yalnızca Direktör. */
    isle(actor: Actor): Promise<{ eskaleEdilen: number }> {
      return yaz(ctx, actor, 'eskalasyon.isle', async (kimlik, tx) => {
        yetkiGerekli(kimlik.rolVar('DIREKTOR'), 'Eskalasyonu yalnızca Direktör tetikler');
        const eskaleEdilen = await kabulEskalasyonlari(tx, ctx.config.eskalasyonIsGunu, kimlik.zaman);
        return { sonuc: { eskaleEdilen }, denetim: { veri: { eskaleEdilen } } };
      });
    },
  };
}

export type EskalasyonServisi = ReturnType<typeof eskalasyonServisi>;
