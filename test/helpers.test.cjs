// Pure helpers — the real implementations, not copies.
//
// Every block below states WHY the helper exists and WHAT it must guarantee,
// so a future reader can tell three things apart without re-deriving anything:
//   * what the helper is for,
//   * whether it currently does that,
//   * and, if a test fails, what the behaviour was supposed to be versus what
//     it has become.
//
// Where a rule came from a real capture, the comment says so. That is the
// difference between a test that pins behaviour and a test that merely records
// whatever the code happened to do the day it was written.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const quiet = console.log; console.log = () => {}; console.warn = () => {};
const H = require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

// ── isPlausibleProfileId ────────────────────────────────────────────────────
// WHY: the single gate every profile id crosses before reaching the API. Two
// shipped bugs came from it being too loose — a 12-digit tracking token and a
// 20-digit DOM value both passed an earlier version and produced doomed POSTs
// plus poisoned block-list entries.
// MUST: accept only a 5-10 digit STRING. Not a number, not padded, not longer.
test('isPlausibleProfileId accepts exactly 5-10 digit strings', () => {
  const f = H.isPlausibleProfileId;
  assert.strictEqual(H.MIN_PROFILE_ID_LEN, 5, 'the accepted range is part of the contract');
  assert.strictEqual(H.MAX_PROFILE_ID_LEN, 10);
  for (const good of ['12345', '1234567890', '600000000']) assert.ok(f(good), `${good} should pass`);
  for (const bad of ['1234', '12345678901', '453789221432', '', 'abc', '1234a', ' 12345 ', '1.2e7', null, undefined]) {
    assert.ok(!f(bad), `${JSON.stringify(bad)} must be rejected`);
  }
  assert.ok(!f(12345), 'a NUMBER must be rejected — ids are strings everywhere else');
});

// ── conversationIdFor ───────────────────────────────────────────────────────
// WHY: a conversation id is SORTED, not "<me>:<them>". Assuming the latter made
// the script learn a stranger's id as the user's own, and later address a chat
// route to the wrong pair.
// MUST: be order-independent, and sort NUMERICALLY (lexicographic agrees only
// while every id has the same digit count, which is not guaranteed).
test('conversationIdFor sorts numerically and ignores argument order', () => {
  const f = H.conversationIdFor;
  assert.strictEqual(f('500000000', '600000000'), '500000000:600000000');
  assert.strictEqual(f('600000000', '500000000'), '500000000:600000000', 'order must not matter');
  assert.strictEqual(f('99999999', '100000000'), '99999999:100000000',
    'numeric, not lexicographic — "99999999" > "100000000" as strings');
  assert.strictEqual(f('12345', 'nope'), '', 'an implausible half yields no id');
  assert.strictEqual(f('', ''), '');
});

// ── isUsableHash ────────────────────────────────────────────────────────────
// WHY: the value is interpolated into a CSS selector (img[src*="..."]). A hash
// containing a quote or bracket would break the selector or worse.
// MUST: accept only long, plain [A-Za-z0-9._-] tokens.
test('isUsableHash refuses anything that could escape a selector', () => {
  const f = H.isUsableHash;
  assert.ok(f('a1b2c3d4e5f6a7b8'), 'a normal hash should pass');
  assert.ok(f('a_b-c.d1234567890'));
  for (const bad of ['abc"] , *', 'abc\\', 'short', '', 'has space here', null, 12345]) {
    assert.ok(!f(bad), `${JSON.stringify(bad)} must be rejected`);
  }
});

// ── greeting time tokens ────────────────────────────────────────────────────
// WHY: a greeting may reference the time of day. A failed substitution sends a
// literal "{timeOfDay}" to a stranger.
// MUST: cover all 24 hours, and never leave a brace behind.
test('greeting tokens resolve for every hour and leave no braces', () => {
  for (let h = 0; h < 24; h += 1) {
    const t = H.greetingTimeTokens(h);
    assert.ok(t && typeof t === 'object', `hour ${h} produced no tokens`);
    for (const v of Object.values(t)) {
      assert.ok(typeof v === 'string' && v.length, `hour ${h} produced an empty token`);
    }
  }
  const out = H.resolveGreetingTokens('Morning {timeOfDay}, have a good {dayPart}');
  assert.ok(!out.includes('{'), `a token survived substitution: ${out}`);
});

// ── idsFromListPayload ──────────────────────────────────────────────────────
// WHY: parses Grindr's hides/blocks lists, which drive block-tier reconciliation.
// The real /api/v1/hides body is {"hides":[{profileId,displayName,mediaHash}]}.
// MUST: pull ids out structurally, fall back to a scan on an unknown shape, and
// never invent ids that are not plausible profile ids.
test('idsFromListPayload reads the real list shapes', () => {
  const f = H.idsFromListPayload;
  const hides = JSON.stringify({ hides: [
    { profileId: 600000000, displayName: 'a', mediaHash: 'h' },
    { profileId: 400000000, displayName: null, mediaHash: 'h' }] });
  const got = f(hides);
  assert.ok(got.has('600000000') && got.has('400000000'), 'both ids should be found');
  assert.strictEqual(got.size, 2, 'displayName/mediaHash must not contribute ids');
  const blocks = JSON.stringify({ blocks: [{ profileId: 500000000 }] });
  assert.ok(f(blocks).has('500000000'), 'the blocks shape is identical and must work too');
  assert.strictEqual(f('{"hides":[]}').size, 0);
  assert.strictEqual(f('not json at all').size, 0, 'garbage must not yield ids');
});

