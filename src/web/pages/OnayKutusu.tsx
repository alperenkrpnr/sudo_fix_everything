// Onay kutusu (GLOSSARY: Bekleyen işlerim): kabul bekleyen Task'lar (kendi, Vekil olarak, eskale edilen),
// delege edilen ve delege bekleyen Ekip Task'ları, iç etkinlik davetleri ve Requester olarak karar
// vermeniz gereken reddedilmiş Task'lar.
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { tarihGoster } from '../format';
import { gerekceAyir, sonRet, useTaskIslemleri, ZincirGorunumu } from '../gorev';
import { useCokluVeri, useUygulama, useVeri } from '../uygulama';
import { Bos, Ikon, OncelikPill, Termin, Yukleniyor } from '../ui';
import { VekaletModal, VekilBannerlari } from './Vekalet';
import type { BekleyenIs, EkipGelenKutusu, GelenKutusuKaydi, KabulZinciri, TaskGorunumu } from '../types';
import type { BekleyenDavet } from '../../server/modules/etkinlik';

export interface KabulOgesi {
  is: BekleyenIs;
  task: TaskGorunumu | undefined;
  zincir: KabulZinciri | undefined;
}

/**
 * Onay kutusunda kartı olan bekleyen iş türleri. Rozet sayısı da yalnızca bunları sayar; yeni bir tür
 * için kart grubu eklerken buraya da ekleyin.
 */
export const GOSTERILEN_BEKLEYEN: ReadonlySet<BekleyenIs['tur']> = new Set(['TASK_KABUL', 'ETKINLIK_DAVETI', 'DELEGASYON', 'EKIP_HAVUZU']);

/** Onay kutusunun verisi (Genel Bakış da kullanır). */
export function useOnayOgeleri() {
  const u = useUygulama();
  const bekleyen = u.bekleyen ?? [];
  const kabulIsleri = bekleyen.filter((b) => b.tur === 'TASK_KABUL');
  const delegeIsleri = bekleyen.filter((b) => b.tur === 'DELEGASYON');
  const reddedilenler = (u.tasklar ?? []).filter((t) => t.durum === 'REDDEDILDI' && t.requesterId === u.ben.id);
  const eksik = [...kabulIsleri, ...delegeIsleri].filter((b) => !u.tasklar?.some((t) => t.id === b.id)).map((b) => `/tasks/${b.id}`);
  const ekTasklar = useCokluVeri<TaskGorunumu>(u.tasklar ? eksik : []);
  const zincirler = useCokluVeri<KabulZinciri>([...kabulIsleri.map((b) => b.id), ...reddedilenler.map((t) => t.id)].map((id) => `/kabul/tasks/${id}/zincir`));
  const taskOf = (id: string) => u.tasklar?.find((t) => t.id === id) ?? ekTasklar[`/tasks/${id}`];
  const kabuller: KabulOgesi[] = kabulIsleri.map((is) => ({ is, task: taskOf(is.id), zincir: zincirler[`/kabul/tasks/${is.id}/zincir`] }));
  return {
    yukleniyor: u.bekleyen === null,
    kabuller,
    delegasyonlar: delegeIsleri.map((is) => ({ is, task: taskOf(is.id) })),
    havuzSayisi: bekleyen.filter((b) => b.tur === 'EKIP_HAVUZU').length,
    davetler: bekleyen.filter((b) => b.tur === 'ETKINLIK_DAVETI'),
    reddedilenler: reddedilenler.map((t) => ({ task: t, zincir: zincirler[`/kabul/tasks/${t.id}/zincir`] })),
  };
}

const bekliyor = (zaman: string) => <span className="hint">{tarihGoster(zaman)} tarihinden beri bekliyor</span>;

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
        {o.is.grup === 'VEKIL' && o.is.adinaKullaniciId && <span className="warn-chip">{u.kisiAdi(o.is.adinaKullaniciId)} adına</span>}
        {o.is.grup === 'ESKALASYON' && <span className="st block">Eskale edildi</span>}
        <Termin t={t} />
        {bekliyor(o.is.beklemeBaslangici)}
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

/** Çalışan'a delege edilmiş, yanıt bekleyen Task. */
function DelegasyonKarti({ is, t, delegeEden, islem }: { is: BekleyenIs; t: TaskGorunumu | undefined; delegeEden?: string; islem: ReturnType<typeof useTaskIslemleri> }) {
  const u = useUygulama();
  return (
    <article className="appr">
      <div className="appr-top">
        {t && <OncelikPill o={t.oncelik} />}
        {t?.assigneeEkipId && <span className="tag team">{u.ekipKodu(t.assigneeEkipId)} havuzu</span>}
        {t && <Termin t={t} />}
        {bekliyor(is.beklemeBaslangici)}
      </div>
      <button className="appr-title" onClick={() => u.taskAc(is.id)}>
        {is.baslik}
      </button>
      <p className="appr-why">
        {delegeEden ? `${u.kisiAdi(delegeEden)} bu Task'ı size delege etti` : is.neden}. Kabul ederseniz Assignee siz olursunuz; uygun değilseniz gerekçeyle Ekip havuzuna iade
        edin.
      </p>
      {t ? (
        <div className="appr-actions">
          <button className="btn good sm" disabled={islem.mesgul} onClick={() => islem.delegasyonKabul(t)}>
            {Ikon.check} Kabul et
          </button>
          <button className="btn sm" disabled={islem.mesgul} onClick={() => islem.delegasyonRet(t)}>
            Ekip havuzuna iade et
          </button>
          <button className="btn ghost sm" onClick={() => u.taskAc(is.id)}>
            Ayrıntı
          </button>
        </div>
      ) : (
        <Yukleniyor />
      )}
    </article>
  );
}

