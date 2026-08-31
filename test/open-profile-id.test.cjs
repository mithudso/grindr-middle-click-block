// v0.65.0 — while a profile was open, the action keys and the click resolver
// targeted the top-left GRID TILE, not the profile on screen (see
// docs/grindr-dom-and-api.md, "Which profile is the overlay showing?"). The DOM
// half of the fix is verified against the live page; these pin the pure half and
// the literals it hangs on, so an edit that reintroduces a discarded source fails
// with an explanation.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const fs = require('node:fs');
const quiet = console.log; console.log = () => {}; console.warn = () => {};
const api = require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'), 'utf8');

test('pickAgreedId — exactly one distinct plausible id, or nothing', () => {
  const { pickAgreedId } = api;
  assert.strictEqual(pickAgreedId([]), '');
  assert.strictEqual(pickAgreedId(null), '');
  assert.strictEqual(pickAgreedId(['600000001']), '600000001');
  assert.strictEqual(pickAgreedId(['600000001', '600000001', 600000001]), '600000001', 'duplicates agree');
  assert.strictEqual(pickAgreedId(['garbage', '', null, undefined, '600000001']), '600000001', 'junk is ignored, not a vote');
  assert.strictEqual(pickAgreedId(['600000001', '600000002']), '', 'a disagreement is a guess — refuse');
  assert.strictEqual(pickAgreedId(['12345678901']), '', 'an 11-digit token is not a profile id');
  assert.strictEqual(pickAgreedId([null, undefined, '']), '');
});

test('the overlay is recognised by its pager arrows, and found before any geometry guess', () => {
  assert.ok(SRC.includes('\'[aria-label="Next Profile" i], [aria-label="Previous Profile" i]\''),
    'PROFILE_OVERLAY_MARKER must stay the observed pager-arrow labels');
  assert.match(SRC, /function findOpenProfileView\(\) \{\s*const overlay = findProfileOverlayRoot\(\);\s*if \(overlay\) return overlay;/,
    'findOpenProfileView must ask for the overlay root first');
  assert.ok(!SRC.includes('geometry fallback via ?profile=true'),
    'the ?profile=true "largest visible container" fallback returned #cascade — it must stay gone');
});

test('the action keys resolve their target from the on-screen source only', () => {
  assert.match(SRC, /const order = isProfileViewOpen\(\) \? \[routeId, viewId\]\s*: isOnChatPage\(\) \? \[chatPeer\]\s*: \[hover, cursor\];/,
    'resolveTargetProfileId order: overlay → route/fiber; /chat → conversation; grid → hover/cursor');
  assert.ok(!/const recent = \(\)/.test(SRC), 'lastViewedProfileId is the pager PREFETCH (one ahead) — never a target');
  assert.ok(!/const view = \(\) => fromEl\(findOpenProfileView\(\)\)/.test(SRC), 'resolving the view element through the click resolver read the first grid tile');
  assert.match(SRC, /if \(isOnChatPage\(\) && openConversation\.id && Date\.now\(\) - openConversation\.at <= OPEN_CONVERSATION_MAX_AGE_MS\)/,
    'the observed conversation is consulted only on /chat (an inbox refresh sets it to a stranger)');
  assert.match(SRC, /const overlay = findProfileOverlayRoot\(\);\s*if \(overlay && overlay\.contains\(target\)\)/,
    'a click inside the overlay must resolve via the overlay fiber, not a photo-hash walk');
});

test('the minimized HUD badge is our own UI, so the resolvers ignore clicks on it', () => {
  const m = SRC.match(/const HUD_MINI_ID = '([^']+)'/);
  assert.ok(m, 'HUD_MINI_ID must exist');
  assert.ok(m[1].startsWith('grindr-block-'), 'isOwnGreetUi keys on the grindr-block- prefix');
});

test('the overlay id needs two pane anchors — pager thumbnails and a blank pane must not vote', () => {
  assert.match(SRC, /const VIEW_MIN_ANCHORS = 2;/, 'one anchor agreeing with itself named the pager\'s neighbour thumbnail');
  assert.match(SRC, /if \(ids\.length < VIEW_MIN_ANCHORS\) return '';/);
  assert.match(SRC, /const inPager = \(el\) => !!\(el && el\.closest && el\.closest\(PROFILE_OVERLAY_MARKER\)\);/, 'anchors inside the Previous/Next controls are the neighbours, not the pane');
  assert.match(SRC, /width >= VIEW_PHOTO_MIN_PX/, 'a 40px thumbnail is not the pane photo');
  assert.match(SRC, /if \(source === 'overlay-fiber'\) applyAfterAction\(settings\.afterBlock, profileId, false\);/, 'an overlay gesture takes the same after-action as Home');
});
