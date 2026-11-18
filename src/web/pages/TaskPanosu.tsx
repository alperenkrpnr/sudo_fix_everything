// Task panosu: kapsam sekmeleri, öncelik / Ekip filtreleri, durum sütunları (sürükle-bırak),
// reddedilen Task'lar ve iptal edilenler.
import { useState, type DragEvent } from 'react';
import { ApiHatasi } from '../api';
import { DURUM_ADI, kucuk, ONCELIK_ADI, ONCELIK_SINIF, ONCELIKLER } from '../format';
import { aktifAdim, durumYetkisi, gerekceAyir, izinliGecisler, sonRet, useTaskIslemleri } from '../gorev';
import { useCokluVeri, useUygulama } from '../uygulama';
import { Avatar, Bos, EkipAvatar, HataKutusu, Ikon, OncelikPill, Termin, Yukleniyor } from '../ui';
import type { DurumGecmisi, KabulZinciri, TaskDurum, TaskGorunumu, TaskOncelik } from '../types';

type Kapsam = 'tum' | 'bana' | 'actiklarim' | 'ekip';

const SUTUNLAR: Array<{ ad: string; durumlar: TaskDurum[]; renk: string; hedef?: TaskDurum; bos: string }> = [
  { ad: 'Bekleyen', durumlar: ['TASLAK', 'KABUL_BEKLIYOR'], renk: 'var(--wait)', bos: 'Kabul bekleyen Task yok' },
  { ad: 'Kabul Edildi', durumlar: ['KABUL_EDILDI'], renk: 'var(--low)', bos: 'Başlanmayı bekleyen Task yok' },
  { ad: 'Devam Ediyor', durumlar: ['DEVAM_EDIYOR'], renk: 'var(--accent)', hedef: 'DEVAM_EDIYOR', bos: 'Bu sütunda Task yok' },
  { ad: 'Bloklu', durumlar: ['BLOKLU'], renk: 'var(--orange)', hedef: 'BLOKLU', bos: 'Bloklu Task yok' },
  { ad: 'Tamamlandı', durumlar: ['TAMAMLANDI'], renk: 'var(--ok)', hedef: 'TAMAMLANDI', bos: 'Bu sütunda Task yok' },
];

const oncelikSira = (t: TaskGorunumu) => ONCELIKLER.indexOf(t.oncelik);
const terminSira = (t: TaskGorunumu) => (t.bitisTarihi ? new Date(t.bitisTarihi).getTime() : Infinity);