/** Ekip havuzunda delege edilmeyi (veya delege edilen Çalışanın yanıtını) bekleyen Task. */
function HavuzKarti({ k, islem }: { k: GelenKutusuKaydi; islem: ReturnType<typeof useTaskIslemleri> }) {
  const u = useUygulama();
  const t = k.task;
  const d = k.delegasyon;
  return (
    <article className="appr">
      <div className="appr-top">
        <OncelikPill o={t.oncelik} />
        <span className="tag team">{k.ekipKod} havuzu</span>
        {d ? <span className="st wait">Delegasyon bekliyor</span> : <span className="st pool">Havuzda</span>}
        <Termin t={t} />
        {bekliyor(k.beklemeBaslangici)}
      </div>
      <button className="appr-title" onClick={() => u.taskAc(t.id)}>
        {t.baslik}
      </button>
      <p className="appr-why">
        {d ? (
          <>
            {u.kisiAdi(d.delegeEdenId)}, <b>{u.kisiAdi(d.calisanId)}</b> kişisine delege etti; yanıtı bekleniyor. Gerekirse başka bir üyeye yeniden delege edebilirsiniz.
          </>
        ) : (
          `${u.kisiAdi(t.requesterId)} bu işi ${k.ekipKod} Ekibine atadı. Bir Çalışana delege etmeniz bekleniyor.`
        )}
      </p>
      <div className="appr-actions">
        <button className={`btn sm ${d ? '' : 'primary'}`} disabled={islem.mesgul} onClick={() => islem.delegeEt(t, d?.calisanId)}>
          {d ? 'Yeniden delege et' : 'Delege et'}
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

function Grup({ baslik, adet, aciklama, sag, children }: { baslik: string; adet: number; aciklama: string; sag?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      <div className="group-head">
        <h2>{baslik}</h2>
        <span className="badge">{adet}</span>
        {sag && <span style={{ marginLeft: 'auto' }}>{sag}</span>}
      </div>
      <p className="hint">{aciklama}</p>
      {children}
    </section>
  );
}

export function OnayKutusuSayfasi() {
  const u = useUygulama();
  const { yukleniyor, kabuller, delegasyonlar, davetler, reddedilenler } = useOnayOgeleri();
  const davetDetay = useVeri<BekleyenDavet[]>(davetler.length ? '/etkinlik/bekleyen-davetler' : null);
  const delegeDetay = useVeri<Array<{ task: { id: string }; delegeEdenId: string }>>(delegasyonlar.length ? '/kabul/delegasyonlar/bekleyen' : null);
  const [ekipF, setEkipF] = useState('');
  const kutu = useVeri<EkipGelenKutusu>(u.yonetici || u.bekleyen?.some((b) => b.tur === 'EKIP_HAVUZU') ? `/kabul/gelen-kutusu${ekipF ? `?ekipId=${encodeURIComponent(ekipF)}` : ''}` : null);
  const [vekaletAcik, setVekaletAcik] = useState(false);
  const [eskalasyonMesgul, setEskalasyonMesgul] = useState(false);
  const islem = useTaskIslemleri();

  const kendi = kabuller.filter((o) => o.is.grup === 'KENDI');
  const vekil = kabuller.filter((o) => o.is.grup === 'VEKIL');
  const eskale = kabuller.filter((o) => o.is.grup === 'ESKALASYON');
  const havuz = (kutu.veri?.kayitlar ?? []).filter((k) => k.tur !== 'KABUL');
  const havuzBekleyen = havuz.filter((k) => k.tur === 'HAVUZ');
  const ekipler = kutu.veri?.ekipler ?? [];
  const toplam = kabuller.length + delegasyonlar.length + havuz.length + davetler.length + reddedilenler.length;

  const eskalasyonIsle = async () => {
    setEskalasyonMesgul(true);
    try {
      const r = await api<{ eskaleEdilen: number }>('/eskalasyon/isle', { method: 'POST' });
      u.bildir(r.eskaleEdilen ? `${r.eskaleEdilen} onay süresi dolduğu için eskale edildi` : 'Süresi dolan onay yok; eskale edilen olmadı');
    } catch (e) {
      u.hata(e);
    }
    setEskalasyonMesgul(false);
    u.yenile();
  };

  return (
    <>
      <div className="head-row">
        <p className="sub">
          {u.yonetici
            ? 'Size ve yönettiğiniz Ekiplere gelen kabul talepleri, delege bekleyen Ekip işleri, Vekil olarak üstlendikleriniz ve eskalasyonlar.'
            : 'Size gelen kabul bekleyen ve delege edilen Task\'lar, etkinlik davetleri ve reddedilen Task\'larınız.'}{' '}
          Ret için gerekçe zorunludur ve denetim izine yazılır.
        </p>
        <div className="appr-actions">
          {u.yonetici && (
            <button className="btn sm" onClick={() => setVekaletAcik(true)}>
              Vekalet
            </button>
          )}
          {u.direktor && (
            <button className="btn sm" disabled={eskalasyonMesgul} onClick={eskalasyonIsle} title="Süresinde karar verilmeyen kabul taleplerini üst yöneticiye taşır">
              Eskalasyonları işle
            </button>
          )}
        </div>
      </div>
      <VekilBannerlari />
      {yukleniyor && <Yukleniyor />}
      {!yukleniyor && !toplam && (
        <Bos eylem={<button className="btn sm" onClick={() => u.git('gorevler')}>Task panosuna git</button>}>
          Bekleyen kararınız yok. Yeni bir atama geldiğinde burada ve bildirimlerde görünecek.
        </Bos>
      )}
      {kendi.length > 0 && (
        <Grup baslik="Task kabulü" adet={kendi.length} aciklama="Size veya Sorumlu yöneticisi olduğunuz Ekibe gelen, kabul ya da ret bekleyen Task'lar.">
          {kendi.map((o) => (
            <KabulKarti key={o.is.id} o={o} islem={islem} />
          ))}
        </Grup>
      )}
      {vekil.length > 0 && (
        <Grup baslik="Vekil işleri" adet={vekil.length} aciklama="Vekalet süresince asil yönetici adına karar verirsiniz. Kararınız “X adına Y tarafından” olarak kaydedilir.">
          {vekil.map((o) => (
            <KabulKarti key={o.is.id} o={o} islem={islem} />
          ))}
        </Grup>
      )}
      {eskale.length > 0 && (
        <Grup baslik="Eskale edilenler" adet={eskale.length} aciklama="Süresinde karar verilmediği için size taşınan kabul talepleri. Asıl onaylayıcı da hâlâ karar verebilir.">
          {eskale.map((o) => (
            <KabulKarti key={o.is.id} o={o} islem={islem} />
          ))}
        </Grup>
      )}
      {delegasyonlar.length > 0 && (
        <Grup baslik="Size delege edilenler" adet={delegasyonlar.length} aciklama="Ekip yöneticinizin size yönlendirdiği Ekip Task'ları. Reddederseniz Task reddedilmez, Ekip havuzuna döner.">
          {delegasyonlar.map(({ is, task }) => (
            <DelegasyonKarti key={is.id} is={is} t={task} delegeEden={delegeDetay.veri?.find((d) => d.task.id === is.id)?.delegeEdenId} islem={islem} />
          ))}
        </Grup>
      )}
      {(havuz.length > 0 || ekipF) && (
        <Grup
          baslik="Delege bekleyen ekip task'ları"
          adet={havuzBekleyen.length}
          aciklama="Ekibinize atanmış ve kabul edilmiş, bir Çalışana delege edilmeyi bekleyen işler."
          sag={
            ekipler.length > 1 && (
              <select className="chip" aria-label="Ekip" value={ekipF} onChange={(e) => setEkipF(e.target.value)}>
                <option value="">Tüm Ekipler</option>
                {ekipler.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.kod}
                  </option>
                ))}
              </select>
            )
          }
        >
          {kutu.hata && <p className="inline-err">{kutu.hata}</p>}
          {havuz.map((k) => (
            <HavuzKarti key={k.task.id} k={k} islem={islem} />
          ))}
          {!havuz.length && !kutu.hata && <p className="hint">Bu Ekipte delege bekleyen Task yok.</p>}
        </Grup>
      )}
      {davetler.length > 0 && (
        <Grup baslik="Etkinlik davetleri" adet={davetler.length} aciklama="İç etkinliklere katılım yanıtınız.">
          {davetler.map((d) => {
            const ek = davetDetay.veri?.find((x) => x.etkinlik.id === d.id)?.etkinlik;
            return <DavetKarti key={d.id} is={d} yer={ek?.yer} olusturan={ek ? u.kisiAdi(ek.olusturanId) : undefined} />;
          })}
        </Grup>
      )}
      {reddedilenler.length > 0 && (
        <Grup baslik="Reddedilen Task'larınız" adet={reddedilenler.length} aciklama="Requester olarak yeniden atayabilir veya iptal edebilirsiniz. Kayıtlar silinmez.">
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
                      {r.adinaKullaniciId ? `${u.kisiAdi(r.adinaKullaniciId)} adına ${u.kisiAdi(r.kararVerenId)}` : u.kisiAdi(r.kararVerenId)} reddetti
                      {g.neden && <> · <b>{g.neden}</b></>}: {g.aciklama}
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
        </Grup>
      )}
      {islem.modal}
      {vekaletAcik && <VekaletModal onKapat={() => setVekaletAcik(false)} />}
    </>
  );
}
