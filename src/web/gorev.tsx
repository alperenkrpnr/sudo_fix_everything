// Task ortak parçaları: izinli durum geçişleri (görüntüleme için), kabul zinciri adımları,
// Task ayrıntı paneli (drawer), ret / blok / iptal / yeni Task modalları.
// Yetki ve geçerlilik sunucuda denetlenir; buradaki kurallar yalnızca hangi düğmenin gösterileceğini seçer.
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, dosyaIndir, dosyaYukle, hataMesaji } from './api';
import { DURUM_ADI, gunFarki, msSure, ONCELIK_ADI, ONCELIKLER, tarihGoster } from './format';
import { useUygulama, useVeri, type Uygulama } from './uygulama';
import { Avatar, Drawer, DurumPill, EkipAvatar, HataKutusu, Ikon, Modal, OncelikPill, Stepper, Termin, Yukleniyor, type Adim } from './ui';
import type { DurumGecmisi, EkipGelenKutusu, KabulAdimGorunumu, KabulZinciri, TaskDetayi, TaskDurum, TaskGorunumu, TaskOncelik } from './types';

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

/** Bu Task için çağıranın kabul kararı bekleniyor mu (asil onaylayıcı, Vekil veya eskalasyon hedefi olarak)? */
export function onaylayiciyim(u: Uygulama, t: TaskGorunumu, z: KabulZinciri | undefined | null) {
  if (t.durum !== 'KABUL_BEKLIYOR') return false;
  return !!aktifAdim(z)?.onaylayicilar.includes(u.ben.id) || !!u.bekleyen?.some((b) => b.tur === 'TASK_KABUL' && b.id === t.id);
}

/** "X adına Y" (Vekil kararı) veya yalnızca Y. */
export const adinaMetni = (u: Uygulama, kararVerenId: string | null, adinaKullaniciId: string | null) =>
  adinaKullaniciId ? `${u.kisiAdi(adinaKullaniciId)} adına ${u.kisiAdi(kararVerenId)}` : u.kisiAdi(kararVerenId);

function adimaCevir(u: Uygulama, t: TaskGorunumu, a: KabulAdimGorunumu): Adim {
  const siz = (id: string) => (id === u.ben.id ? `${u.kisiAdi(id)} (siz)` : u.kisiAdi(id));
  if (a.tur === 'DIREKT') return { kim: u.assigneeAdi(t), durum: 'ok', etiket: DIREKT_NEDEN[a.not ?? ''] ?? 'Direkt kabul' };
  const tur = a.tur === 'ASSIGNEE' ? 'Assignee kabulü' : 'Sorumlu yönetici kabulü';
  const kim = a.kararVerenId
    ? a.adinaKullaniciId
      ? `${u.kisiAdi(a.adinaKullaniciId)} adına ${siz(a.kararVerenId)}`
      : siz(a.kararVerenId)
    : a.onaylayicilar.map(siz).join(', ') || '—';
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

  /** Ekip havuzundaki Task'ı Ekip içinden bir Çalışan'a delege et (bekleyen delegasyon varsa yerine geçer). */
  const delegeEt = (t: TaskGorunumu, bekleyenCalisanId?: string | null) =>
    setModal(
      <DelegeModal
        t={t}
        bekleyenCalisanId={bekleyenCalisanId ?? null}
        onKapat={kapat}
        onGonder={async (calisanId) => {
          const ok = await calistir(() => api(`/kabul/tasks/${t.id}/delege`, { body: { calisanId } }), () => `“${t.baslik}”, ${u.kisiAdi(calisanId)} kişisine delege edildi`);
          if (ok) kapat();
        }}
      />,
    );

  const delegasyonKabul = (t: TaskGorunumu) =>
    calistir(() => api(`/kabul/tasks/${t.id}/delegasyon/kabul`, { method: 'POST' }), () => `“${t.baslik}” üzerinize alındı`);

  const delegasyonRet = (t: TaskGorunumu) =>
    setModal(
      <HavuzaIadeModal
        t={t}
        onKapat={kapat}
        onGonder={async (gerekce) => {
          const ok = await calistir(() => api(`/kabul/tasks/${t.id}/delegasyon/ret`, { body: { gerekce } }), () => `“${t.baslik}” Ekip havuzuna döndü`);
          if (ok) kapat();
        }}
      />,
    );

  return { kabulEt, reddet, durumDegistir, retIptal, gonder, delegeEt, delegasyonKabul, delegasyonRet, modal, mesgul };
}

