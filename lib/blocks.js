import { GrindrError } from './errors.js';

const HIDE_BASE = '/api/v1/me/hides';
const BLOCK_BASE = '/api/v3/me/blocks';
const HIDE_LIST = '/api/v1/hides';
const BLOCK_LIST = '/api/v4/blocks?page=1';

/**
 * Block / hide client. Hide and block are mutually exclusive server-side states —
 * this never chains a block after a hide (a trailing block undoes the hide).
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export function createBlocks(auth) {
  /** POST a hide. @returns {Promise<true>} */
  const hide = async (id) => { await auth.request(`${HIDE_BASE}/${auth.enc(id)}`, { method: 'POST' }); return true; };
  /** POST a real block. @returns {Promise<true>} */
  const block = async (id) => { await auth.request(`${BLOCK_BASE}/${auth.enc(id)}`, { method: 'POST' }); return true; };
  /**
   * Reverse a block. `kind:'hide'` throws — DELETE /api/v1/me/hides returns 501,
   * there is no un-hide via that verb.
   * @param {string} id
   * @param {'block'|'hide'} [kind]
   * @returns {Promise<true>}
   */
  const unblock = async (id, kind = 'block') => {
    if (kind === 'hide') {
      throw new GrindrError('no un-hide: DELETE /api/v1/me/hides returns 501', { status: 501, code: 'no-unhide', path: HIDE_BASE });
    }
    await auth.request(`${BLOCK_BASE}/${auth.enc(id)}`, { method: 'DELETE' });
    return true;
  };
  /** GET the full (unpaginated) hides list. @returns {Promise<Array>} */
  const listHides = async () => {
    const d = await auth.request(HIDE_LIST);
    return Array.isArray(d && d.hides) ? d.hides : [];
  };
  /** Walk the paginated blocks list until a page returns no rows. @returns {Promise<Array>} */
  const listBlocks = async ({ maxPages = 20 } = {}) => {
    const out = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const d = await auth.request(BLOCK_LIST.replace(/page=\d+/, `page=${page}`));
      const rows = Array.isArray(d && d.blocks) ? d.blocks : [];
      if (!rows.length) break;
      for (const r of rows) out.push(r);
    }
    return out;
  };
  return { hide, block, unblock, listHides, listBlocks };
}
