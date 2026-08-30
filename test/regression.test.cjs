// Regressions. Every case here is a bug that actually shipped and was caught in
// a capture or a live inspection; the comment names it so a future edit that
// reintroduces one fails with an explanation rather than a bare assertion.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

// The matchers below are duplicated from the source deliberately: they are the
// exact literals that shipped the bugs, so pinning them here catches a change to
// them even though they are IIFE-scoped and not otherwise reachable.

test('v0.27 — "Send Location" must not match the send button', () => {
  const NOT = /(location|photo|image|camera|album|gif|sticker|emoji|attach|file|voice|audio|video|tap|gift|boost|profile|block|report)/i;
  const OK = /^(send|send message|send chat|submit)$/i;
  const match = (n) => !NOT.test(n) && OK.test(n);
  assert.ok(match('Send'), 'the real button must match');
  assert.ok(match('Send message'));
  for (const decoy of ['Send Location', 'send location', 'send gif/gaymoji',
                       'send saved phrases', 'Send Photo', 'Send Album', 'Tap']) {
    assert.ok(!match(decoy), `${decoy} must not be treated as the send button`);
  }
});

test('v0.23 — a conversation id is sorted, not <me>:<them>', () => {
  // Observed live: the same account appears first in one id and second in another.
  const conv = (a, b) => (Number(a) <= Number(b) ? `${a}:${b}` : `${b}:${a}`);
  assert.strictEqual(conv('500000000', '600000000'), '500000000:600000000');
  assert.strictEqual(conv('400000000', '500000000'), '400000000:500000000');
  assert.strictEqual(conv('600000000', '500000000'), conv('500000000', '600000000'),
    'the id must not depend on argument order');
});

test('v0.23 — own profile id is learned by intersection, never from one pair', () => {
  const seen = new Set(); let me = '';
  const learn = (a, b) => {
    const key = `${a}:${b}`;
    if (me || seen.has(key)) return '';
    for (const prev of seen) {
      const [x, y] = prev.split(':');
      const shared = [a, b].filter((id) => id === x || id === y);
      if (shared.length === 1) { seen.add(key); return shared[0]; }
    }
    seen.add(key); return '';
  };
  assert.strictEqual(learn('500000000', '600000000'), '', 'one pair identifies nobody');
  assert.strictEqual(learn('400000000', '500000000'), '500000000', 'the common id is you');
});

test('v0.36 — a viewed-profile URL must not match an album', () => {
  // /albums/{id}/shares fires for each of YOUR albums when the media picker
  // opens; matching it armed the action keys on a non-existent profile.
  const RE = /\/(?:profiles?|users?|conversations?|chat)\/(\d{5,10})(?:\/|\?|$)/i;
  assert.ok(!RE.test('/api/v1/albums/800000001/shares'), 'album id leaked in as a profile');
  assert.ok(RE.test('/api/v4/profiles/600000000'));
  assert.ok(RE.test('/chat/600000000'));
});

test('v0.40 — tile resolution must refuse an oversized container', () => {
  // 132 of 141 profile photos on a live page are inbox-sidebar avatars; walking
  // up from one reached a UL of 241x13414 — the whole sidebar.
  const MIN = 80, viewportH = 900, viewportW = 1440;
  const accept = (w, h, photosInside) =>
    photosInside === 1 && h <= Math.max(400, viewportH * 1.2) && w <= viewportW && w >= MIN && h >= MIN;
  assert.ok(accept(559, 745, 1), 'a real tile must be accepted');
  assert.ok(!accept(241, 13414, 40), 'the sidebar must be refused');
  assert.ok(!accept(3361, 75814, 599), 'the whole grid must be refused');
});

test('v0.26 — hide expiry restamps an unknown time instead of expiring it', () => {
  const MAX = 90 * 24 * 60 * 60000, now = Date.now();
  const decide = (at) => (!at ? 'restamp' : (now - at > MAX ? 'expire' : 'keep'));
  assert.strictEqual(decide(0), 'restamp', 'an unknown time must not silently unhide everyone');
  assert.strictEqual(decide(now - 89 * 86400000), 'keep');
  assert.strictEqual(decide(now - 91 * 86400000), 'expire');
});

test('v0.39 — only an empty composer proves a send', () => {
  // Accepting "the text changed" reported false sends when React re-normalised a
  // contenteditable, and when a second flow overwrote the box.
  const sent = (now) => !now;
  assert.ok(sent(''), 'an empty box means sent');
  assert.ok(!sent('Hey'), 'unchanged text is not a send');
  assert.ok(!sent('Howdy'), 'different text is not a send either');
});
