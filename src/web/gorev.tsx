// Task ortak parçaları: izinli durum geçişleri (görüntüleme için), kabul zinciri adımları,
// Task ayrıntı paneli (drawer), ret / blok / iptal / yeni Task modalları.
// Yetki ve geçerlilik sunucuda denetlenir; buradaki kurallar yalnızca hangi düğmenin gösterileceğini seçer.
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, hataMesaji } from './api';
import { DURUM_ADI, gunFarki, msSure, ONCELIK_ADI, ONCELIKLER, tarihGoster } from './format';
import { useUygulama, useVeri, type Uygulama } from './uygulama';
import { Avatar, Drawer, DurumPill, EkipAvatar, HataKutusu, Ikon, Modal, OncelikPill, Stepper, Termin, Yukleniyor, type Adim } from './ui';
import type { DurumGecmisi, KabulAdimGorunumu, KabulZinciri, TaskDurum, TaskGorunumu, TaskOncelik } from './types';

/* ---------- durum geçişleri ---------- */

/** Durum makinesindeki olası hedefler (sunucudaki GECISLER ile aynı). */
const SONRAKI: Partial<Record<TaskDurum, TaskDurum[]>> = {
  TASLAK: ['IPTAL'],
  KABUL_BEKLIYOR: ['IPTAL'],
  KABUL_EDILDI: ['DEVAM_EDIYOR', 'BLOKLU', 'TAMAMLANDI', 'IPTAL'],
  DEVAM_EDIYOR: ['BLOKLU', 'TAMAMLANDI', 'IPTAL'],
  BLOKLU: ['DEVAM_EDIYOR', 'TAMAMLANDI', 'IPTAL'],
  TAMAMLANDI: ['DEVAM_EDIYOR'],
};

/** Durum değiştirme yetkisinin istemci tahmini: TAM (Assignee, Ekip üyesi, yönetici, Direktör) / IPTAL (yalnızca Requester). */
export function durumYetkisi(u: Uygulama, t: TaskGorunumu): 'TAM' | 'IPTAL' | null {
  if (u.direktor) return 'TAM';
  if (t.assigneeKullaniciId === u.ben.id) return 'TAM';
  if (t.assigneeEkipId && (u.ben.ekipIds.includes(t.assigneeEkipId) || u.yonetilenEkipIds.has(t.assigneeEkipId))) return 'TAM';
  if (t.assigneeKullaniciId && t.ekipId && u.yonetilenEkipIds.has(t.ekipId)) return 'TAM';
  return t.requesterId === u.ben.id ? 'IPTAL' : null;
}

/** Bu kullanıcıya gösterilecek durum geçişleri. Kabul Bekliyor / Taslak'ta yalnızca Requester iptal eder. */
export function izinliGecisler(u: Uygulama, t: TaskGorunumu): TaskDurum[] {
  const yetki = durumYetkisi(u, t);
  if (!yetki) return [];
  if (t.durum === 'KABUL_BEKLIYOR' || t.durum === 'TASLAK') return t.requesterId === u.ben.id ? ['IPTAL'] : [];
  const hedefler = SONRAKI[t.durum] ?? [];
  return yetki === 'IPTAL' ? hedefler.filter((d) => d === 'IPTAL') : hedefler;
}

export const gecisEtiketi = (eski: TaskDurum, yeni: TaskDurum) =>
  eski === 'TAMAMLANDI' && yeni === 'DEVAM_EDIYOR' ? 'Yeniden aç' : yeni === 'IPTAL' ? 'İptal et' : DURUM_ADI[yeni];

/* ---------- kabul zinciri ---------- */

const DIREKT_NEDEN: Record<string, string> = {
  SELF_ASSIGN: 'Self-assign, otomatik kabul',
  UST_YONETICI: 'Üst yöneticiden geldi, direkt kabul',
  SORUMLU_YONETICI: 'Sorumlu yöneticiden geldi, direkt kabul',
  REQUESTER_VE_ONAYLAYICI: 'Requester aynı zamanda onaylayıcı, direkt kabul',
};

