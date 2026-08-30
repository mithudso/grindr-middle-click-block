import { GrindrError, GrindrAuthError, parseErrorCode } from './errors.js';

/**
 * Create a credential store + authed request function. Every authed call sends
 * `Authorization: Grindr3 <JWT>`, `country-code`, and `l-locale` — omitting the
 * latter two returns 501.
 * @param {{token?:string, countryCode?:string, locale?:string, base?:string}} [config]
 */
export function createAuth(config = {}) {
  const state = {
    token: config.token || '',
    countryCode: config.countryCode || '',
    locale: config.locale || '',
    base: config.base || 'https://web.grindr.com',
  };
  const isReady = () => !!state.token;
  const set = (cfg = {}) => {
    if (cfg.token != null) state.token = String(cfg.token || '');
    if (cfg.countryCode != null) state.countryCode = String(cfg.countryCode || '');
    if (cfg.locale != null) state.locale = String(cfg.locale || '');
    if (cfg.base != null) state.base = String(cfg.base);
    return isReady();
  };
  const clear = () => { state.token = ''; };
  const headers = (extra) => {
    if (!isReady()) throw new GrindrAuthError();
    return {
      'Authorization': `Grindr3 ${state.token}`,
      'country-code': state.countryCode,
      'l-locale': state.locale,
      'Content-Type': 'application/json',
      ...(extra || {}),
    };
  };
  const enc = (id) => encodeURIComponent(String(id == null ? '' : id));

  /**
   * Perform an authed request. Throws GrindrAuthError when creds are unset and
   * GrindrError on transport failure or a non-2xx response.
   * @param {string} path path beginning with `/`
   * @param {{method?:string, body?:any, signal?:AbortSignal, timeoutMs?:number}} [opts]
   * @returns {Promise<any>} parsed JSON (or raw text / null)
   */
  async function request(path, { method = 'GET', body, signal, timeoutMs = 20000 } = {}) {
    const h = headers();                       // throws GrindrAuthError if not ready
    const ac = new AbortController();
    const to = setTimeout(() => { try { ac.abort(); } catch (_e) {} }, timeoutMs);
    const sig = signal || ac.signal;
    let res;
    try {
      res = await fetch(state.base + path, {
        method,
        credentials: 'include',
        headers: h,
        signal: sig,
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch (_err) {
      clearTimeout(to);
      throw new GrindrError(`request failed: ${method} ${path}`, { status: 0, path });
    }
    clearTimeout(to);
    let text = '';
    try { text = await res.text(); } catch (_e) {}
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_e) { data = text; } }
    if (!res.ok) {
      throw new GrindrError(`HTTP ${res.status} on ${method} ${path}`, { status: res.status, code: parseErrorCode(data), path });
    }
    return data;
  }

  return { set, clear, isReady, headers, request, enc, get base() { return state.base; } };
}
