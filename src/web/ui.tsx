// Ortak görsel bileşenler (SecOpsGrid tasarım sistemi).
import { useEffect, useRef, type ReactNode } from 'react';
import { basHarfler, DURUM_ADI, DURUM_SINIF, ONCELIK_ADI, ONCELIK_SINIF, terminBilgisi } from './format';
import type { TaskDurum, TaskGorunumu, TaskOncelik } from './types';

const svg = (w: number, sw: number, d: ReactNode, fill = 'none') => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? 'currentColor' : undefined} strokeWidth={sw} aria-hidden="true">
    {d}
  </svg>
);

export const Ikon = {
  check: svg(12, 3, <path d="M5 12l5 5 9-10" />),
  x: svg(12, 3, <path d="M6 6l12 12M18 6 6 18" />),
  clock: svg(12, 2.4, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  dot: (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  ),
  block: svg(18, 2, <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>),
  info: svg(18, 2, <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>),
  lock: svg(13, 2, <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  close: svg(16, 2.2, <path d="M6 6l12 12M18 6 6 18" />),
  stack: svg(12, 2.2, <><path d="M12 3 2 8l10 5 10-5z" /><path d="m2 13 10 5 10-5" /></>),
  plus: svg(17, 2.6, <path d="M12 5v14M5 12h14" />),
  bell: svg(18, 2, <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  search: svg(16, 2, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  cikis: svg(20, 2, <><path d="M14 4H5v16h9" /><path d="M10 12h10M17 8l4 4-4 4" /></>),
  file: svg(16, 2, <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></>),
  kalkan: svg(20, 2.2, <><path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" /><circle cx="12" cy="11" r="2.5" /></>),
  // Tile ikonları
  tShield: svg(24, 0, <path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" />, 'currentColor'),
  tInbox: svg(24, 2.2, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  tWarn: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 1 21h22z" />
      <path d="M12 9v5M12 17v.5" stroke="#121D33" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  tTrend: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  ),
};

/** Menü ikonları (mockup'taki yollar). */
export const NavIkon: Record<string, ReactNode> = {
  ana: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  onaylar: <><path d="M4 4h16v12H4z" /><path d="M4 16l3 4h10l3-4" /><path d="M9 10l2 2 4-4" /></>,
  gorevler: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
  etkinlikler: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  raporlar: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  entegrasyon: <path d="M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14" />,
};

export function OncelikPill({ o }: { o: TaskOncelik }) {
  return <span className={`pri ${ONCELIK_SINIF[o]}`}>{ONCELIK_ADI[o]}</span>;
}
export function DurumPill({ d }: { d: TaskDurum }) {
  return <span className={`st ${DURUM_SINIF[d]}`}>{DURUM_ADI[d]}</span>;
}
export function Termin({ t }: { t: Pick<TaskGorunumu, 'bitisTarihi' | 'durum'> }) {
  const b = terminBilgisi(t);
  return (
    <span className={`due ${b.sinif}`}>
      {!t.bitisTarihi && Ikon.stack}
      {b.sinif === 'late' && <span aria-hidden="true">!</span>}
      {b.metin}
    </span>
  );
}
export function Avatar({ ad, sinif = '' }: { ad: string; sinif?: string }) {
  return (
    <span className={`av ${sinif}`} title={ad}>
      {basHarfler(ad)}
    </span>
  );
}
export function EkipAvatar({ kod }: { kod: string }) {
  return (
    <span className="av team" title={kod}>
      {kod.replace('TEAM-', '')}
    </span>
  );
}

export function Bos({ children, eylem }: { children: ReactNode; eylem?: ReactNode }) {
  return (
    <div className="empty">
      <div>{children}</div>
      {eylem}
    </div>
  );
}

export function Yukleniyor() {
  return <p className="loading">Yükleniyor…</p>;
}

export function HataKutusu({ mesaj }: { mesaj: string }) {
  return (
    <div className="err-box" role="alert">
      {Ikon.block}
      <span>{mesaj}</span>
    </div>
  );
}

/** Modal: scrim + odak + Esc ile kapanır. */
export function Modal(p: { baslik: string; alt?: ReactNode; onKapat: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ilk = ref.current?.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea');
    ilk?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        p.onKapat();
      }
    };
    document.addEventListener('keydown', tus, true);
    return () => document.removeEventListener('keydown', tus, true);
  }, []);
  return (
    <>
      <div className="scrim" style={{ zIndex: 30 }} onClick={p.onKapat} />
      <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && p.onKapat()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={p.baslik} ref={ref}>
          <div className="panel-head">
            <div>
              <h3 style={{ fontSize: 19 }}>{p.baslik}</h3>
              {p.alt && <p className="sub" style={{ fontSize: 13 }}>{p.alt}</p>}
            </div>
            <button className="btn icon-btn ghost" onClick={p.onKapat} aria-label="Kapat">
              {Ikon.close}
            </button>
          </div>
          {p.children}
        </div>
      </div>
    </>
  );
}

/** Sağdan açılan panel. */
export function Drawer(p: { etiket: string; baslik: ReactNode; onKapat: () => void; children: ReactNode }) {
  useEffect(() => {
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal') && p.onKapat();
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  }, [p.onKapat]);
  return (
    <>
      <div className="scrim" onClick={p.onKapat} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={p.etiket}>
        <div className="drawer-head">
          {p.baslik}
          <button className="btn icon-btn ghost" onClick={p.onKapat} style={{ marginLeft: 'auto' }} aria-label="Kapat">
            {Ikon.close}
          </button>
        </div>
        <div className="drawer-body">{p.children}</div>
      </aside>
    </>
  );
}

/** Kabul akışı adımları (stepper). */
export interface Adim {
  kim: string;
  durum: 'ok' | 'wait' | 'no' | 'todo';
  etiket: string;
}
export function Stepper({ adimlar }: { adimlar: Adim[] }) {
  return (
    <div className="chain">
      {adimlar.map((s, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className={`step-line ${s.durum === 'ok' ? 'ok' : ''}`} />}
          <div className={`step ${s.durum}`}>
            <span className="ic">{s.durum === 'ok' ? Ikon.check : s.durum === 'no' ? Ikon.x : s.durum === 'wait' ? Ikon.clock : Ikon.dot}</span>
            <span>
              <b>{s.kim}</b>
              <small>{s.etiket}</small>
            </span>
          </div>
        </span>
      ))}
    </div>
  );
}