/** Ret gerekçesi biçimi: "<neden>: <açıklama>". */
export const RET_NEDENLERI = ['Kapsam dışı', 'Kapasite yetersiz', 'Eksik bilgi', 'Yanlış Ekip', 'Diğer'];
export function gerekceAyir(g: string | null): { neden: string | null; aciklama: string } {
  if (!g) return { neden: null, aciklama: '' };
  const n = RET_NEDENLERI.find((r) => g.startsWith(`${r}: `));
  return n ? { neden: n, aciklama: g.slice(n.length + 2) } : { neden: null, aciklama: g };
}

const sonDeneme = (z: KabulZinciri) => Math.max(0, ...z.adimlar.map((a) => a.deneme));
/** Güncel denemede karar bekleyen adım. */
export const aktifAdim = (z: KabulZinciri | undefined | null) => {
  if (!z) return undefined;
  const d = sonDeneme(z);
  return z.adimlar.find((a) => a.deneme === d && a.karar === 'BEKLIYOR' && a.baslangic);
};
export const sonRet = (z: KabulZinciri | undefined | null): KabulAdimGorunumu | undefined =>
  z ? [...z.adimlar].reverse().find((a) => a.karar === 'RET') : undefined;

export function onaylayiciyim(u: Uygulama, t: TaskGorunumu, z: KabulZinciri | undefined | null) {
  return t.durum === 'KABUL_BEKLIYOR' && !!aktifAdim(z)?.onaylayicilar.includes(u.ben.id);
}

function adimaCevir(u: Uygulama, t: TaskGorunumu, a: KabulAdimGorunumu): Adim {
  const siz = (id: string) => (id === u.ben.id ? `${u.kisiAdi(id)} (siz)` : u.kisiAdi(id));
  if (a.tur === 'DIREKT') return { kim: u.assigneeAdi(t), durum: 'ok', etiket: DIREKT_NEDEN[a.not ?? ''] ?? 'Direkt kabul' };
  const tur = a.tur === 'ASSIGNEE' ? 'Assignee kabulü' : 'Sorumlu yönetici kabulü';
  const kim = a.kararVerenId ? siz(a.kararVerenId) : a.onaylayicilar.map(siz).join(', ') || '—';
  if (a.karar === 'KABUL' || a.karar === 'OTOMATIK')
    return { kim, durum: 'ok', etiket: `${tur}${a.kararZamani ? ` · ${tarihGoster(a.kararZamani)}` : ''}` };
  if (a.karar === 'RET') return { kim, durum: 'no', etiket: `Reddetti${a.kararZamani ? ` · ${tarihGoster(a.kararZamani)}` : ''}` };
  if (a.baslangic) return { kim, durum: 'wait', etiket: `${tur} bekleniyor` };
  return { kim, durum: 'todo', etiket: `${tur} · sırada` };
}

/** Zincir: denemelere göre adım listeleri (son deneme ilk). Her biri Requester ile başlar. */
export function zincirAdimlari(u: Uygulama, t: TaskGorunumu, z: KabulZinciri): Adim[][] {
  const denemeler = [...new Set(z.adimlar.map((a) => a.deneme))].sort((a, b) => b - a);
  return denemeler.map((d) => {
    const adimlar = z.adimlar.filter((a) => a.deneme === d).sort((a, b) => a.sira - b.sira);
    const req = adimlar[0]?.requesterId ?? t.requesterId;
    return [{ kim: req === u.ben.id ? `${u.kisiAdi(req)} (siz)` : u.kisiAdi(req), durum: 'ok' as const, etiket: 'Requester' }, ...adimlar.map((a) => adimaCevir(u, t, a))];
  });
}

export function ZincirGorunumu({ t, z }: { t: TaskGorunumu; z: KabulZinciri | null | undefined }) {
  const u = useUygulama();
  if (!z) return null;
  if (!z.adimlar.length) return <p className="hint">Kabul kaydı yok.</p>;
  const [guncel, ...onceki] = zincirAdimlari(u, t, z);
  return (
    <>
      <Stepper adimlar={guncel!} />
      {onceki.map((a, i) => (
        <div key={i} className="chain-old">
          <p className="chain-label">Önceki atama #{onceki.length - i}</p>
          <Stepper adimlar={a} />
        </div>
      ))}
    </>
  );
}

/* ---------- işlemler ---------- */

