// Chat HTTP surface + conversation-id helpers. NOTE: sending a message produces
// no HTTP request (it goes over the WebSocket) — see compose.greet. The only HTTP
// trace of activity is the typing indicator.

/**
 * Build a conversation id. Grindr ids are SORTED ascending-numeric, not
 * `<me>:<them>`.
 * @returns {string} `"{lo}:{hi}"`
 */
export function conversationId(a, b) {
  const x = String(a), y = String(b);
  return (Number(x) <= Number(y)) ? `${x}:${y}` : `${y}:${x}`;
}

/**
 * Derive your own id by intersecting two different conversations you are part of
 * (a single sorted id names a pair but identifies neither party).
 * @returns {string} the shared id, or '' when the two share none
 */
export function deriveOwnId(convA, convB) {
  const a = String(convA).split(':');
  const b = new Set(String(convB).split(':'));
  for (const id of a) if (b.has(id)) return id;
  return '';
}

/**
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export function createChat(auth) {
  /**
   * Fetch message history. A 403 `urn:gr:err:unauthorized_action` means the
   * profile is blocked/hidden — fail fast, don't poll.
   */
  const getHistory = (convId, limit = 20) =>
    auth.request(`/api/v4/chat/conversation/${auth.enc(convId)}/message?limit=${encodeURIComponent(limit)}`);
  /** Announce typing (also the only HTTP proof the composer took input). */
  const sendTyping = (convId, status = 'Typing') =>
    auth.request('/api/v4/chatstatus/typing', { method: 'POST', body: { conversationId: String(convId), status } });
  return { getHistory, sendTyping };
}
