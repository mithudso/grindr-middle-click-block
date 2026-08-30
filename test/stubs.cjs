// Minimal browser stubs — enough for the userscript IIFE to run to completion in
// Node. Deliberately dumb: every DOM query returns empty, so a test exercises
// pure logic rather than a simulated page. Anything needing real layout belongs
// in a live-browser check, not here.
const noop = () => {};
const el = () => ({
  style: {}, classList: { add: noop, remove: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
  appendChild: noop, removeChild: noop, remove: noop, click: noop,
  addEventListener: noop, removeEventListener: noop, closest: () => null,
  querySelectorAll: () => [], querySelector: () => null, contains: () => false,
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0 }),
  innerText: '', textContent: '', className: '', tagName: 'DIV', children: [],
  parentElement: null, isContentEditable: false, focus: noop, dispatchEvent: () => true,
  compareDocumentPosition: () => 0,
});
const store = () => { const m = new Map(); return {
  getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
  removeItem: (k) => m.delete(k), clear: () => m.clear(),
  get length() { return m.size; }, key: (i) => [...m.keys()][i] }; };

globalThis.location = { href: 'https://web.grindr.com/', pathname: '/', search: '',
  origin: 'https://web.grindr.com', hostname: 'web.grindr.com' };
globalThis.document = Object.assign(el(), {
  documentElement: el(), head: el(), body: el(),
  createElement: () => el(), getElementById: () => null,
  addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
  readyState: 'complete', cookie: '',
});
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.navigator = { sendBeacon: () => true, userAgent: 'node-test' };
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} };
globalThis.WebSocket = class { send() {} addEventListener() {} removeEventListener() {} };
globalThis.Headers = class { forEach() {} get() { return null; } };
for (const n of ['InputEvent', 'KeyboardEvent', 'PopStateEvent', 'Event', 'MouseEvent']) {
  globalThis[n] = class { constructor(t, o) { Object.assign(this, o || {}); this.type = t; } };
}
globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.fetch = async () => ({ ok: true, status: 200, statusText: 'OK',
  headers: { get: () => 'application/json' }, clone() { return this; },
  json: async () => ({}), text: async () => '{}' });
globalThis.crypto = globalThis.crypto || { randomUUID: () => '00000000-0000-4000-8000-000000000000' };
globalThis.URL = globalThis.URL;
globalThis.Blob = class { constructor(p) { this.parts = p; } };
globalThis.HTMLTextAreaElement = class {}; globalThis.HTMLInputElement = class {};
globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.dispatchEvent = () => true;