/** Ekip havuzu Task'ı mı (Ekip'e atanmış, kabul edilmiş, henüz bir Çalışan'a geçmemiş)? */
export const havuzda = (t: TaskGorunumu) => !!t.assigneeEkipId && ['KABUL_EDILDI', 'DEVAM_EDIYOR', 'BLOKLU'].includes(t.durum);

export function DelegeModal(p: { t: TaskGorunumu; bekleyenCalisanId: string | null; onKapat: () => void; onGonder: (calisanId: string) => Promise<void> }) {
  const u = useUygulama();
  const ekipId = p.t.assigneeEkipId;
  const ekip = u.org?.unitler.flatMap((x) => x.ekipler).find((e) => e.id === ekipId);
  const uyeler = (ekip?.uyeler ?? []).filter((k) => k.id !== p.bekleyenCalisanId);
  const [secili, setSecili] = useState(uyeler[0]?.id ?? '');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const acikSayisi = (id: string) => (u.tasklar ?? []).filter((x) => x.assigneeKullaniciId === id && ['KABUL_EDILDI', 'DEVAM_EDIYOR', 'BLOKLU'].includes(x.durum)).length;
  return (
    <Modal baslik="Ekip üyesine delege et" alt={`${u.ekipKodu(ekipId)} havuzu · ${p.t.baslik}`} onKapat={p.onKapat}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!secili) return;
          setGonderiliyor(true);
          await p.onGonder(secili);
          setGonderiliyor(false);
        }}
      >
        {p.bekleyenCalisanId && (
          <div className="banner wait">
            {Ikon.clock}
            <div>
              {u.kisiAdi(p.bekleyenCalisanId)} henüz yanıt vermedi. Başka birine delege ederseniz bekleyen delegasyon geri alınır.
            </div>
          </div>
        )}
        {ekip?.uyeler === null || !ekip ? (
          <HataKutusu mesaj="Bu Ekibin üye listesini göremiyorsunuz." />
        ) : uyeler.length ? (
          <div className="field">
            <label htmlFor="del-kim">Kime</label>
            <select id="del-kim" value={secili} onChange={(e) => setSecili(e.target.value)}>
              {uyeler.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                  {k.unvan ? ` · ${k.unvan}` : ''} · {acikSayisi(k.id)} açık Task
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="hint">Ekipte delege edilebilecek başka üye yok.</p>
        )}
        <div className="banner info">
          {Ikon.info}
          <div>Yöneticiden kendi Ekibine atama olduğu için onay zinciri yoktur. Çalışan kabul edince Assignee olur; reddederse Task Ekip havuzuna döner.</div>
        </div>
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={p.onKapat}>
            Vazgeç
          </button>
          <button className="btn primary" type="submit" disabled={!secili || gonderiliyor}>
            Delege et
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Çalışan delege edilen Task'ı reddeder: gerekçe zorunlu, Task Ekip havuzuna döner (Reddedildi olmaz). */
export function HavuzaIadeModal(p: { t: TaskGorunumu; onKapat: () => void; onGonder: (gerekce: string) => Promise<void> }) {
  const u = useUygulama();
  const [neden, setNeden] = useState(RET_NEDENLERI[1]!);
  const [aciklama, setAciklama] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  return (
    <Modal baslik="Ekip havuzuna iade et" alt={p.t.baslik} onKapat={p.onKapat}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!aciklama.trim()) return;
          setGonderiliyor(true);
          await p.onGonder(`${neden}: ${aciklama.trim()}`);
          setGonderiliyor(false);
        }}
      >
        <div className="field">
          <span className="lab" id="iade-neden">Gerekçe</span>
          <div className="reasons" role="group" aria-labelledby="iade-neden">
            {RET_NEDENLERI.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={r === neden} onClick={() => setNeden(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="iade-aciklama">Açıklama (zorunlu)</label>
          <textarea id="iade-aciklama" required value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Delege eden yönetici bu açıklamayı görecek" />
        </div>
        <div className="banner info">
          {Ikon.info}
          <div>Task {u.ekipKodu(p.t.assigneeEkipId)} havuzuna döner ve Sorumlu yönetici yeniden delege eder. Task reddedilmiş olmaz.</div>
        </div>
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={p.onKapat}>
            Vazgeç
          </button>
          <button className="btn primary" type="submit" disabled={!aciklama.trim() || gonderiliyor}>
            İade et
          </button>
        </div>
      </form>
    </Modal>
  );
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

/** Yüklenebilir uzantılar (sunucudaki task-detay/ek.ts IZINLI_TURLER ile aynı; asıl denetim sunucuda). */
const EK_UZANTILARI = '.pdf,.png,.jpg,.jpeg,.gif,.txt,.log,.csv,.json,.docx,.xlsx,.pptx,.zip';

const boyutGoster = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const httpLink = (s: string) => /^https?:\/\//i.test(s);

export function TaskDrawer({ id, onKapat }: { id: string; onKapat: () => void }) {
  const u = useUygulama();
  const task = useVeri<TaskGorunumu>(`/tasks/${id}`);
  const zincir = useVeri<KabulZinciri>(`/kabul/tasks/${id}/zincir`);
  const gecmis = useVeri<DurumGecmisi>(`/tasks/${id}/gecmis`);
  const detay = useVeri<TaskDetayi>(`/tasks/${id}/detay`);
  const t = task.veri;
  // Havuzdaki Task için bekleyen delegasyon (kime gitti) yalnızca yöneticinin gelen kutusunda var.
  const kutu = useVeri<EkipGelenKutusu>(t && havuzda(t) && u.yonetici ? '/kabul/gelen-kutusu' : null);
  const islem = useTaskIslemleri();

  return (
    <Drawer
      etiket="Task ayrıntısı"
      onKapat={onKapat}
      baslik={
        t ? (
          <>
            <OncelikPill o={t.oncelik} />
            {havuzda(t) && t.durum === 'KABUL_EDILDI' ? <span className="st pool">Ekip Havuzu</span> : <DurumPill d={t.durum} />}
            {!t.bitisTarihi && <span className="kind">{Ikon.stack} Backlog</span>}
          </>
        ) : (
          <b>Task</b>
        )
      }
    >
      {task.hata && <HataKutusu mesaj={task.hata} />}
      {!t && !task.hata && <Yukleniyor />}
      {t && (
        <TaskAyrinti
          t={t}
          zincir={zincir.veri}
          gecmis={gecmis.veri}
          detay={detay.veri}
          detayHata={detay.hata}
          bekleyenDelegasyon={kutu.veri?.kayitlar.find((k) => k.task.id === t.id)?.delegasyon ?? null}
          islem={islem}
        />
      )}
      {islem.modal}
    </Drawer>
  );
}

function TaskAyrinti({
  t,
  zincir,
  gecmis,
  detay,
  detayHata,
  bekleyenDelegasyon,
  islem,
}: {
  t: TaskGorunumu;
  zincir: KabulZinciri | null;
  gecmis: DurumGecmisi | null;
  detay: TaskDetayi | null;
  detayHata: string | null;
  bekleyenDelegasyon: { calisanId: string; delegeEdenId: string; baslangic: string } | null;
  islem: ReturnType<typeof useTaskIslemleri>;
}) {
  const u = useUygulama();
  const benim = onaylayiciyim(u, t, zincir);
  const benimIs = u.bekleyen?.find((b) => b.tur === 'TASK_KABUL' && b.id === t.id);
  const gecisler = izinliGecisler(u, t);
  const requesterim = t.requesterId === u.ben.id;
  const ret = sonRet(zincir);
  const retG = gerekceAyir(ret?.gerekce ?? null);
  const sonBlok = gecmis ? [...gecmis.gecisler].reverse().find((g) => g.yeni === 'BLOKLU') : undefined;
  const aktif = aktifAdim(zincir);
  const banaDelege = !!u.bekleyen?.some((b) => b.tur === 'DELEGASYON' && b.id === t.id);
  const delegeEdebilirim = havuzda(t) && (u.yonetilenEkipIds.has(t.assigneeEkipId!) || !!u.bekleyen?.some((b) => b.tur === 'EKIP_HAVUZU' && b.id === t.id));
  const herhangiEylem =
    benim || banaDelege || delegeEdebilirim || gecisler.length > 0 || (t.durum === 'TASLAK' && requesterim) || (t.durum === 'REDDEDILDI' && requesterim);

  // Birleşik tarihçe: oluşturma + kabul kararları + durum geçişleri + yorumlar.
  type Olay = { zaman: string; metin: ReactNode; yorum?: boolean };
  const olaylar: Olay[] = [{ zaman: t.olusturma, metin: `${u.kisiAdi(t.requesterId)} oluşturdu, Assignee: ${u.assigneeAdi(t)}` }];
  for (const a of zincir?.adimlar ?? []) {
    if (a.tur === 'DIREKT') continue;
    if ((a.karar === 'KABUL' || a.karar === 'RET') && a.kararZamani) {
      const kim = a.adinaKullaniciId ? `${u.kisiAdi(a.adinaKullaniciId)} adına ${u.kisiAdi(a.kararVerenId)} tarafından` : u.kisiAdi(a.kararVerenId);
      olaylar.push({ zaman: a.kararZamani, metin: a.adinaKullaniciId ? `${a.karar === 'KABUL' ? 'Kabul edildi' : `Reddedildi: ${a.gerekce ?? ''}`} (${kim})` : `${kim} ${a.karar === 'KABUL' ? 'kabul etti' : `reddetti: ${a.gerekce ?? ''}`}` });
    }
  }
  const durumlar = detay ? detay.tarihce : (gecmis?.gecisler.map((g) => ({ ...g, tur: 'DURUM' as const })) ?? []);
  for (const k of durumlar) {
    if (k.tur === 'YORUM') {
      olaylar.push({
        zaman: k.zaman,
        yorum: true,
        metin: (
          <span className="cmt" style={{ marginTop: 4 }}>
            <Avatar ad={u.kisiAdi(k.kullaniciId)} />
            <span>
              <b>{u.kisiAdi(k.kullaniciId)}</b>
              <span className="txt" style={{ display: 'block', color: 'var(--fg)' }}>
                {k.metin}
              </span>
            </span>
          </span>
        ),
      });
      continue;
    }
    if (k.eski === 'KABUL_BEKLIYOR' && (k.yeni === 'KABUL_EDILDI' || k.yeni === 'REDDEDILDI')) continue; // kabul kararında zaten var
    olaylar.push({ zaman: k.zaman, metin: `${u.kisiAdi(k.kullaniciId)}: ${k.eski ? DURUM_ADI[k.eski] : '—'} → ${DURUM_ADI[k.yeni]}${k.neden ? ` (${k.neden})` : ''}` });
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
              {adinaMetni(u, ret.kararVerenId, ret.adinaKullaniciId)} reddetti{retG.neden ? ` · ${retG.neden}` : ''}
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
            <b>Kararınız bekleniyor.</b>{' '}
            {benimIs && benimIs.grup !== 'KENDI'
              ? `${benimIs.neden}.`
              : aktif?.tur === 'SORUMLU'
                ? 'Ekibin Sorumlu yöneticisi olarak kabul edin veya gerekçeyle reddedin.'
                : 'Assignee olarak kabul edin veya gerekçeyle reddedin.'}
          </div>
        </div>
      )}
      {banaDelege && (
        <div className="banner wait">
          {Ikon.clock}
          <div>
            <b>Bu Task size delege edildi.</b> Kabul ederseniz Assignee siz olursunuz; uygun değilseniz gerekçeyle {u.ekipKodu(t.assigneeEkipId)} havuzuna iade edin.
          </div>
        </div>
      )}
      {delegeEdebilirim && (
        <div className="banner info">
          {Ikon.info}
          <div>
            {bekleyenDelegasyon ? (
              <>
                <b>{u.kisiAdi(bekleyenDelegasyon.calisanId)} kişisine delege edildi,</b> yanıt bekleniyor ({tarihGoster(bekleyenDelegasyon.baslangic)}).
              </>
            ) : (
              <>
                <b>{u.ekipKodu(t.assigneeEkipId)} havuzunda.</b> Bu Task Ekibinize atandı; bir Çalışana delege edin.
              </>
            )}
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
          {banaDelege && (
            <>
              <button className="btn good sm" disabled={islem.mesgul} onClick={() => islem.delegasyonKabul(t)}>
                {Ikon.check} Kabul et
              </button>
              <button className="btn sm" disabled={islem.mesgul} onClick={() => islem.delegasyonRet(t)}>
                Ekip havuzuna iade et
              </button>
            </>
          )}
          {delegeEdebilirim && (
            <button className="btn primary sm" disabled={islem.mesgul} onClick={() => islem.delegeEt(t, bekleyenDelegasyon?.calisanId)}>
              {bekleyenDelegasyon ? 'Yeniden delege et' : 'Delege et'}
            </button>
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
          {t.assigneeEkipId && <span className="hint"> (Ekip havuzu)</span>}
        </dd>
        <dt>Ekip</dt>
        <dd>{t.ekipId ? <span className="tag team">{u.ekipKodu(t.ekipId)}</span> : <span className="hint">—</span>}</dd>
        <dt>Bitiş</dt>
        <dd>
          <Termin t={t} />
        </dd>
        <dt>Etiketler</dt>
        <dd>
          <EtiketDuzenle t={t} />
        </dd>
        <dt>Harici referans</dt>
        <dd>
          <RefDuzenle t={t} />
        </dd>
        <dt>Oluşturma</dt>
        <dd>{tarihGoster(t.olusturma)}</dd>
        {gecmis && gecmis.blokSuresiMs > 0 && (
          <>
            <dt>Toplam blok süresi</dt>
            <dd>{msSure(gecmis.blokSuresiMs)}</dd>
          </>
        )}
      </dl>
      {detayHata && <HataKutusu mesaj={detayHata} />}
      {detay && <AltTasklar t={t} detay={detay} />}
      {detay && <Ekler t={t} detay={detay} />}
      <div className="sec">
        <h2>Tarihçe ve yorumlar</h2>
        <ul className="timeline">
          {olaylar.map((o, i) => (
            <li key={i}>
              <time>{tarihGoster(o.zaman)}</time>
              {o.metin}
            </li>
          ))}
        </ul>
        <YorumFormu t={t} />
        <p className="hint">Kayıtlar yalnızca eklenir, silinmez.</p>
      </div>
    </>
  );
}

/** Ayrıntı yazma işlemleri: hata toast'ta, başarıda bağlı veriler yeniden çekilir. */
function useDetayIslemi() {
  const u = useUygulama();
  const [mesgul, setMesgul] = useState(false);
  const calistir = async (fn: () => Promise<unknown>, basari?: string) => {
    setMesgul(true);
    try {
      await fn();
      if (basari) u.bildir(basari);
      return true;
    } catch (e) {
      u.hata(e);
      return false;
    } finally {
      setMesgul(false);
      u.yenile();
    }
  };
  return { calistir, mesgul };
}

function AltTasklar({ t, detay }: { t: TaskGorunumu; detay: TaskDetayi }) {
  const { calistir, mesgul } = useDetayIslemi();
  const [yeni, setYeni] = useState('');
  const { tamamlanan, toplam } = detay.ilerleme;
  return (
    <div className="sec">
      <div className="panel-head">
        <h2>Alt task'lar</h2>
        <span className="hint mono">
          {tamamlanan}/{toplam}
        </span>
      </div>
      {toplam > 0 && (
        <div className="progress" title={`${tamamlanan}/${toplam} alt task`} role="progressbar" aria-valuemin={0} aria-valuemax={toplam} aria-valuenow={tamamlanan}>
          <i style={{ width: `${(tamamlanan / toplam) * 100}%` }} />
        </div>
      )}
      {toplam ? (
        <ul className="checks">
          {detay.altTasklar.map((a) => (
            <li key={a.id}>
              <label>
                <input
                  type="checkbox"
                  checked={a.tamamlandi}
                  disabled={mesgul}
                  onChange={(e) => calistir(() => api(`/tasks/alt-tasklar/${a.id}/tamamla`, { body: { tamamlandi: e.target.checked } }))}
                />
                <span>{a.baslik}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Alt task yok. Ortak işlerde her kişiye bir alt task açılabilir.</p>
      )}
      <form
        className="appr-actions"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!yeni.trim()) return;
          if (await calistir(() => api(`/tasks/${t.id}/alt-tasklar`, { body: { baslik: yeni.trim() } }), 'Alt task eklendi')) setYeni('');
        }}
      >
        <label htmlFor="alt-yeni" className="sr-only">
          Yeni alt task
        </label>
        <input id="alt-yeni" className="inline-in" style={{ flex: 1 }} value={yeni} onChange={(e) => setYeni(e.target.value)} placeholder="Alt task ekleyin" autoComplete="off" />
        <button className="btn sm" type="submit" disabled={!yeni.trim() || mesgul}>
          Ekle
        </button>
      </form>
    </div>
  );
}

function Ekler({ t, detay }: { t: TaskGorunumu; detay: TaskDetayi }) {
  const u = useUygulama();
  const { calistir, mesgul } = useDetayIslemi();
  return (
    <div className="sec">
      <h2>Dosyalar</h2>
      <div className="files">
        {detay.ekler.map((e) => (
          <button
            key={e.id}
            className="file"
            title={`${e.dosyaAdi} dosyasını indir`}
            onClick={() => dosyaIndir(`/tasks/ekler/${e.id}`, e.dosyaAdi).catch(u.hata)}
          >
            {Ikon.file}
            <span className="grow">{e.dosyaAdi}</span>
            <span className="hint mono">
              {boyutGoster(e.boyut)} · {u.kisiAdi(e.yukleyenId)} · {tarihGoster(e.zaman, false)}
            </span>
          </button>
        ))}
        <label className="file add">
          {Ikon.file}
          <span className="grow">{mesgul ? 'Yükleniyor…' : 'Dosya ekle'}</span>
          <input
            type="file"
            hidden
            accept={EK_UZANTILARI}
            disabled={mesgul}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              await calistir(() => dosyaYukle(`/tasks/${t.id}/ekler?dosyaAdi=${encodeURIComponent(f.name)}`, f), `“${f.name}” eklendi`);
            }}
          />
        </label>
      </div>
      <p className="hint">En fazla 10 MB · PDF, görsel, TXT/LOG, CSV, JSON, Office, ZIP. Parola, anahtar veya kişisel veri içeren dosyaları yüklemeyin.</p>
    </div>
  );
}

function YorumFormu({ t }: { t: TaskGorunumu }) {
  const { calistir, mesgul } = useDetayIslemi();
  const [metin, setMetin] = useState('');
  return (
    <form
      className="appr-actions"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!metin.trim()) return;
        if (await calistir(() => api(`/tasks/${t.id}/yorumlar`, { body: { metin: metin.trim() } }), 'Yorum eklendi')) setMetin('');
      }}
    >
      <label htmlFor="yorum-in" className="sr-only">
        Yorum
      </label>
      <input id="yorum-in" className="inline-in" style={{ flex: 1 }} value={metin} maxLength={5000} onChange={(e) => setMetin(e.target.value)} placeholder="Yorum yazın" autoComplete="off" />
      <button className="btn sm" type="submit" disabled={!metin.trim() || mesgul}>
        Gönder
      </button>
    </form>
  );
}

