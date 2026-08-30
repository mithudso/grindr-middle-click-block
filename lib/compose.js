// Composer + send-button resolution. Two composers can be on screen at once (the
// open profile's wide input and the floating chat drawer's narrow textarea); this
// prefers the profile composer so a greeting is not sent into the wrong drawer
// conversation. The Send button is anchored so "send location" (a trap that sits
// left of the input) is never clicked. Message send itself is over the WebSocket;
// success is confirmed by the composer clearing.

const SEND_RE = /^(send|send message|send chat|submit)$/i;
const DRAWER_CTRL = '[aria-label="close drawer"], [aria-label="Open chat list"], [data-testid^="chat-button"]';

function elName(el) {
  try {
    return String((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || el.innerText || el.textContent || '').trim();
  } catch (_e) { return ''; }
}

/**
 * Find the Send button near a composer via a bounded ancestor scan. `disabled`
 * (while the box is empty) is not disqualifying — fill first, then look.
 * @param {Element} composer
 * @returns {Element|null}
 */
export function findSendButton(composer) {
  if (!composer) return null;
  let scope = composer;
  for (let i = 0; i < 6 && scope; i += 1, scope = scope.parentElement) {
    let btns = [];
    try { btns = scope.querySelectorAll ? [...scope.querySelectorAll('button, [role="button"]')] : []; } catch (_e) {}
    const hit = btns.find((b) => SEND_RE.test(elName(b)));
    if (hit) return hit;
  }
  return null;
}

/** True when the composer belongs to the floating chat drawer, not the profile. */
export function isDrawerComposer(composer) {
  let scope = composer;
  for (let i = 0; i < 5 && scope; i += 1, scope = scope.parentElement) {
    try { if (scope.querySelector && scope.querySelector(DRAWER_CTRL)) return true; } catch (_e) {}
  }
  return false;
}

/** Find the active composer, preferring the profile input over the chat drawer. */
export function findComposer() {
  let inputs = [];
  try { inputs = [...document.querySelectorAll('input[type="text"], textarea')]; } catch (_e) {}
  const candidates = inputs.filter((c) => {
    try { return /say something/i.test((c.getAttribute && c.getAttribute('placeholder')) || '') || c.tagName === 'TEXTAREA' || c.type === 'text'; } catch (_e) { return false; }
  });
  return candidates.find((c) => !isDrawerComposer(c)) || candidates[0] || null;
}

/** Set the composer value and fire the `input` event the app listens for. */
export function fill(composer, text) {
  if (!composer) return;
  try {
    composer.value = text;
    composer.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_e) {}
}

/** Click Send (or press Enter). @returns {boolean} whether a send was attempted */
export function submit(composer) {
  const btn = findSendButton(composer);
  if (btn && btn.click) { try { btn.click(); return true; } catch (_e) {} }
  try { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; } catch (_e) {}
  return false;
}

/** The composer emptying is the only proof a WS send landed. */
export function confirmCleared(composer) {
  try { return !composer.value; } catch (_e) { return false; }
}

/**
 * Fill → submit → confirm-by-clear.
 * @param {string} text
 * @param {{composer?:Element}} [opts]
 * @returns {Promise<boolean>}
 */
export async function greet(text, { composer } = {}) {
  const c = composer || findComposer();
  if (!c) return false;
  fill(c, text);
  submit(c);
  return confirmCleared(c);
}
