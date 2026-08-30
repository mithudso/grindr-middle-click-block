import { createAuth } from './auth.js';
import { createBlocks } from './blocks.js';
import { createAlbums } from './albums.js';
import { createChat, conversationId, deriveOwnId } from './chat.js';
import { createProfiles } from './profiles.js';
import * as dom from './dom.js';
import * as compose from './compose.js';
import { createObserver } from './observe.js';
import { idsFromListPayload, reconcileTiers } from './reconcile.js';
import { createLimiter } from './limiter.js';

/** Library version (distinct from the userscript's version). */
export const VERSION = '0.1.0';

export { conversationId, deriveOwnId, idsFromListPayload, dom, compose, createObserver, createLimiter };

/**
 * Build a Grindr client. Provide explicit credentials, or `observe:true` to
 * auto-capture them from live traffic.
 * @param {{token?:string, countryCode?:string, locale?:string, base?:string, observe?:boolean}} [opts]
 */
export function createClient({ token, countryCode, locale, base, observe = false } = {}) {
  const auth = createAuth({ token, countryCode, locale, base });
  const client = {
    auth,
    blocks: createBlocks(auth),
    albums: createAlbums(auth),
    chat: createChat(auth),
    profiles: createProfiles(auth),
    dom,
    compose,
    reconcile: { idsFromListPayload, reconcileTiers: (opts) => reconcileTiers(client, opts) },
    limiter: createLimiter,
    observer: null,
  };
  if (observe) {
    client.observer = createObserver({ onAuth: (a) => auth.set(a) });
    client.observer.install();
  }
  return client;
}
