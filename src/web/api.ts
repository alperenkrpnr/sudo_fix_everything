// Tiny fetch wrapper. Token (mock:<kullaniciId>) is kept in localStorage.
const TOKEN_KEY = 'siber-task-token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Kullanıcıya gösterilebilir API hatası. `kod`: KIMLIK | YETKI | BULUNAMADI | DOGRULAMA | SUNUCU | AG. */
export class ApiHatasi extends Error {
  constructor(
    public kod: string,
    mesaj: string,
    public status: number,
  ) {
    super(mesaj);
  }
}

const GENEL_HATA = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
const BILINEN = new Set(['KIMLIK', 'YETKI', 'BULUNAMADI', 'DOGRULAMA']);

/** Sunucunun `{hata, mesaj}` gövdesinden okunabilir hata üretir. Sunucu içi (5xx) ayrıntılar gösterilmez. */
function hataUret(status: number, data: unknown): ApiHatasi {
  const d = (data ?? {}) as { hata?: unknown; mesaj?: unknown };
  if (status < 500 && typeof d.hata === 'string' && BILINEN.has(d.hata) && typeof d.mesaj === 'string' && d.mesaj.trim())
    return new ApiHatasi(d.hata, d.mesaj, status);
  return new ApiHatasi('SUNUCU', GENEL_HATA, status);
}

/** Herhangi bir hatayı kullanıcıya gösterilecek metne çevirir. */
export function hataMesaji(e: unknown): string {
  return e instanceof ApiHatasi ? e.message : GENEL_HATA;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiHatasi('AG', 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw hataUret(res.status, data);
  return data as T;
}
