'use strict';
// Minimal browser/fetch stubs for the library tests. A settable __stubFetch drives
// fetch responses; __stubFetchCalls records outbound requests.
const noop = () => {};

globalThis.__stubFetch = { ok: true, status: 200, statusText: 'OK', json: {}, text: '{}' };
globalThis.__stubFetchCalls = [];
globalThis.fetch = async (url, init) => {
  const r = globalThis.__stubFetch;
  globalThis.__stubFetchCalls.push({ url: String(url), init: init || {} });
  return {
    ok: r.ok,
    status: r.status,
    statusText: r.statusText || '',
    headers: { get: (k) => (r.headers && r.headers[k]) || (String(k).toLowerCase() === 'content-type' ? 'application/json' : null) },
    async json() { return typeof r.json === 'function' ? r.json() : r.json; },
    async text() { return typeof r.text === 'function' ? r.text() : r.text; },
    clone() { return this; },
  };
};

if (!globalThis.AbortController) {
  globalThis.AbortController = class { constructor() { this.signal = {}; } abort() {} };
}
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
if (!globalThis.Event) globalThis.Event = class Event { constructor(type) { this.type = type; } };
if (!globalThis.KeyboardEvent) globalThis.KeyboardEvent = class KeyboardEvent { constructor(type, o) { this.type = type; Object.assign(this, o || {}); } };
globalThis.Element = globalThis.Element || class Element {};
globalThis.location = globalThis.location || { href: 'https://web.grindr.com/', origin: 'https://web.grindr.com', pathname: '/', search: '' };
globalThis.innerHeight = globalThis.innerHeight || 900;

module.exports = { noop, resetFetch: () => { globalThis.__stubFetchCalls = []; } };