function EtiketDuzenle({ t }: { t: TaskGorunumu }) {
  const { calistir, mesgul } = useDetayIslemi();
  const [yeni, setYeni] = useState('');
  const kaydet = (etiketler: string[]) => calistir(() => api(`/tasks/${t.id}/etiket-ref`, { method: 'PATCH', body: { etiketler } }));
  return (
    <span className="chips-edit">
      {t.etiketler.map((e) => (
        <span key={e} className="tag">
          {e}
          <button className="x" aria-label={`${e} etiketini kaldır`} disabled={mesgul} onClick={() => kaydet(t.etiketler.filter((x) => x !== e))}>
            ×
          </button>
        </span>
      ))}
      <form
        style={{ display: 'contents' }}
        onSubmit={async (e) => {
          e.preventDefault();
          const v = yeni.trim();
          if (!v) return;
          if (await kaydet([...t.etiketler, v])) setYeni('');
        }}
      >
        <label htmlFor="etiket-yeni" className="sr-only">
          Etiket ekle
        </label>
        <input id="etiket-yeni" className="inline-in" style={{ width: 130, padding: '3px 8px', fontSize: 13 }} value={yeni} maxLength={50} onChange={(e) => setYeni(e.target.value)} placeholder="+ etiket" autoComplete="off" />
      </form>
    </span>
  );
}

