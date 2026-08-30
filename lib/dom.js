// Pure DOM helpers: profile-id and cascade-tile resolution, plus route detection.
// The tile resolution is bounded to avoid the "sidebar trap" — walking up from a
// conversation avatar to a huge ancestor (the inbox UL) and hiding the chat list.

export const PROFILE_PHOTO_SELECTOR = 'img[src*="cdns.grindr.com"], img[src*="grindr.com/images/profile"], img[src*="cloudfront.net"]';
export const CASCADE_TILE_SELECTOR = '[data-testid="cascadeCellContainer"]';
const MIN_ID = 5;
const MAX_ID = 10;

/** A Grindr profile id is 5–10 digits. */
export function isPlausibleProfileId(id) {
  const s = String(id == null ? '' : id);
  return /^[0-9]+$/.test(s) && s.length >= MIN_ID && s.length <= MAX_ID;
}

export function isProfileOverlayOpen() {
  try { return /profile=true/.test(location.search || ''); } catch (_e) { return false; }
}
export function isOnChat() {
  try { return /^\/chat(?:\/|$)/.test(location.pathname || ''); } catch (_e) { return false; }
}
/** @returns {'grid'|'profile'|'chat'|'login'} */
export function route() {
  try {
    if (/^\/login/.test(location.pathname || '')) return 'login';
    if (isOnChat()) return 'chat';
    if (isProfileOverlayOpen()) return 'profile';
  } catch (_e) {}
  return 'grid';
}

/**
 * Resolve the outermost single-tile wrapper for an element. Never returns an
 * ancestor that holds more than one profile photo or that is taller than the
 * viewport (the sidebar-UL trap); returns null rather than guess.
 * @param {Element} el
 * @returns {Element|null}
 */
export function resolveCascadeTile(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const vh = (typeof innerHeight === 'number' ? innerHeight : 900);
  const r0 = el.getBoundingClientRect();
  if (r0.height > vh) return null;
  const body = globalThis.document && document.body;
  const docEl = globalThis.document && document.documentElement;
  let best = el;
  let node = el;
  for (let i = 0; node && i < 4; i += 1, node = node.parentElement) {
    if (node === body || node === docEl) break;
    let photos = 0;
    try { photos = node.querySelectorAll(PROFILE_PHOTO_SELECTOR).length; } catch (_e) {}
    if (photos > 1) break;                       // more than one photo = not a single tile
    const r = node.getBoundingClientRect();
    if (r.height > vh) break;
    best = node;
  }
  return best;
}

/**
 * Resolve a profile id from an element: URL peer, then a bounded attribute scan
 * (`data-profile-id` / `data-testid` / `aria-label`), then an optional photo-hash
 * index the caller supplies. Returns '' on miss.
 * @param {Element} el
 * @param {{hashIndex?: {get:(hash:string)=>string|undefined}}} [opts]
 * @returns {string}
 */
export function resolveProfileIdFromElement(el, { hashIndex } = {}) {
  try {
    const m = (location.pathname + location.search).match(/\/(?:profiles?|users?|conversations?|chat)\/(\d{5,10})(?:\/|\?|$)/i);
    if (m && isPlausibleProfileId(m[1])) return m[1];
  } catch (_e) {}
  if (!el) return '';
  try {
    let node = el;
    for (let i = 0; node && i < 6; i += 1, node = node.parentElement) {
      const t = (node.getAttribute && (node.getAttribute('data-profile-id') || node.getAttribute('data-testid') || node.getAttribute('aria-label'))) || '';
      const mm = String(t).match(/(?:^|[^0-9])([0-9]{5,10})(?![0-9])/);
      if (mm && isPlausibleProfileId(mm[1])) return mm[1];
    }
  } catch (_e) {}
  if (hashIndex && el.querySelectorAll) {
    try {
      for (const img of el.querySelectorAll(PROFILE_PHOTO_SELECTOR)) {
        const src = String((img.getAttribute && img.getAttribute('src')) || '');
        const h = src.split(/[?#]/)[0].match(/\/([A-Za-z0-9._-]{16,})$/);
        if (h && hashIndex.get && hashIndex.get(h[1])) return String(hashIndex.get(h[1]));
      }
    } catch (_e) {}
  }
  return '';
}