/** Task işlemleri + modalları. Dönen `modal` öğesi bileşende çizilmeli. */
export function useTaskIslemleri() {
  const u = useUygulama();
  const [modal, setModal] = useState<ReactNode>(null);
  const [mesgul, setMesgul] = useState(false);
  const kapat = () => setModal(null);

  async function calistir<T>(fn: () => Promise<T>, basari: (r: T) => string): Promise<boolean> {
    setMesgul(true);
    try {
      const r = await fn();
      u.bildir(basari(r));
      return true;
    } catch (e) {
      u.hata(e);
      return false;
    } finally {
      setMesgul(false);
      u.yenile();
    }
  }

  const kabulEt = (t: TaskGorunumu) =>
    calistir(
      () => api<TaskGorunumu>(`/kabul/tasks/${t.id}/kabul`, { method: 'POST' }),
      (r) => (r.durum === 'KABUL_EDILDI' ? `“${t.baslik}” kabul edildi` : 'Kabulünüz kaydedildi. Sıradaki onay bekleniyor.'),
    );

  const reddet = (t: TaskGorunumu) =>
    setModal(
      <RetModal
        t={t}
        onKapat={kapat}
        onGonder={async (gerekce) => {
          const ok = await calistir(() => api(`/kabul/tasks/${t.id}/ret`, { body: { gerekce } }), () => `“${t.baslik}” reddedildi, ${u.kisiAdi(t.requesterId)} bilgilendirildi`);
          if (ok) kapat();
        }}
      />,
    );

  const durumDegistir = (t: TaskGorunumu, durum: TaskDurum) => {
    if (durum === 'BLOKLU')
      return setModal(
        <BlokModal
          t={t}
          onKapat={kapat}
          onGonder={async (neden) => {
            const ok = await calistir(() => api(`/tasks/${t.id}/durum`, { body: { durum, neden } }), () => `“${t.baslik}” Bloklu`);
            if (ok) kapat();
          }}
        />,
      );
    if (durum === 'IPTAL')
      return setModal(
        <OnayModal
          baslik="Task'ı iptal et"
          alt={t.baslik}
          metin="İptal edilen Task yeniden açılamaz. Kayıt silinmez, tarihçede kalır."
          eylem="İptal et"
          onKapat={kapat}
          onOnay={async () => {
            const ok = await calistir(() => api(`/tasks/${t.id}/durum`, { body: { durum } }), () => `“${t.baslik}” iptal edildi`);
            if (ok) kapat();
          }}
        />,
      );
    return calistir(() => api(`/tasks/${t.id}/durum`, { body: { durum } }), () => `“${t.baslik}” → ${DURUM_ADI[durum]}`);
  };

  const retIptal = (t: TaskGorunumu) =>
    setModal(
      <OnayModal
        baslik="Reddedilen Task'ı iptal et"
        alt={t.baslik}
        metin="Task İptal olur ve kapanır. Kayıt ve ret gerekçesi tarihçede kalır."
        eylem="İptal et"
        onKapat={kapat}
        onOnay={async () => {
          const ok = await calistir(() => api(`/kabul/tasks/${t.id}/iptal`, { method: 'POST' }), () => `“${t.baslik}” iptal edildi`);
          if (ok) kapat();
        }}
      />,
    );

  const gonder = (t: TaskGorunumu) =>
    calistir(() => api<TaskGorunumu>(`/tasks/${t.id}/gonder`, { method: 'POST' }), (r) => `“${t.baslik}” gönderildi · ${DURUM_ADI[r.durum]}`);

  return { kabulEt, reddet, durumDegistir, retIptal, gonder, modal, mesgul };
}

/* ---------- modallar ---------- */

