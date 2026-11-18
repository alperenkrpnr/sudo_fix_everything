// API & MCP: kişisel ajan token'ları (oluştur / listele / iptal) ve MCP sunucusu kaydı.
// Ajan, token sahibinin gördüğünü görür; her çağrı aynı yetki katmanından geçer.
import { useState } from 'react';
import { api, hataMesaji } from '../api';
import { tarihGoster } from '../format';
import { OnayModal } from '../gorev';
import { useUygulama, useVeri } from '../uygulama';
import { Bos, HataKutusu, Ikon, Modal, Yukleniyor } from '../ui';

interface AjanToken {
  id: string;
  ad: string;
  kapsamlar: Array<'okuma' | 'yazma'>;
  olusturma: string;
  iptal: string | null;
}

/** MCP sunucusunun araçları (src/server/mcp/sunucu.ts). */
const ARACLAR: Array<[string, string, 'okuma' | 'yazma']> = [
  ['task_listele', "Görebildiğiniz Task'ları listeler (durum filtresi)", 'okuma'],
  ['task_getir', "Tek bir Task'ı getirir", 'okuma'],
  ['bekleyen_islerim', 'Bekleyen işlerim: kabul bekleyen Task\'lar, etkinlik davetleri', 'okuma'],
  ['rapor_ozet', 'Kapsamınızdaki rapor özeti (Ekip/Unit filtresi)', 'okuma'],
  ['task_olustur', 'Sizin adınıza Task oluşturur', 'yazma'],
  ['task_durum_degistir', 'Task durumunu değiştirir', 'yazma'],
];

const UCLAR: Array<[string, string]> = [
  ['GET', '/api/tasks'],
  ['GET', '/api/tasks/{id}'],
  ['POST', '/api/tasks'],
  ['POST', '/api/tasks/{id}/durum'],
  ['POST', '/api/kabul/tasks/{id}/kabul'],
  ['POST', '/api/kabul/tasks/{id}/ret'],
  ['GET', '/api/bekleyen'],
  ['GET', '/api/rapor?ekipId=&unitId=&baslangic=&bitis='],
];

async function kopyala(metin: string, u: ReturnType<typeof useUygulama>) {
  try {
    await navigator.clipboard.writeText(metin);
    u.bildir('Kopyalandı');
  } catch {
    u.bildir('Kopyalanamadı; metni seçip Ctrl+C ile kopyalayın');
  }
}

