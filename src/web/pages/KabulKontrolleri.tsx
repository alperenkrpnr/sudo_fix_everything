// Task kartındaki kabul zinciri kontrolleri (ticket 05): zincir özeti, accept/refuse (ret gerekçesi zorunlu),
// Requester için reddedilen Task'ı yeniden atama / iptal.
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { KabulZinciri, Profil, Rehber, TaskGorunumu } from '../types';

const KARAR: Record<string, string> = { BEKLIYOR: 'bekliyor', KABUL: 'kabul', RET: 'ret', OTOMATIK: 'otomatik kabul' };
const NEDEN: Record<string, string> = {
  SELF_ASSIGN: 'Self-assign',
  UST_YONETICI: 'Direkt kabul (Üst yönetici)',
  REQUESTER_VE_ONAYLAYICI: 'Direkt kabul (Requester = Sorumlu yönetici, çifte rol)',
};

export function KabulKontrolleri(p: { task: TaskGorunumu; ben: Profil; rehber: Rehber | null; onDegisti: () => void; onHata: (m: string) => void }) {
  const { task, ben } = p;
  const [zincir, setZincir] = useState<KabulZinciri | null>(null);
  const [acik, setAcik] = useState(false);
  const [hedef, setHedef] = useState(task.assigneeEkipId ? `e:${task.assigneeEkipId}` : `k:${task.assigneeKullaniciId}`);
  const ilgili = task.durum === 'KABUL_BEKLIYOR' || task.durum === 'REDDEDILDI';

  useEffect(() => {
    if (ilgili || acik) api<KabulZinciri>(`/kabul/tasks/${task.id}/zincir`).then(setZincir).catch(() => setZincir(null));
  }, [task.id, task.durum, acik]);

  const ad = (id: string) => p.rehber?.kullanicilar.find((k) => k.id === id)?.ad ?? id;
  const islem = (yol: string, body: unknown = {}) =>
    api(`/kabul/tasks/${task.id}/${yol}`, { body }).then(p.onDegisti).catch((e) => p.onHata(e.message));

  const aktif = zincir?.adimlar.find((a) => a.karar === 'BEKLIYOR' && a.baslangic);
  const onaylayiciyim = task.durum === 'KABUL_BEKLIYOR' && !!aktif?.onaylayicilar.includes(ben.id);
  const requesterim = task.requesterId === ben.id;

  const reddet = () => {
    const g = window.prompt('Ret gerekçesi (zorunlu):');
    if (g === null) return;
    if (!g.trim()) return p.onHata('Ret gerekçesi zorunlu');
    islem('ret', { gerekce: g });
  };
  const yenidenAta = () => {
    const [tur, id] = hedef.split(':');
    islem('yeniden-ata', tur === 'e' ? { assigneeEkipId: id } : { assigneeKullaniciId: id });
  };

  return (
    <div className="kabul">
      {onaylayiciyim && (
        <div>
          <button onClick={() => islem('kabul')}>Kabul et</button> <button onClick={reddet}>Reddet</button>
        </div>
      )}
      {task.durum === 'REDDEDILDI' && requesterim && p.rehber && (
        <div>
          <select value={hedef} onChange={(e) => setHedef(e.target.value)}>
            {p.rehber.kullanicilar.map((k) => <option key={k.id} value={`k:${k.id}`}>{k.ad}</option>)}
            {p.rehber.ekipler.map((e) => <option key={e.id} value={`e:${e.id}`}>{e.kod}</option>)}
          </select>{' '}
          <button onClick={yenidenAta}>Yeniden ata / gönder</button> <button onClick={() => islem('iptal')}>İptal et</button>
        </div>
      )}
      {!ilgili && <button className="soluk" onClick={() => setAcik(!acik)}>Kabul tarihçesi</button>}
      {(ilgili || acik) && zincir && (
        <ol className="soluk">
          {zincir.adimlar.map((a) => (
            <li key={a.id}>
              {zincir.adimlar.some((x) => x.deneme > 1) && `#${a.deneme} `}
              {a.tur === 'DIREKT'
                ? `${NEDEN[a.not ?? ''] ?? 'Direkt kabul'} · ${ad(a.requesterId)}`
                : `${a.tur === 'ASSIGNEE' ? 'Assignee' : 'Sorumlu yönetici'}: ${a.onaylayicilar.map(ad).join(', ') || '—'} · ${
                    a.karar === 'BEKLIYOR' && !a.baslangic ? 'sırada' : KARAR[a.karar]
                  }`}
              {a.gerekce && ` · "${a.gerekce}"`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
