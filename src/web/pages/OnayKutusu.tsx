// Onay kutusu (GLOSSARY: Bekleyen işlerim): kabul bekleyen Task'lar, iç etkinlik davetleri ve
// Requester olarak karar vermeniz gereken reddedilmiş Task'lar.
import { api } from '../api';
import { tarihGoster } from '../format';
import { gerekceAyir, sonRet, useTaskIslemleri, ZincirGorunumu } from '../gorev';
import { useCokluVeri, useUygulama, useVeri } from '../uygulama';
import { Bos, Ikon, OncelikPill, Termin, Yukleniyor } from '../ui';
import type { BekleyenIs, KabulZinciri, TaskGorunumu } from '../types';
import type { BekleyenDavet } from '../../server/modules/etkinlik';

export interface KabulOgesi {
  is: BekleyenIs;
  task: TaskGorunumu | undefined;
  zincir: KabulZinciri | undefined;
}

/**
 * Onay kutusunda kartı olan bekleyen iş türleri. Rozet sayısı da yalnızca bunları sayar; yeni bir tür
 * (ör. DELEGASYON, EKIP_HAVUZU) için kart grubu eklerken buraya da ekleyin.
 */
export const GOSTERILEN_BEKLEYEN: ReadonlySet<BekleyenIs['tur']> = new Set(['TASK_KABUL', 'ETKINLIK_DAVETI']);

/** Onay kutusunun verisi (Genel Bakış da kullanır). */
export function useOnayOgeleri() {
  const u = useUygulama();
  const kabulIsleri = (u.bekleyen ?? []).filter((b) => b.tur === 'TASK_KABUL');
  const reddedilenler = (u.tasklar ?? []).filter((t) => t.durum === 'REDDEDILDI' && t.requesterId === u.ben.id);
  const eksik = kabulIsleri.filter((b) => !u.tasklar?.some((t) => t.id === b.id)).map((b) => `/tasks/${b.id}`);
  const ekTasklar = useCokluVeri<TaskGorunumu>(u.tasklar ? eksik : []);
  const zincirler = useCokluVeri<KabulZinciri>([...kabulIsleri.map((b) => b.id), ...reddedilenler.map((t) => t.id)].map((id) => `/kabul/tasks/${id}/zincir`));
  const kabuller: KabulOgesi[] = kabulIsleri.map((is) => ({
    is,
    task: u.tasklar?.find((t) => t.id === is.id) ?? ekTasklar[`/tasks/${is.id}`],
    zincir: zincirler[`/kabul/tasks/${is.id}/zincir`],
  }));
  return {
    yukleniyor: u.bekleyen === null,
    kabuller,
    davetler: (u.bekleyen ?? []).filter((b) => b.tur === 'ETKINLIK_DAVETI'),
    reddedilenler: reddedilenler.map((t) => ({ task: t, zincir: zincirler[`/kabul/tasks/${t.id}/zincir`] })),
  };
}

export function KabulKarti({ o, islem }: { o: KabulOgesi; islem: ReturnType<typeof useTaskIslemleri> }) {
  const u = useUygulama();
  const t = o.task;
  if (!t)
    return (
      <article className="appr">
        <div className="appr-title">{o.is.baslik}</div>
        <Yukleniyor />
      </article>
    );
  const reqEkip = u.rehber?.kullanicilar.find((k) => k.id === t.requesterId)?.ekipler.map((e) => e.kod).join(', ');
  return (
    <article className="appr">
      <div className="appr-top">
        <OncelikPill o={t.oncelik} />
        {t.assigneeEkipId && <span className="tag team">{u.ekipKodu(t.assigneeEkipId)}</span>}
        <Termin t={t} />
        <span className="hint">{tarihGoster(o.is.beklemeBaslangici)} tarihinden beri bekliyor</span>
      </div>
      <button className="appr-title" onClick={() => u.taskAc(t.id)}>
        {t.baslik}
      </button>
      <p className="appr-why">
        {u.kisiAdi(t.requesterId)}
        {reqEkip ? ` (${reqEkip})` : ''} talep etti · {o.is.neden}.
      </p>
      <ZincirGorunumu t={t} z={o.zincir} />
      <div className="appr-actions">
        <button className="btn good sm" disabled={islem.mesgul} onClick={() => islem.kabulEt(t)}>
          {Ikon.check} Kabul et
        </button>
        <button className="btn bad sm" disabled={islem.mesgul} onClick={() => islem.reddet(t)}>
          {Ikon.x} Reddet
        </button>
        <button className="btn ghost sm" onClick={() => u.taskAc(t.id)}>
          Ayrıntı
        </button>
      </div>
    </article>
  );
}