function RefDuzenle({ t }: { t: TaskGorunumu }) {
  const { calistir, mesgul } = useDetayIslemi();
  const [duzen, setDuzen] = useState<string | null>(null);
  if (duzen !== null)
    return (
      <form
        className="chips-edit"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await calistir(() => api(`/tasks/${t.id}/etiket-ref`, { method: 'PATCH', body: { hariciRef: duzen.trim() } }), 'Harici referans kaydedildi')) setDuzen(null);
        }}
      >
        <label htmlFor="ref-in" className="sr-only">
          Harici referans
        </label>
        <input id="ref-in" className="inline-in" style={{ flex: 1, minWidth: 160, padding: '4px 8px', fontSize: 13 }} value={duzen} onChange={(e) => setDuzen(e.target.value)} placeholder="SIEM/ITSM no veya https:// link" autoFocus />
        <button className="btn sm" type="submit" disabled={mesgul}>
          Kaydet
        </button>
        <button className="btn sm ghost" type="button" onClick={() => setDuzen(null)}>
          Vazgeç
        </button>
      </form>
    );
  return (
    <span className="chips-edit">
      {t.hariciRef ? (
        httpLink(t.hariciRef) ? (
          <a className="link mono" href={t.hariciRef} target="_blank" rel="noopener noreferrer">
            {t.hariciRef}
          </a>
        ) : (
          <span className="mono">{t.hariciRef}</span>
        )
      ) : (
        <span className="hint">—</span>
      )}
      <button className="link" style={{ fontSize: 13 }} onClick={() => setDuzen(t.hariciRef ?? '')}>
        Düzenle
      </button>
    </span>
  );
}