export function TaskPanosuSayfasi() {
  const u = useUygulama();
  const islem = useTaskIslemleri();
  const [kapsam, setKapsam] = useState<Kapsam>('tum');
  const [oncelikF, setOncelikF] = useState<Set<TaskOncelik>>(new Set());
  const [ekipF, setEkipF] = useState('');
  const [uzerinde, setUzerinde] = useState<string | null>(null);
  const [surukle, setSurukle] = useState<string | null>(null);

  const tum = u.tasklar ?? [];
  const ekiplerim = new Set([...u.ben.ekipIds, ...u.yonetilenEkipIds]);
  const kapsamda = (t: TaskGorunumu, k: Kapsam) =>
    k === 'tum' ||
    (k === 'bana' && t.assigneeKullaniciId === u.ben.id) ||
    (k === 'actiklarim' && t.requesterId === u.ben.id) ||
    (k === 'ekip' && ((!!t.ekipId && ekiplerim.has(t.ekipId)) || (!!t.assigneeEkipId && ekiplerim.has(t.assigneeEkipId))));
  const q = kucuk(u.arama.trim());
  const aramada = (t: TaskGorunumu) =>
    !q ||
    kucuk([t.baslik, t.aciklama ?? '', t.hariciRef ?? '', t.etiketler.join(' '), u.kisiAdi(t.requesterId), u.assigneeAdi(t), u.ekipKodu(t.ekipId)].join(' ')).includes(q);
  const ekipOf = (t: TaskGorunumu) => t.assigneeEkipId ?? t.ekipId;
  const filtrede = (t: TaskGorunumu) => aramada(t) && kapsamda(t, kapsam) && (!oncelikF.size || oncelikF.has(t.oncelik)) && (!ekipF || ekipOf(t) === ekipF);

  const liste = tum.filter(filtrede);
  const reddedilen = tum.filter((t) => t.durum === 'REDDEDILDI' && aramada(t));
  const iptal = liste.filter((t) => t.durum === 'IPTAL');
  const gorulenEkipler = [...new Set(tum.map(ekipOf).filter((x): x is string => !!x))].sort((a, b) => u.ekipKodu(a).localeCompare(u.ekipKodu(b)));

  // Kartlarda gösterilecek ek bilgi: bekleyen onaylayıcı, ret gerekçesi, blok nedeni.
  const zincirler = useCokluVeri<KabulZinciri>(tum.filter((t) => t.durum === 'KABUL_BEKLIYOR' || t.durum === 'REDDEDILDI').map((t) => `/kabul/tasks/${t.id}/zincir`));
  const gecmisler = useCokluVeri<DurumGecmisi>(tum.filter((t) => t.durum === 'BLOKLU').map((t) => `/tasks/${t.id}/gecmis`));
  const zincir = (t: TaskGorunumu) => zincirler[`/kabul/tasks/${t.id}/zincir`];
  const blokNedeni = (t: TaskGorunumu) => {
    const g = gecmisler[`/tasks/${t.id}/gecmis`];
    return g ? [...g.gecisler].reverse().find((x) => x.yeni === 'BLOKLU')?.neden : undefined;
  };

  const kapsamlar: Array<[Kapsam, string]> = [
    ['tum', 'Görebildiklerim'],
    ['bana', 'Bana atanan'],
    ['actiklarim', 'Açtıklarım'],
    ['ekip', u.yonetici ? 'Ekiplerim' : 'Ekibime atanan'],
  ];

  const birak = (sutun: (typeof SUTUNLAR)[number], e: DragEvent) => {
    e.preventDefault();
    setUzerinde(null);
    const t = tum.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    setSurukle(null);
    if (!t || sutun.durumlar.includes(t.durum)) return;
    const uyar = (m: string) => u.hata(new ApiHatasi('DOGRULAMA', m, 400));
    if (!sutun.hedef) return uyar(`Task “${sutun.ad}” durumuna geri alınamaz.`);
    if (t.durum === 'KABUL_BEKLIYOR' || t.durum === 'TASLAK') return uyar('Bu Task henüz kabul edilmedi. Önce kabul zinciri tamamlanmalı.');
    if (durumYetkisi(u, t) !== 'TAM') return uyar('Durumu yalnızca Assignee, Assignee Ekibinin üyeleri ve yöneticileri değiştirebilir.');
    if (!izinliGecisler(u, t).includes(sutun.hedef)) return uyar(`Geçersiz durum geçişi: ${DURUM_ADI[t.durum]} → ${DURUM_ADI[sutun.hedef]}`);
    islem.durumDegistir(t, sutun.hedef);
  };

  const kart = (t: TaskGorunumu) => {
    const aktif = t.durum === 'KABUL_BEKLIYOR' ? aktifAdim(zincir(t)) : undefined;
    const blok = t.durum === 'BLOKLU' ? blokNedeni(t) : undefined;
    const tasinabilir = durumYetkisi(u, t) === 'TAM' && !['TASLAK', 'KABUL_BEKLIYOR'].includes(t.durum);
    return (
      <button
        key={t.id}
        className={`card ${ONCELIK_SINIF[t.oncelik]}${surukle === t.id ? ' dragging' : ''}`}
        draggable={tasinabilir}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
          setSurukle(t.id);
        }}
        onDragEnd={() => {
          setSurukle(null);
          setUzerinde(null);
        }}
        onClick={() => u.taskAc(t.id)}
        aria-label={`${t.baslik}, ${ONCELIK_ADI[t.oncelik]}, ${DURUM_ADI[t.durum]}`}
      >
        <div className="card-line">
          <OncelikPill o={t.oncelik} />
          {t.durum === 'TASLAK' && <span className="tag">Taslak</span>}
          {!t.bitisTarihi && <span className="kind">{Ikon.stack} Backlog</span>}
        </div>
        <div className="card-title">{t.baslik}</div>
        {t.durum === 'BLOKLU' && <div className="blockr">Bloklu{blok ? `: ${blok}` : ''}</div>}
        {aktif && (
          <div className="hint" style={{ color: 'var(--wait)' }}>
            Kabul bekliyor: {aktif.onaylayicilar.map((id) => (id === u.ben.id ? 'siz' : u.kisiAdi(id))).join(', ') || '—'}
          </div>
        )}
        {(ekipOf(t) || t.etiketler.length > 0) && (
          <div className="card-line">
            {ekipOf(t) && <span className="tag team">{u.ekipKodu(ekipOf(t))}</span>}
            {t.etiketler.slice(0, 2).map((x) => (
              <span key={x} className="tag">
                {x}
              </span>
            ))}
          </div>
        )}
        <div className="card-foot">
          <Termin t={t} />
          <span style={{ display: 'flex', gap: 4 }}>
            {t.requesterId !== t.assigneeKullaniciId && <Avatar ad={u.kisiAdi(t.requesterId)} />}
            {t.assigneeEkipId ? <EkipAvatar kod={u.ekipKodu(t.assigneeEkipId)} /> : <Avatar ad={u.assigneeAdi(t)} />}
          </span>
        </div>
      </button>
    );
  };

  if (!u.tasklar) return u.tasklarHata ? <HataKutusu mesaj={u.tasklarHata} /> : <Yukleniyor />;

  return (
    <>
      <div className="head-row">
        <p className="sub">
          {u.direktor
            ? "Tüm Task'lar."
            : u.yonetici
              ? "Açtığınız, size atanan ve yönettiğiniz Ekiplerin ilişkili olduğu Task'lar."
              : "Açtığınız, size atanan ve Ekibinize atanan Task'lar."}{' '}
          Kartı sürükleyerek durumunu değiştirin; ayrıntı için kartı açın.
        </p>
      </div>
      <div className="tabs" role="tablist" aria-label="Kapsam">
        {kapsamlar.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={kapsam === k} onClick={() => setKapsam(k)}>
            {l}
            <span className="badge">{tum.filter((t) => kapsamda(t, k) && t.durum !== 'REDDEDILDI' && t.durum !== 'IPTAL').length}</span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        {ONCELIKLER.map((o) => (
          <button
            key={o}
            className="chip"
            aria-pressed={oncelikF.has(o)}
            onClick={() => {
              const s = new Set(oncelikF);
              if (s.has(o)) s.delete(o);
              else s.add(o);
              setOncelikF(s);
            }}
          >
            {ONCELIK_ADI[o]}
          </button>
        ))}
        <select className="chip" aria-label="Ekip" value={ekipF} onChange={(e) => setEkipF(e.target.value)}>
          <option value="">Tüm Ekipler</option>
          {gorulenEkipler.map((id) => (
            <option key={id} value={id}>
              {u.ekipKodu(id)}
            </option>
          ))}
        </select>
        {q && (
          <span className="hint">
            “{u.arama}” araması · {liste.length} sonuç
          </span>
        )}
      </div>

      {reddedilen.length > 0 && (
        <section className="rejected">
          <div className="panel-head">
            <h2 style={{ color: 'var(--crit)' }}>Reddedilen Task'lar ({reddedilen.length})</h2>
            <span className="hint">Requester yeniden atayabilir veya iptal edebilir. Kayıtlar silinmez.</span>
          </div>
          {reddedilen.map((t) => {
            const r = sonRet(zincir(t));
            const g = gerekceAyir(r?.gerekce ?? null);
            const benim = t.requesterId === u.ben.id;
            return (
              <div key={t.id} className="rej-item">
                <OncelikPill o={t.oncelik} />
                <div className="grow">
                  <b style={{ fontWeight: 500 }}>{t.baslik}</b>
                  <div className="hint">
                    {r ? (
                      <>
                        {u.kisiAdi(r.kararVerenId)} reddetti{g.neden && <> · <b>{g.neden}</b></>}: {g.aciklama}
                      </>
                    ) : (
                      `Requester: ${u.kisiAdi(t.requesterId)}`
                    )}
                  </div>
                </div>
                {benim && (
                  <>
                    <button className="btn sm" onClick={() => u.yenidenAta(t)}>
                      Yeniden ata
                    </button>
                    <button className="btn ghost sm" onClick={() => islem.retIptal(t)}>
                      İptal et
                    </button>
                  </>
                )}
                <button className="btn ghost sm" onClick={() => u.taskAc(t.id)}>
                  Ayrıntı
                </button>
              </div>
            );
          })}
        </section>
      )}

      <div className="board-wrap">
        <div className="board">
          {SUTUNLAR.map((s) => {
            const kartlar = liste.filter((t) => s.durumlar.includes(t.durum)).sort((a, b) => oncelikSira(a) - oncelikSira(b) || terminSira(a) - terminSira(b));
            return (
              <section
                key={s.ad}
                className={`col${uzerinde === s.ad ? ' over' : ''}`}
                aria-label={`${s.ad} (${kartlar.length})`}
                onDragOver={(e) => {
                  if (!surukle) return;
                  e.preventDefault();
                  if (uzerinde !== s.ad) setUzerinde(s.ad);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUzerinde(null);
                }}
                onDrop={(e) => birak(s, e)}
              >
                <div className="col-head">
                  <b>
                    <i style={{ background: s.renk }} />
                    {s.ad}
                  </b>
                  <span>{kartlar.length}</span>
                </div>
                <div className="col-body">
                  {kartlar.map(kart)}
                  {!kartlar.length && <div className="empty">{s.bos}</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {iptal.length > 0 && (
        <details className="fold">
          <summary>İptal edilen Task'lar ({iptal.length})</summary>
          <div className="rows">
            {iptal.map((t) => (
              <button key={t.id} className="row" onClick={() => u.taskAc(t.id)}>
                <span className={`stripe p-${ONCELIK_SINIF[t.oncelik]}`} />
                <span className="row-main">
                  <span className="row-title">{t.baslik}</span>
                  <span className="row-meta">
                    <span className="st">İptal</span>
                    <span>Requester: {u.kisiAdi(t.requesterId)}</span>
                    <span>Assignee: {u.assigneeAdi(t)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </details>
      )}
      {!tum.length && (
        <Bos eylem={<button className="btn primary sm" onClick={u.yeniTask}>{Ikon.plus} Yeni Task</button>}>Görebileceğiniz Task yok. İlk Task'ı oluşturun.</Bos>
      )}
      {islem.modal}
    </>
  );
}