export function EntegrasyonSayfasi() {
  const u = useUygulama();
  const tokenlar = useVeri<AjanToken[]>('/ajan-tokenlari');
  const [yeniAcik, setYeniAcik] = useState(false);
  const [iptalEdilen, setIptalEdilen] = useState<AjanToken | null>(null);
  const komut = 'claude mcp add siber-task -e AJAN_TOKEN=<token> -- npm --prefix <repo> run --silent mcp';

  return (
    <>
      <div className="head-row">
        <p className="sub">
          Task, bekleyen işler ve raporlara REST veya MCP ile erişin. Her çağrı web arayüzüyle aynı yetki katmanından geçer: bir ajan sizin göremediğiniz bir şeyi göremez. Ajan
          işlemleri denetim izinde ayrıca işaretlenir.
        </p>
      </div>
      <div className="grid2 esit">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>MCP sunucusu</h2>
              <button className="btn sm" onClick={() => kopyala(komut, u)}>
                Komutu kopyala
              </button>
            </div>
            <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {komut}
            </pre>
            <p className="hint">Sunucu, çalışan uygulamanın veritabanına bağlanır (stdio). &lt;token&gt; yerine aşağıda oluşturduğunuz ajan token'ını yazın.</p>
          </section>
          <section className="panel">
            <h2>MCP araçları</h2>
            <div>
              {ARACLAR.map(([ad, aciklama, kapsam]) => (
                <div key={ad} className="tool">
                  <code>{ad}</code>
                  <span className="muted" style={{ flex: '1 1 200px' }}>
                    {aciklama}
                  </span>
                  <span className={`st ${kapsam === 'okuma' ? 'done' : 'wait'}`}>{kapsam}</span>
                </div>
              ))}
            </div>
            <p className="hint">Yazma araçları için token'da “yazma” kapsamı gerekir; salt okunur token ile yazma 403 döner.</p>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Ajan token'larım</h2>
              <button className="btn sm primary" onClick={() => setYeniAcik(true)}>
                Yeni token
              </button>
            </div>
            {tokenlar.hata && <HataKutusu mesaj={tokenlar.hata} />}
            {!tokenlar.veri && !tokenlar.hata && <Yukleniyor />}
            {tokenlar.veri && !tokenlar.veri.length && <Bos>Henüz ajan token'ınız yok.</Bos>}
            {tokenlar.veri && tokenlar.veri.length > 0 && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ad</th>
                      <th>Kapsam</th>
                      <th>Oluşturma</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenlar.veri.map((t) => (
                      <tr key={t.id} style={t.iptal ? { opacity: 0.6 } : undefined}>
                        <td>{t.ad}</td>
                        <td>
                          {t.kapsamlar.map((k) => (
                            <span key={k} className="tag" style={{ marginRight: 4 }}>
                              {k}
                            </span>
                          ))}
                        </td>
                        <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {tarihGoster(t.olusturma, false)}
                        </td>
                        <td className="num">
                          {t.iptal ? (
                            <span className="st rej">İptal · {tarihGoster(t.iptal, false)}</span>
                          ) : (
                            <button className="btn sm bad" onClick={() => setIptalEdilen(t)}>
                              İptal et
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint">Token sahibinin rolüyle sınırlıdır; rolünüz değişirse ajanın kapsamı da değişir. Token metni yalnızca oluşturulurken bir kez gösterilir.</p>
          </section>
          <section className="panel">
            <h2>REST uç noktaları</h2>
            <div>
              {UCLAR.map(([m, yol]) => (
                <div key={m + yol} className="ep">
                  <span className={`method ${m.toLowerCase()}`}>{m}</span>
                  <code>{yol}</code>
                </div>
              ))}
            </div>
            <p className="hint">
              Kimlik: <code className="mono">Authorization: Bearer &lt;ajan token&gt;</code>
            </p>
          </section>
        </div>
      </div>
      {yeniAcik && <YeniTokenModal onKapat={() => setYeniAcik(false)} />}
      {iptalEdilen && (
        <OnayModal
          baslik="Token'ı iptal et"
          alt={iptalEdilen.ad}
          metin="Bu token'ı kullanan ajanlar hemen erişimini kaybeder. Kayıt silinmez."
          eylem="İptal et"
          onKapat={() => setIptalEdilen(null)}
          onOnay={async () => {
            try {
              await api(`/ajan-tokenlari/${iptalEdilen.id}/iptal`, { method: 'POST' });
              u.bildir('Token iptal edildi');
              setIptalEdilen(null);
            } catch (e) {
              u.hata(e);
            }
            u.yenile();
          }}
        />
      )}
    </>
  );
}

function YeniTokenModal({ onKapat }: { onKapat: () => void }) {
  const u = useUygulama();
  const [ad, setAd] = useState('');
  const [yazma, setYazma] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  if (token)
    return (
      <Modal baslik="Token oluşturuldu" alt={ad} onKapat={onKapat}>
        <div className="banner wait">
          {Ikon.info}
          <div>Bu token yalnızca şimdi gösterilir. Güvenli bir yere kopyalayın; parola gibi saklayın.</div>
        </div>
        <pre className="code" style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {token}
        </pre>
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => kopyala(token, u)}>
            Kopyala
          </button>
          <button className="btn primary" onClick={onKapat}>
            Tamam
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal baslik="Yeni ajan token'ı" alt="Ajan sizin adınıza ve sizin yetkilerinizle çalışır" onKapat={onKapat}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setMesgul(true);
          setHata(null);
          try {
            const r = await api<{ token: string }>('/ajan-tokenlari', { body: { ad: ad.trim(), kapsamlar: yazma ? ['okuma', 'yazma'] : ['okuma'] } });
            setToken(r.token);
            u.yenile();
          } catch (err) {
            setHata(hataMesaji(err));
          }
          setMesgul(false);
        }}
      >
        <div className="field">
          <label htmlFor="tk-ad">Ad</label>
          <input id="tk-ad" required value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Rapor ajanı (Claude)" />
        </div>
        <div className="checklist">
          <label>
            <input type="checkbox" checked disabled /> okuma
          </label>
          <label>
            <input type="checkbox" checked={yazma} onChange={(e) => setYazma(e.target.checked)} /> yazma (Task oluşturma ve durum değiştirme)
          </label>
        </div>
        {hata && <HataKutusu mesaj={hata} />}
        <div className="appr-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onKapat}>
            Vazgeç
          </button>
          <button className="btn primary" type="submit" disabled={!ad.trim() || mesgul}>
            Oluştur
          </button>
        </div>
      </form>
    </Modal>
  );
}