// ── key bindings ────────────────────────────────────────────────────────────
// WHY: Insert does not exist on Apple keyboards and F8 is a media key, so a
// binding is a LIST of accepted event.key values rather than one string.
// MUST: match case-insensitively, accept either a string or an array, and
// render a readable label.
test('key bindings accept aliases in either form', () => {
  assert.deepStrictEqual(H.keyList('Home'), ['Home'], 'a bare string is a one-alias list');
  assert.deepStrictEqual(H.keyList(['Insert', 'F8']), ['Insert', 'F8']);
  assert.ok(H.keyMatches(['Insert', 'F8'], 'F8'));
  assert.ok(H.keyMatches(['Insert', 'F8'], 'insert'), 'matching is case-insensitive');
  assert.ok(!H.keyMatches(['Insert', 'F8'], 'Home'));
  assert.strictEqual(H.keyLabel(['Insert', 'F8']), 'Insert or F8');
  assert.strictEqual(H.keyLabel('Home'), 'Home');
});

// ── send-button matching ────────────────────────────────────────────────────
// WHY: Grindr's composer row carries "send location", "send gif/gaymoji" and
// "send saved phrases" alongside the real "Send", and the location control sits
// LEFT of the input so it wins on DOM order. A substring match clicked it,
// opening the location picker and reporting a successful send.
// MUST: match the whole name only, and reject every attachment control.
test('send-button matching is anchored and rejects attachment controls', () => {
  const ok = (n) => !H.NOT_SEND_BUTTON_RE.test(n) && H.SEND_BUTTON_TEXT_RE.test(n);
  for (const good of ['Send', 'send', 'Send message', 'Submit']) assert.ok(ok(good), `${good} should match`);
  for (const bad of ['Send Location', 'send location', 'send gif/gaymoji', 'send saved phrases',
                     'Send Photo', 'Send Album', 'Tap', 'Friendly Tap', 'Resend', 'sending']) {
    assert.ok(!ok(bad), `${bad} must not be treated as the send button`);
  }
});

// ── chat-button matching ────────────────────────────────────────────────────
// WHY: an open profile shows controls whose names merely CONTAIN "chat" or
// "message" — and the inbox sidebar carries ~190 more.
// MUST: reject the neighbours that are not a chat control.
test('chat-button matching rejects lookalike controls', () => {
  for (const bad of ['Video chat', 'Unread messages', 'Message requests', 'Chat settings',
                     'mute chat', 'Report', 'Block']) {
    assert.ok(H.NOT_CHAT_BUTTON_RE.test(bad), `${bad} should be excluded`);
  }
  assert.ok(!H.NOT_CHAT_BUTTON_RE.test('Chat'), 'the real control must survive the filter');
});

// ── pager matching ──────────────────────────────────────────────────────────
// WHY: a class attribute is a space-separated bag of utility names, so
// [class*="left"] matches align-left, pl-2, chevron-left-icon... On a
// utility-class build that covered much of the page.
// MUST: accept left/right only from an authored NAME, never from a class bag,
// and never treat a nav "Back" as the pager.
test('pager matching separates authored names from class bags', () => {
  assert.ok(H.PAGER_NAME_RE.next.test('Next profile'));
  assert.ok(H.PAGER_NAME_RE.next.test('Right'), 'a name may say right');
  assert.ok(H.PAGER_NAME_RE.prev.test('Previous'));
  assert.ok(H.PAGER_NAME_RE.prev.test('Left'));
  assert.ok(!H.PAGER_ID_RE.next.test('Right'), 'a CLASS must not match on a bare direction');
  assert.ok(!H.PAGER_ID_RE.prev.test('align-left'));
  assert.ok(H.PAGER_ID_RE.next.test('pager-next'));
  for (const bad of ['Go back', 'Back to grid', 'close', 'settings', 'send location']) {
    assert.ok(H.NOT_PAGER_RE.test(bad), `${bad} must never be clicked as a pager`);
  }
});

// ── URL classification ──────────────────────────────────────────────────────
// WHY: /albums/{id}/shares fires for each of YOUR albums when the media picker
// opens. Matching it as a "viewed profile" armed the action keys on an album id.
// MUST: match profile-ish routes only, and never an album or a conversation pair.
test('viewed-profile URLs exclude albums and conversation pairs', () => {
  const RE = H.VIEWED_PROFILE_URL_RE;
  assert.ok(RE.test('/api/v4/profiles/600000000'));
  assert.ok(RE.test('/chat/600000000'));
  assert.ok(!RE.test('/api/v1/albums/800000001/shares'), 'an album id must not become a target');
  assert.ok(!RE.test('/api/v4/chat/conversation/500000000:600000000/message'),
    'a conversation pair is not a single viewed profile');
});

// WHY: walking a hides/blocks LIST response must not be mistaken for Grindr
// serving those profiles again — that read demoted every confirmed block on
// every page load.
// MUST: identify both list endpoints and nothing else.
test('list-response URLs are identified precisely', () => {
  const RE = H.LIST_RESPONSE_URL_RE;
  assert.ok(RE.test('/api/v1/hides'));
  assert.ok(RE.test('/api/v4/blocks?page=1'));
  assert.ok(RE.test('/api/v3/blocks'));
  assert.ok(!RE.test('/api/v4/cascade/?pageNumber=1'), 'the cascade is not a list response');
  assert.ok(!RE.test('/api/v1/me/hides/600000000'), 'a WRITE is not a list response');
});
