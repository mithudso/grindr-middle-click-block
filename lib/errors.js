// Typed errors for the Grindr interaction library. Never place a token in a
// message — callers surface these to logs/UIs.

/**
 * Best-effort extraction of a `urn:gr:err:*` code from an error body.
 * @param {any} body parsed object or raw JSON string
 * @returns {string} the code, or '' when none is present
 */
export function parseErrorCode(body) {
  try {
    const o = typeof body === 'string' ? JSON.parse(body) : body;
    const c = o && o.code;
    return typeof c === 'string' && c.startsWith('urn:gr:err:') ? c : '';
  } catch (_e) {
    const m = String(body || '').match(/urn:gr:err:[a-z_]+/i);
    return m ? m[0] : '';
  }
}

/** An HTTP or protocol failure from a Grindr call. */
export class GrindrError extends Error {
  /**
   * @param {string} message human-readable summary (no secrets)
   * @param {{status?:number, code?:string, path?:string}} [meta]
   */
  constructor(message, { status = 0, code = '', path = '' } = {}) {
    super(message);
    this.name = 'GrindrError';
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

/** Raised when a request is attempted before credentials are set. */
export class GrindrAuthError extends GrindrError {
  constructor(message = 'Grindr credentials are not set') {
    super(message, { status: 0, code: 'no-auth' });
    this.name = 'GrindrAuthError';
  }
}