export function DavetKarti({ is, yer, olusturan }: { is: BekleyenIs; yer?: string | null; olusturan?: string }) {
  const u = useUygulama();
  const yanitla = async (yanit: 'KATILIYORUM' | 'KATILMIYORUM') => {
    try {
      await api(`/etkinlik/${is.id}/yanit`, { body: { yanit } });
      u.bildir(yanit === 'KATILIYORUM' ? 'Katılımınız kaydedildi' : 'Yanıtınız kaydedildi');
    } catch (e) {
      u.hata(e);
    }
    u.yenile();
  };
  return (
    <article className="appr">
      <div className="appr-top">
        <span className="ev-type int">İç etkinlik daveti</span>
        <span className="due">{tarihGoster(is.termin)}</span>
      </div>
      <div className="appr-title">{is.baslik}</div>
      <p className="appr-why">
        {olusturan ? `${olusturan} davet etti` : is.neden}
        {yer ? ` · ${yer}` : ''}
      </p>
      <div className="appr-actions">
        <button className="btn good sm" onClick={() => yanitla('KATILIYORUM')}>
          Katılıyorum
        </button>
        <button className="btn sm" onClick={() => yanitla('KATILMIYORUM')}>
          Katılmıyorum
        </button>
      </div>
    </article>
  );
}

export function OnayKutusuSayfasi() {
  const u = useUygulama();
  const { yukleniyor, kabuller, davetler, reddedilenler } = useOnayOgeleri();
  const davetDetay = useVeri<BekleyenDavet[]>(davetler.length ? '/etkinlik/bekleyen-davetler' : null);
  const islem = useTaskIslemleri();
  const toplam = kabuller.length + davetler.length + reddedilenler.length;

  return (
    <>
      <div className="head-row">
        <p className="sub">
          {u.yonetici
            ? 'Size ve yönettiğiniz Ekiplere gelen kabul bekleyen Task\'lar, etkinlik davetleri ve reddedilen Task\'larınız.'
            : 'Size gelen kabul bekleyen Task\'lar, etkinlik davetleri ve reddedilen Task\'larınız.'}{' '}
          Ret için gerekçe zorunludur ve denetim izine yazılır.
        </p>
      </div>
      {yukleniyor && <Yukleniyor />}
      {!yukleniyor && !toplam && (
        <Bos eylem={<button className="btn sm" onClick={() => u.git('gorevler')}>Task panosuna git</button>}>
          Bekleyen kararınız yok. Yeni bir atama geldiğinde burada ve bildirimlerde görünecek.
        </Bos>
      )}
      {kabuller.length > 0 && (
        <section className="group">
          <div className="group-head">
            <h2>Task kabulü</h2>
            <span className="badge">{kabuller.length}</span>
          </div>
          <p className="hint">Size veya Sorumlu yöneticisi olduğunuz Ekibe gelen, kabul ya da ret bekleyen Task'lar.</p>
          {kabuller.map((o) => (
            <KabulKarti key={o.is.id} o={o} islem={islem} />
          ))}
        </section>
      )}
      {davetler.length > 0 && (
        <section className="group">
          <div className="group-head">
            <h2>Etkinlik davetleri</h2>
            <span className="badge">{davetler.length}</span>
          </div>
          <p className="hint">İç etkinliklere katılım yanıtınız.</p>
          {davetler.map((d) => {
            const ek = davetDetay.veri?.find((x) => x.etkinlik.id === d.id)?.etkinlik;
            return <DavetKarti key={d.id} is={d} yer={ek?.yer} olusturan={ek ? u.kisiAdi(ek.olusturanId) : undefined} />;
          })}
        </section>
      )}
      {reddedilenler.length > 0 && (
        <section className="group">
          <div className="group-head">
            <h2>Reddedilen Task'larınız</h2>
            <span className="badge">{reddedilenler.length}</span>
          </div>
          <p className="hint">Requester olarak yeniden atayabilir veya iptal edebilirsiniz. Kayıtlar silinmez.</p>
          {reddedilenler.map(({ task: t, zincir }) => {
            const r = sonRet(zincir);
            const g = gerekceAyir(r?.gerekce ?? null);
            return (
              <article key={t.id} className="appr">
                <div className="appr-top">
                  <OncelikPill o={t.oncelik} />
                  <span className="st rej">Reddedildi</span>
                  <Termin t={t} />
                </div>
                <button className="appr-title" onClick={() => u.taskAc(t.id)}>
                  {t.baslik}
                </button>
                <p className="appr-why">
                  {r ? (
                    <>
                      {u.kisiAdi(r.kararVerenId)} reddetti{g.neden && <> · <b>{g.neden}</b></>}: {g.aciklama}
                    </>
                  ) : (
                    'Ret gerekçesi yükleniyor…'
                  )}
                </p>
                <div className="appr-actions">
                  <button className="btn primary sm" onClick={() => u.yenidenAta(t)}>
                    Yeniden ata
                  </button>
                  <button className="btn ghost sm" onClick={() => islem.retIptal(t)}>
                    İptal et
                  </button>
                  <button className="btn ghost sm" onClick={() => u.taskAc(t.id)}>
                    Ayrıntı
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {islem.modal}
    </>
  );
}