export function RetModal(p: { t: TaskGorunumu; onKapat: () => void; onGonder: (gerekce: string) => Promise<void> }) {
  const u = useUygulama();
  const [neden, setNeden] = useState(RET_NEDENLERI[0]!);
  const [aciklama, setAciklama] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const gonder = async (e: FormEvent) => {
    e.preventDefault();
    if (!aciklama.trim()) return;
    setGonderiliyor(true);
    await p.onGonder(`${neden}: ${aciklama.trim()}`);
    setGonderiliyor(false);
  };
  return (
    <Modal baslik="Task'ı reddet" alt={p.t.baslik} onKapat={p.onKapat}>
      <form className="form" onSubmit={gonder}>
        <div className="field">
          <span className="lab" id="ret-neden">Ret gerekçesi</span>
          <div className="reasons" role="group" aria-labelledby="ret-neden">
            {RET_NEDENLERI.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={r === neden} onClick={() => setNeden(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="ret-aciklama">Açıklama (zorunlu)</label>
          <textarea id="ret-aciklama" required value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Requester bu açıklamayı görecek" />
        </div>
        <div className="banner info">
          {Ikon.info}
          <div>Task “Reddedildi” olur, {u.kisiAdi(p.t.requesterId)} bilgilendirilir; yeniden atayabilir veya iptal edebilir. Karar denetim izine yazılır.</div>
        </div>
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={p.onKapat}>
            Vazgeç
          </button>
          <button className="btn bad" type="submit" disabled={!aciklama.trim() || gonderiliyor}>
            Reddet
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function BlokModal(p: { t: TaskGorunumu; onKapat: () => void; onGonder: (neden: string) => Promise<void> }) {
  const [neden, setNeden] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  return (
    <Modal baslik="Task'ı blokla" alt={p.t.baslik} onKapat={p.onKapat}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!neden.trim()) return;
          setGonderiliyor(true);
          await p.onGonder(neden.trim());
          setGonderiliyor(false);
        }}
      >
        <div className="field">
          <label htmlFor="blok-neden">Neden bloklu? (zorunlu)</label>
          <textarea id="blok-neden" required value={neden} onChange={(e) => setNeden(e.target.value)} placeholder="ör. Bakım penceresi onayı bekleniyor (CR-4471)" />
        </div>
        <p className="hint">Blok süresi bu andan itibaren ölçülür ve raporlarda görünür. Requester ve yönetici bilgilendirilir.</p>
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={p.onKapat}>
            Vazgeç
          </button>
          <button className="btn primary" type="submit" disabled={!neden.trim() || gonderiliyor}>
            Blokla
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function OnayModal(p: { baslik: string; alt?: string; metin: ReactNode; eylem: string; onKapat: () => void; onOnay: () => Promise<void> | void }) {
  const [gonderiliyor, setGonderiliyor] = useState(false);
  return (
    <Modal baslik={p.baslik} alt={p.alt} onKapat={p.onKapat}>
      <p className="sub" style={{ margin: 0 }}>
        {p.metin}
      </p>
      <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={p.onKapat} autoFocus>
          Vazgeç
        </button>
        <button
          className="btn bad"
          disabled={gonderiliyor}
          onClick={async () => {
            setGonderiliyor(true);
            await p.onOnay();
            setGonderiliyor(false);
          }}
        >
          {p.eylem}
        </button>
      </div>
    </Modal>
  );
}

/** Yeni Task veya reddedilen Task'ı yeniden atama formu. */
export function TaskFormModal(p: { yenidenAtanan?: TaskGorunumu; onKapat: () => void }) {
  const u = useUygulama();
  const re = p.yenidenAtanan;
  const [hedef, setHedef] = useState(re ? (re.assigneeEkipId ? `e:${re.assigneeEkipId}` : `k:${re.assigneeKullaniciId}`) : `k:${u.ben.id}`);
  const [bitis, setBitis] = useState(re?.bitisTarihi ? re.bitisTarihi.slice(0, 10) : '');
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const rehber = u.rehber;

  const kaydet = async (form: HTMLFormElement, taslak: boolean) => {
    const f = new FormData(form);
    const [tur, id] = hedef.split(':');
    const atama = tur === 'e' ? { assigneeEkipId: id } : { assigneeKullaniciId: id };
    setGonderiliyor(true);
    setHata(null);
    try {
      const r = re
        ? await api<TaskGorunumu>(`/kabul/tasks/${re.id}/yeniden-ata`, { body: { ...atama, oncelik: f.get('oncelik'), bitisTarihi: bitis || null } })
        : await api<TaskGorunumu>('/tasks', {
            body: {
              baslik: String(f.get('baslik') ?? '').trim(),
              aciklama: String(f.get('aciklama') ?? '').trim() || null,
              oncelik: f.get('oncelik'),
              bitisTarihi: bitis || null,
              etiketler: String(f.get('etiketler') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
              hariciRef: String(f.get('hariciRef') ?? '').trim() || null,
              ...atama,
              taslak,
            },
          });
      u.bildir(re ? `“${r.baslik}” yeniden gönderildi · ${DURUM_ADI[r.durum]}` : `“${r.baslik}” oluşturuldu · ${DURUM_ADI[r.durum]}`);
      u.yenile();
      p.onKapat();
    } catch (e) {
      setHata(hataMesaji(e));
      setGonderiliyor(false);
    }
  };

  const gecmisTarih = !!bitis && gunFarki(bitis) < 0;
  return (
    <Modal baslik={re ? 'Yeniden ata' : 'Yeni Task'} alt={re ? re.baslik : 'Kabul akışı, seçtiğiniz Assignee\'ye göre sunucuda belirlenir'} onKapat={p.onKapat}>
      {!rehber ? (
        <Yukleniyor />
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            kaydet(e.currentTarget, false);
          }}
        >
          {!re && (
            <>
              <div className="field">
                <label htmlFor="n-baslik">Başlık</label>
                <input id="n-baslik" name="baslik" required placeholder="ör. DMZ'de açık RDP portunun kapatılması" />
              </div>
              <div className="field">
                <label htmlFor="n-aciklama">Açıklama</label>
                <textarea id="n-aciklama" name="aciklama" placeholder="Ne yapılmalı, neden önemli, kabul kriteri" />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="n-hedef">Assignee (kişi veya Ekip)</label>
            <select id="n-hedef" value={hedef} onChange={(e) => setHedef(e.target.value)}>
              <optgroup label="Kişiler">
                {[...rehber.kullanicilar]
                  .sort((a, b) => (a.id === u.ben.id ? -1 : b.id === u.ben.id ? 1 : a.ad.localeCompare(b.ad, 'tr')))
                  .map((k) => (
                    <option key={k.id} value={`k:${k.id}`}>
                      {k.id === u.ben.id ? 'Kendim · ' : ''}
                      {k.ad} · {k.ekipler.length ? k.ekipler.map((e) => e.kod).join(', ') : (k.unvan ?? '')}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Ekipler">
                {rehber.ekipler.map((e) => (
                  <option key={e.id} value={`e:${e.id}`}>
                    {e.kod} · {e.ad}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="banner info">
            {Ikon.info}
            <div>
              {hedef === `k:${u.ben.id}`
                ? 'Self-assign: onay gerekmez, Task hemen kabul edilmiş olur.'
                : 'Üst yöneticiden kendi Çalışanına atama direkt kabul edilir. Diğer atamalarda Assignee, gerekirse Ekibin Sorumlu yöneticisi kabul eder.'}
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="n-oncelik">Öncelik</label>
              <select id="n-oncelik" name="oncelik" defaultValue={re?.oncelik ?? 'ORTA'}>
                {ONCELIKLER.map((o) => (
                  <option key={o} value={o}>
                    {ONCELIK_ADI[o as TaskOncelik]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="n-bitis">Bitiş tarihi (boş = Backlog)</label>
              <input id="n-bitis" type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
            </div>
          </div>
          {gecmisTarih && <p className="inline-err">Bitiş tarihi geçmişte; Task oluşur oluşmaz gecikmiş görünür.</p>}
          {!re && (
            <div className="row2">
              <div className="field">
                <label htmlFor="n-etiket">Etiketler</label>
                <input id="n-etiket" name="etiketler" placeholder="virgülle ayırın: olay, EDR" />
              </div>
              <div className="field">
                <label htmlFor="n-ref">Harici referans</label>
                <input id="n-ref" name="hariciRef" placeholder="SIEM / ITSM kayıt no" />
              </div>
            </div>
          )}
          {hata && <HataKutusu mesaj={hata} />}
          <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={p.onKapat}>
              Vazgeç
            </button>
            {!re && (
              <button
                type="button"
                className="btn"
                disabled={gonderiliyor}
                onClick={(e) => {
                  const f = e.currentTarget.form!;
                  if (f.reportValidity()) kaydet(f, true);
                }}
              >
                Taslak kaydet
              </button>
            )}
            <button className="btn primary" type="submit" disabled={gonderiliyor}>
              {re ? 'Yeniden gönder' : 'Task oluştur'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ---------- Task ayrıntısı ---------- */

export function TaskDrawer({ id, onKapat }: { id: string; onKapat: () => void }) {
  const task = useVeri<TaskGorunumu>(`/tasks/${id}`);
  const zincir = useVeri<KabulZinciri>(`/kabul/tasks/${id}/zincir`);
  const gecmis = useVeri<DurumGecmisi>(`/tasks/${id}/gecmis`);
  const islem = useTaskIslemleri();
  const t = task.veri;

  return (
    <Drawer
      etiket="Task ayrıntısı"
      onKapat={onKapat}
      baslik={
        t ? (
          <>
            <OncelikPill o={t.oncelik} />
            <DurumPill d={t.durum} />
          </>
        ) : (
          <b>Task</b>
        )
      }
    >
      {task.hata && <HataKutusu mesaj={task.hata} />}
      {!t && !task.hata && <Yukleniyor />}
      {t && <TaskAyrinti t={t} zincir={zincir.veri} gecmis={gecmis.veri} islem={islem} />}
      {islem.modal}
    </Drawer>
  );
}

function TaskAyrinti({ t, zincir, gecmis, islem }: { t: TaskGorunumu; zincir: KabulZinciri | null; gecmis: DurumGecmisi | null; islem: ReturnType<typeof useTaskIslemleri> }) {
  const u = useUygulama();
  const benim = onaylayiciyim(u, t, zincir);
  const gecisler = izinliGecisler(u, t);
  const requesterim = t.requesterId === u.ben.id;
  const ret = sonRet(zincir);
  const retG = gerekceAyir(ret?.gerekce ?? null);
  const sonBlok = gecmis ? [...gecmis.gecisler].reverse().find((g) => g.yeni === 'BLOKLU') : undefined;
  const aktif = aktifAdim(zincir);
  const herhangiEylem = benim || gecisler.length > 0 || (t.durum === 'TASLAK' && requesterim) || (t.durum === 'REDDEDILDI' && requesterim);

  // Birleşik tarihçe: oluşturma + kabul kararları + durum geçişleri.
  const olaylar: Array<{ zaman: string; metin: string }> = [{ zaman: t.olusturma, metin: `${u.kisiAdi(t.requesterId)} oluşturdu, Assignee: ${u.assigneeAdi(t)}` }];
  for (const a of zincir?.adimlar ?? []) {
    if (a.tur === 'DIREKT') continue;
    if ((a.karar === 'KABUL' || a.karar === 'RET') && a.kararZamani)
      olaylar.push({ zaman: a.kararZamani, metin: `${u.kisiAdi(a.kararVerenId)} ${a.karar === 'KABUL' ? 'kabul etti' : `reddetti: ${a.gerekce ?? ''}`}` });
  }
  for (const g of gecmis?.gecisler ?? []) {
    if (g.eski === 'KABUL_BEKLIYOR' && (g.yeni === 'KABUL_EDILDI' || g.yeni === 'REDDEDILDI')) continue; // kabul kararında zaten var
    olaylar.push({ zaman: g.zaman, metin: `${u.kisiAdi(g.kullaniciId)}: ${g.eski ? DURUM_ADI[g.eski] : '—'} → ${DURUM_ADI[g.yeni]}${g.neden ? ` (${g.neden})` : ''}` });
  }
  olaylar.sort((a, b) => a.zaman.localeCompare(b.zaman));

  return (
    <>
      <div className="sec">
        <h3>{t.baslik}</h3>
        {t.aciklama ? <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{t.aciklama}</p> : <p className="hint">Açıklama girilmemiş.</p>}
      </div>
      {t.durum === 'BLOKLU' && (
        <div className="banner block">
          {Ikon.block}
          <div>
            <b>Bloklu{sonBlok ? ` · ${tarihGoster(sonBlok.zaman)} itibarıyla (${u.kisiAdi(sonBlok.kullaniciId)})` : ''}</b>
            <br />
            {sonBlok?.neden ?? 'Neden yükleniyor…'}
          </div>
        </div>
      )}
      {t.durum === 'REDDEDILDI' && ret && (
        <div className="banner rej">
          {Ikon.block}
          <div>
            <b>
              {u.kisiAdi(ret.kararVerenId)} reddetti{retG.neden ? ` · ${retG.neden}` : ''}
            </b>
            <br />
            {retG.aciklama}
            {requesterim && <div className="hint" style={{ marginTop: 4 }}>Yeniden atayabilir veya iptal edebilirsiniz.</div>}
          </div>
        </div>
      )}
      {benim && (
        <div className="banner wait">
          {Ikon.clock}
          <div>
            <b>Kararınız bekleniyor.</b> {aktif?.tur === 'SORUMLU' ? 'Ekibin Sorumlu yöneticisi olarak' : 'Assignee olarak'} kabul edin veya gerekçeyle reddedin.
          </div>
        </div>
      )}
      {herhangiEylem ? (
        <div className="appr-actions">
          {benim && (
            <>
              <button className="btn good sm" disabled={islem.mesgul} onClick={() => islem.kabulEt(t)}>
                {Ikon.check} Kabul et
              </button>
              <button className="btn bad sm" disabled={islem.mesgul} onClick={() => islem.reddet(t)}>
                {Ikon.x} Reddet
              </button>
            </>
          )}
          {t.durum === 'TASLAK' && requesterim && (
            <button className="btn primary sm" disabled={islem.mesgul} onClick={() => islem.gonder(t)}>
              Gönder
            </button>
          )}
          {t.durum === 'REDDEDILDI' && requesterim && (
            <>
              <button className="btn primary sm" onClick={() => u.yenidenAta(t)}>
                Yeniden ata
              </button>
              <button className="btn sm" onClick={() => islem.retIptal(t)}>
                İptal et
              </button>
            </>
          )}
          {gecisler.map((d) => (
            <button key={d} className={`btn sm ${d === 'IPTAL' ? 'bad' : ''}`} disabled={islem.mesgul} onClick={() => islem.durumDegistir(t, d)}>
              {gecisEtiketi(t.durum, d)}
            </button>
          ))}
        </div>
      ) : (
        <p className="lock">
          {Ikon.lock} Bu Task'ı görüntüleyebilirsiniz. Durumu Assignee ve yöneticileri değiştirir.
        </p>
      )}
      <div className="sec">
        <h2>Kabul akışı</h2>
        {zincir ? <ZincirGorunumu t={t} z={zincir} /> : <Yukleniyor />}
      </div>
      <dl className="meta">
        <dt>Requester</dt>
        <dd>
          <Avatar ad={u.kisiAdi(t.requesterId)} /> {u.kisiAdi(t.requesterId)}
        </dd>
        <dt>Assignee</dt>
        <dd>
          {t.assigneeEkipId ? <EkipAvatar kod={u.ekipKodu(t.assigneeEkipId)} /> : <Avatar ad={u.assigneeAdi(t)} />} {u.assigneeAdi(t)}
        </dd>
        <dt>Ekip</dt>
        <dd>{t.ekipId ? <span className="tag team">{u.ekipKodu(t.ekipId)}</span> : <span className="hint">—</span>}</dd>
        <dt>Bitiş</dt>
        <dd>
          <Termin t={t} />
        </dd>
        <dt>Etiketler</dt>
        <dd>{t.etiketler.length ? t.etiketler.map((e) => <span key={e} className="tag">{e}</span>) : <span className="hint">—</span>}</dd>
        <dt>Harici referans</dt>
        <dd className="mono">{t.hariciRef || '—'}</dd>
        <dt>Oluşturma</dt>
        <dd>{tarihGoster(t.olusturma)}</dd>
        {gecmis && gecmis.blokSuresiMs > 0 && (
          <>
            <dt>Toplam blok süresi</dt>
            <dd>{msSure(gecmis.blokSuresiMs)}</dd>
          </>
        )}
      </dl>
      <div className="sec">
        <h2>Tarihçe</h2>
        <ul className="timeline">
          {olaylar.map((o, i) => (
            <li key={i}>
              <time>{tarihGoster(o.zaman)}</time>
              {o.metin}
            </li>
          ))}
        </ul>
        <p className="hint">Kayıtlar yalnızca eklenir, silinmez.</p>
      </div>
    </>
  );
}
