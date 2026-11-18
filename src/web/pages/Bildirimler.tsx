// Bildirimler paneli (zil düğmesi): liste, okundu işaretleme, ilgili kayda gitme.
import { useState } from 'react';
import { api } from '../api';
import { tarihGoster } from '../format';
import { useUygulama } from '../uygulama';
import { Bos, Drawer } from '../ui';
import type { BildirimGorunumu } from '../types';

export function BildirimPaneli({ onKapat, onYenile }: { onKapat: () => void; onYenile: () => Promise<unknown> }) {
  const u = useUygulama();
  const [mesgul, setMesgul] = useState(false);
  const liste = u.bildirimler;
  const okunmamis = liste.filter((b) => !b.okundu);

  const okunduYap = (b: BildirimGorunumu) => (b.okundu ? Promise.resolve() : api(`/bildirim/${b.id}/okundu`, { method: 'POST' }));

  const ac = async (b: BildirimGorunumu) => {
    try {
      await okunduYap(b);
    } catch (e) {
      u.hata(e);
    }
    await onYenile();
    if (b.varlikTuru === 'Task' && b.varlikId) u.taskAc(b.varlikId);
    else if (b.varlikTuru === 'Etkinlik' || b.varlikTuru === 'Duyuru' || b.varlikTuru === 'Yetkinlik') u.git('etkinlikler');
  };

  const tumunuOku = async () => {
    setMesgul(true);
    try {
      for (const b of okunmamis) await okunduYap(b);
      u.bildir('Tüm bildirimler okundu');
    } catch (e) {
      u.hata(e);
    }
    await onYenile();
    setMesgul(false);
  };

  return (
    <Drawer
      etiket="Bildirimler"
      onKapat={onKapat}
      baslik={
        <>
          <b style={{ fontFamily: 'var(--f-display)', fontSize: 17 }}>Bildirimler</b>
          {okunmamis.length > 0 && <span className="badge">{okunmamis.length}</span>}
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} disabled={!okunmamis.length || mesgul} onClick={tumunuOku}>
            Tümünü okundu say
          </button>
        </>
      }
    >
      <div>
        {liste.map((b) => (
          <button key={b.id} className={`notif ${b.okundu ? '' : 'unread'}`} onClick={() => ac(b)}>
            <span className="nd" />
            <span>
              <time>
                {tarihGoster(b.olusturma)}
                {!b.okundu && <span className="sr-only"> · okunmamış</span>}
              </time>
              {b.mesaj}
            </span>
          </button>
        ))}
        {!liste.length && <Bos>Bildirim yok. Size Task atandığında, kabul/ret kararı verildiğinde veya yeni Duyuru yayınlandığında burada görünür.</Bos>}
      </div>
    </Drawer>
  );
}
