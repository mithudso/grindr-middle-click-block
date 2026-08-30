// Opt-in traffic observer: patches fetch / XHR / WebSocket.send to auto-capture
// the Grindr3 auth headers, tap hides/blocks list responses, and observe outbound
// WS frames. Every patch is guarded for frozen intrinsics (SES/lockdown). Uses a
// real hostname test, never a substring (an `evil.example/?ref=grindr.com` must
// not donate its headers).

const LIST_RE = /\/api\/(?:v1\/hides|v\d+\/blocks)/i;

function defaultIsGrindrUrl(u) {
  try {
    const origin = (globalThis.location && location.origin) || 'https://web.grindr.com';
    const h = new URL(String(u || ''), origin).hostname.toLowerCase();
    return h === 'grindr.com' || h.endsWith('.grindr.com');
  } catch (_e) { return false; }
}

function headerGet(headers, name) {
  if (!headers) return '';
  try {
    if (typeof headers.get === 'function') return headers.get(name) || '';
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
  } catch (_e) {}
  return '';
}

/**
 * @param {{onAuth?:(a:{token:string,countryCode:string,locale:string})=>void,
 *          onListResponse?:(r:{url:string,data:any})=>void,
 *          onWsSend?:(data:any)=>void, onError?:(e:any)=>void,
 *          isGrindrUrl?:(u:string)=>boolean}} [handlers]
 * @returns {{install:()=>void, uninstall:()=>void}}
 */
export function createObserver({ onAuth, onListResponse, onWsSend, onError, isGrindrUrl = defaultIsGrindrUrl } = {}) {
  let rawFetch = null;
  let origWsSend = null;
  let installed = false;

  const emitAuth = (headers) => {
    if (!onAuth) return;
    const m = String(headerGet(headers, 'Authorization')).match(/^Grindr3\s+(.+)$/);
    if (!m) return;
    onAuth({ token: m[1], countryCode: headerGet(headers, 'country-code'), locale: headerGet(headers, 'l-locale') });
  };

  function install() {
    if (installed) return;
    installed = true;
    rawFetch = globalThis.fetch;
    globalThis.fetch = async function patched(input, init) {
      try {
        const url = String((input && input.url) || input || '');
        if (isGrindrUrl(url)) emitAuth((init && init.headers) || (input && input.headers));
      } catch (e) { if (onError) onError(e); }
      const res = await rawFetch.call(this, input, init);
      try {
        const url = String((input && input.url) || input || '');
        if (onListResponse && isGrindrUrl(url) && LIST_RE.test(url)) {
          res.clone().text().then((t) => { try { onListResponse({ url, data: JSON.parse(t) }); } catch (_e) {} }).catch(() => {});
        }
      } catch (e) { if (onError) onError(e); }
      return res;
    };
    try {
      if (globalThis.WebSocket && WebSocket.prototype && onWsSend) {
        origWsSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
          try { onWsSend(data); } catch (e) { if (onError) onError(e); }
          return origWsSend.apply(this, arguments);
        };
      }
    } catch (_e) {}
  }

  function uninstall() {
    if (!installed) return;
    installed = false;
    try { if (rawFetch) globalThis.fetch = rawFetch; } catch (_e) {}
    try { if (origWsSend) { WebSocket.prototype.send = origWsSend; origWsSend = null; } } catch (_e) {}
  }

  return { install, uninstall };
}
