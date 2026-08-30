// ==UserScript==
// @name         Grindr Middle-Click Block
// @namespace    https://github.com/mithudso/aggregaytor
// @version      0.61.0
// @description  Middle-click or shift+left-click any profile on web.grindr.com to hide/block it. Every distinct click is queued (per-target click dedupe so fast clicks on different profiles are never dropped), serialized behind a rate-limited queue so Grindr won't force-logout you for burst blocks, read back to confirm it actually applied, and retried with exponential backoff until it sticks. Multi-strategy profile-id resolution (URL, DOM, photo-hash, React fiber). Each click POSTs a hide (POST /api/v1/me/hides/{id}), falling back to a block (POST /api/v3/me/blocks/{id}) only if the hide fails — hide and block are mutually exclusive, and firing the block after a successful hide silently undoes it. Replays the required country-code/l-locale headers (their absence caused 501s) and trusts the 200 as confirmation. Sniffs Grindr's own traffic to rediscover endpoints (__grindrBlock_captureWrites / __grindrBlock_seenActions) and stops retrying a dead 404/405/501 route instead of looping forever. 30-second Undo window on every block. Verbosity-gated logging (__grindrBlock_setLog) + kill-switches (__grindrBlock_cancelBlock / __grindrBlock_clearQueue). In a chat, middle-click or shift+left-click inside the composer — or shift+right-click anywhere on the /chat page — types and sends a random canned greeting instead of blocking. v0.10.10: reverted the v0.10.7–0.10.9 forced hide→block→hide→block chain (a trailing block undoes the hide; the app fires a lone hide). The real "hide only sometimes works" bug was a malformed resolved profile id (e.g. a 12-digit tracking token like 453789221432 passing the old 15-digit plausibility gate) — fixed by tightening isPlausibleProfileId to ≤10 digits so resolution falls through to the authoritative React-fiber profileId. v0.10.12: the real wrong-id source was the photo-hash index never covering the cascade — indexProfileFromPayload ignored primaryImageUrl (where the hash actually lives) and walkAndIndex only sampled the first 50 of ~600 grid tiles, so grid clicks fell through to an attribute-scan that grabbed unrelated ids (e.g. 600000012, a profile not even in the cascade). Now the cascade's image-URL hash is indexed for every tile, so a middle-click resolves the same profileId the app uses on click-through — without opening the profile. v0.11.0: added a persistent, LOCAL-only block list (localStorage key grindrMiddleClickBlockList_v1) — a middle-click block now also records the profileId locally, and a debounced MutationObserver + cascade-payload hook + periodic backstop sweep re-hide any listed profile that reappears on scroll/refresh and re-submit the block through the rate-limited queue (per-profile throttled to one re-block per minute). Inspect/edit via __grindrBlock_blockList / __grindrBlock_removeFromBlockList / __grindrBlock_clearBlockList; an Undo within the 30s window drops the id from the list. v0.11.1: __grindrBlock_undoAll() now also drops each profile from the persistent local block list (so the enforcement backstop no longer instantly re-hides/re-blocks an undone profile), and a hide that returns 429 no longer fires the fallback block POST (which compounded the very rate-limit the queue guards against). v0.12.0: added an automatic profile-text filter — every profile sniffed from Grindr's traffic has its text (display name, About Me, tags, etc.) checked against a configurable keyword list (TEXT_FILTER_KEYWORDS near the top of the file) and, on a match, is either hidden DOM-only or routed through the rate-limited block queue per TEXT_FILTER_ACTION ('hide'|'block'), with optional whole-word matching (TEXT_FILTER_WHOLE_WORD) and inspection via __grindrBlock_textFilter() / __grindrBlock_textHidden(); an auto-block also pops a rich Undo toast showing the matched profile's name, photo, and a snippet of its profile text. v0.13.0: added a "stay logged in" guard (STAY_LOGGED_IN near the top) that neutralises Grindr's 30-minute idle auto-logout from the userscript sandbox — at document-start it rewrites the bundle's long idle setTimeout countdown to ~99h (IDLE_TIMEOUT_OVERRIDE_MS), preserves this script's own localStorage/sessionStorage keys through logoutCleanup()'s clear() (GUARD_LOCALSTORAGE), and dispatches a periodic synthetic mousemove as a backstop (KEEPALIVE_INTERVAL_MS); inspect via __grindrBlock_stayLoggedIn(). The 401-refresh-fail and server-side ban logouts are intentionally left intact (they are reactive to server responses, not client timers). v0.14.0: skip the one-time "Grindr Web Beta" welcome modal (the "Notifications Sounds" / "Using Grindr discreetly? … Let's Go!" popup) that reappears after every login (SKIP_BETA_DIALOG near the top). The dialog renders only while sessionStorage["grindrWebBetaDialogDismissed"] is absent — and logout wipes it — so at document-start we pre-seed that flag (it never opens) and, as a fallback for an in-SPA re-login that mounts it anyway, click its dismiss button (id="beta-dismiss-btn"); inspect via __grindrBlock_skipBetaDialog(). v0.15.0: shift+left-click is now a second block gesture — it runs the same hide/block path as middle-click (including the 30-second Undo window) and swallows the follow-up navigation click so the profile is blocked without being opened. shift+right-click is repurposed: it no longer blocks; on the /chat page it sends a random canned intro greeting (suppressing the native context menu), and anywhere else the normal context menu shows. v0.16.0: shift+right-click now greets the profile UNDER THE CURSOR anywhere (not only the /chat page) — modeled on the Sniffies userscript. It picks a random greeting, queues it locally keyed by profileId (localStorage grindrMiddleClickPendingGreet_v1, prefixed so the stay-logged-in guard preserves it), opens that profile's /chat/<id> in a new tab (same-tab navigation if the popup is blocked), and the script instance on that chat page polls for the composer, fills + sends the queued greeting, then self-closes the opened tab; a stale queued greeting (>10min) is discarded, and shift+right-click on the chat you are already viewing still sends inline. Inspect/fire via __grindrBlock_pendingGreets() / __grindrBlock_greet(id). v0.16.1: fixed shift+right-click sometimes BLOCKING instead of greeting — a macOS trackpad secondary click (two-finger tap / Force Touch right-click) can report button:0 on its mousedown and only reveal itself as a right-click via the contextmenu that follows, so the old mousedown-based shift+left-click detection (button:0 + shiftKey) fired a real block on top of the greet. Shift+left-click block detection moved from `mousedown` to `click` (a real click only ever fires for a genuine primary-button release, never for a right-click/trackpad-secondary-click), removing the ambiguity and the now-unneeded follow-up-click swallower. v0.17.0: added keyboard hotkeys for the main cascade (scroll) page — ArrowRight moves a visual cursor to the next profile tile, ArrowLeft to the previous one (scrolling it to the middle of the viewport, and scrolling the page + retrying once at the end of the virtualised grid so more tiles mount), and 'f' sends a random canned greeting to the profile under the cursor via the exact shift+right-click path (queue by profileId → open /chat/<id> in a background tab → send → self-close), then advances the cursor. Hotkeys are inert while typing, while ctrl/cmd/alt is held, on the /chat page, and when no tiles are rendered; the cursor heals itself when the virtualised grid unmounts the tile it points at (re-derived from the remembered profileId via the photo-hash index). Configure via the HOTKEYS_ENABLED / HOTKEY_* knobs near the top; inspect and drive from the console with __grindrBlock_hotkeys(). v0.18.0: reworked the hotkeys after real use. NAVIGATION moved off the arrow keys onto Insert (next) / Delete (previous) and now fires EVEN WHILE A TEXT FIELD HAS FOCUS — Grindr's own arrow navigation only works while nothing is focused, so clicking the chat box or any button killed it until you clicked back out; Insert/Delete don't collide with editing (Backspace is untouched, this Delete is fn+Delete) and are easy to bind to a Logitech mouse button. On an open full-screen profile, navigation blurs whatever stole focus and re-dispatches the arrow key Grindr listens for, falling back to clicking the view's own next/prev control if the view didn't move; on the grid it walks the tile cursor as before. 'f' now targets the profile under the MOUSE POINTER on the grid and the open profile/chat elsewhere, resolved through a multi-source chain (hover → URL → profile view → tile cursor → the last single profile the app itself fetched) that covers the cases where no profile id is resolvable from the DOM. The greeting list was rewritten to sound casual rather than formal, with only two time-aware entries using {timeOfDay}/{dayPart} tokens resolved from the local clock at pick time. NEW: 'u' progressively unlocks (shares) your albums — album ids are discovered from Grindr's own album responses, the share request is learned and templatised the first time you share one through the app's UI, and each press sends the next album that profile doesn't already have; a persisted ledger (fed by both our sends and yours) keeps it progressive, and an already-shared response is recorded and skipped instead of being counted as an unlock (a re-share doesn't re-notify them). Inspect via __grindrBlock_hotkeys() / __grindrBlock_albums(), arm learning with __grindrBlock_captureAlbums(), override with __grindrBlock_setAlbumRecipe(). v0.19.0: the album feature is no longer guessed — a HAR of the app sharing two albums confirmed the API, so it is now hardcoded: POST /api/v1/albums/{albumId}/shares with body {"profiles":[{"profileId":N,"shareId":"<uuid4>"}]} (the shareId is client-minted and becomes the id of the chat message the recipient sees, so every share mints a fresh one), and GET on that same path returns {"profileIds":[…]} — the authoritative list of who already holds that album. 'u' now ASKS that list before sharing instead of guessing from status codes, so an album someone already has is never re-sent (re-sharing doesn't re-notify them; Grindr makes you Stop Sharing first). ALBUM_ORDER near the top is an explicit unlock order (pre-filled with the two confirmed ids); other albums are discovered automatically because Grindr fetches /albums/{id}/shares for each of YOUR albums when the Media picker opens, and that URL shape is only ever used for an album you own. Un-sharing is the one call no capture covers, so it is probed across three plausible DELETE shapes and each is VERIFIED against the shares list — used only when you deliberately call __grindrBlock_reshareAlbum(pid, albumId) to re-notify someone. 'u' never advances the cursor. Also added two containment measures after a report of the chat view collapsing during the album picker: while any Grindr modal/drawer/picker is open, the block-list enforcement sweep and the synthetic keep-alive mousemove (the only things this script does to the page unprompted) stand down; and __grindrBlock_disable() is a real kill switch that no-ops every listener, disconnects the observers, stops the timers and restores the patched globals (fetch, XHR, WebSocket.send, sendBeacon, setTimeout, storage clear) so the script can be ruled in or out in ten seconds without uninstalling. v0.20.0: fixed "pressed f and it immediately logged me out". Greeting a profile you weren't already chatting with opened /chat/<id> in a NEW TAB (or, if the popup was blocked, navigated the current one). Either way a SECOND instance of Grindr's app boots and refreshes the session token via POST /v2/api-tokens; Grindr rotates the refresh token, so that refresh invalidates the token the original tab holds and the original tab is logged out on its next call — which also explains the earlier "the chat screen closed and threw me back to the grid" full reloads. Greeting now changes the route INSIDE the running app instead (history.pushState + synthetic popstate, or a click on an in-app link when one is on screen), fills and sends, then routes back to where you were — no document load, no second instance, no token refresh (GREET_MODE='spa'; 'newtab' keeps the old behaviour and is documented as the logout risk, 'inline' never navigates). Album un-sharing is now CONFIRMED rather than probed, from a HAR of the app's own Stop Sharing button: PUT /api/v1/albums/{albumId}/unshares with {"profiles":[{"profileId":N,"shareId":"<fresh uuid4>"}]} — the three-shape DELETE probe is gone. The chat message a share produces is confirmed too: type "Album", messageId "<ts>:<shareId>", built server-side from the uuid we mint, so a replayed share does produce the album card in the chat. ALBUM_ORDER is seeded with the nine album ids observed on the account, and __grindrBlock_scanAlbums() reads the "My Albums" panel to pair every album id with the name printed on its tile (the cover CDN path carries /<ownerProfileId>/<albumId>/) and adopt that display order — persisted, and it wins over the seed; __grindrBlock_setAlbumOrder() / __grindrBlock_nameAlbum() edit it by hand. Added __grindrBlock_why(), which reports every precondition the action keys depend on (disabled, auth captured, where you are, resolved target, rotation size, next album for that target) so a silent keypress can be diagnosed in one call — note that __grindrBlock_disable() makes EVERY hotkey a no-op until __grindrBlock_enable() or a reload. v0.21.0: fixed the greet landing on the generic chat screen and timing out. Routing to /chat/<profileId> was wrong: the app's ChatDeepLink module hands whatever follows /chat/ to ensureConversationById, which POSTs it to /api/v1/inbox/conversation — a HAR of the failure shows POST ["600000010"] → 500 internal_error, after which the app falls back to the chat list and our composer poll times out. Grindr's conversation id is "<myProfileId>:<theirProfileId>" (visible throughout its own traffic, e.g. /api/v4/chat/conversation/500000000:600000001/read), so the route is now /chat/<me>:<them> (chatRouteFor). That needs OUR OWN profile id, which is never in the DOM but appears in traffic three ways, all now learned and persisted: a conversation id, an album cover path /<ownerProfileId>/<albumId>/ whose album id we already proved is ours, and the private-media CDN path for your own expiring pics. Until it is known a greet REFUSES to navigate rather than fire another 500 (__grindrBlock_setMyProfileId(id) sets it by hand). Chat-URL parsing everywhere now understands the <me>:<them> form (chatPeerIdFromPath). Also fixed __grindrBlock_scanAlbums() returning []: the My Albums panel renders plain hash thumbnails carrying no album id, so the scan now reads the album id from the React fiber behind each tile as well as from a cover URL, and __grindrBlock_loadAlbumNames() / __grindrBlock_nameAlbumsInOrder() fill in names when the panel yields ids but no labels. v0.22.0: greeting no longer deep-links at all. A capture of the v0.21 attempt shows the app POSTing a correctly-formed conversation id — ["600000011:400000002"] — to /api/v1/inbox/conversation and STILL getting 500: that endpoint resolves a conversation that already exists, and for someone you have never messaged there is nothing to resolve. (That capture also exposed a second bug: the "me" in that id was a stranger's. v0.21 learned your profile id partly from the private-media CDN path, which also serves the expiring pics OTHER people send you. That heuristic is removed and any id stored by it is discarded on upgrade.) GREET_MODE now defaults to 'ui', which drives the app's own flow instead: open the profile (clicking the grid tile if needed), click its Chat button, wait for the composer, type, send, then Escape/route back to where you were — the only path that reliably creates a NEW conversation, because it is the path the app uses. Each step is polled with a timeout and unwinds cleanly on failure; 'spa' remains available for existing conversations and 'newtab' remains documented as the logout risk. Album naming: GET /api/v1/albums/{id} returns 405 (the path exists, that verb doesn't), so the per-album probe is replaced by a one-time probe of five plausible LIST endpoints, keeping the first that returns album objects and adopting its order; and ALBUM_ORDER_BY_NAME (default ['stuff','ass']) puts named albums at the front of the unlock rotation as soon as the names are known, so the order can be expressed without knowing which id is which. v0.23.0: fixed 'f' greeting the wrong person (or nobody) by correcting three URL assumptions this script was built on, all disproved by a HAR of a greet that actually SENT. (1) A conversation id is SORTED, not "<me>:<them>" — the same account appears as 500000000:600000000 (me first) and 400000000:500000000 (me SECOND), both ascending numerically. The old "the app always puts you first" rule therefore learned a STRANGER'S id as yours, the same class of bug v0.22 fixed for the CDN path while leaving this one in place; myProfileId is now learned by INTERSECTION (you are the one id common to two different conversations), which makes no ordering assumption, and any previously stored id is discarded on upgrade (ALBUM_STATE_VERSION 3). (2) An open profile is "/?profile=true" — a boolean flag with no id — and the photo lightbox adds "&lightbox=true"; the old parser knew neither, so isProfileViewOpen() fell through to a geometry guess. (3) The chat route is BARE "/chat": the app selects the conversation in its own state and never deep-links /chat/<id>, which is why every synthesised deep link 500'd at /api/v1/inbox/conversation. The open conversation is now learned from Grindr's own traffic instead — GET /api/v4/chat/conversation/<a>:<b>/message and the typing indicator's body, POST /api/v4/chatstatus/typing {"conversationId":"<a>:<b>"}. SAFETY: findProfileChatButton no longer falls back to scope=document. That fallback is what made a greet click Grindr's global "Chats" nav item (it matches [aria-label*="chat"]), open the INBOX, and load an unrelated conversation — a greeting typed there would have gone to the wrong person. It now searches only the open profile view, skips nav/header/sidebar/lightbox chrome, and returns null rather than guessing. On top of that, typeAndSendGreeting refuses to type when the observed open conversation does not involve the target, and re-checks AFTER filling (filling fires the typing POST, which names the conversation) so even a brand-new chat is verified before the send; a mismatch clears the box instead of sending. Also: the photo lightbox is detected and closed before hunting for the Chat button, and a click that opens it aborts the greet instead of burning the full 12s composer poll under a covering overlay (the exact failure captured in the bad HAR). Finally, a successful send produces NO http request — chat goes over the WebSocket, and the only HTTP trace is the typing POST — so the existing WebSocket.send wrapper now watches outbound frames for the greeting text and logs a positive confirmation when it sees it leave. v0.24.0: moved the action hotkeys off the letters 'f' and 'u' onto the six-key navigation cluster, so every hotkey is one contiguous block a mouse or macro pad can drive without touching the alphabet: Insert/Delete = previous/next profile (unchanged), Home = greet, End = unlock the next album, PageUp = block, PageDown = hide. The two new keys reuse existing paths rather than adding new ones — PageUp calls startBlock(), the same entry point the middle-click gesture uses (persistent local block list, rate-limited hide/block queue, 30-second Undo toast, and every dedupe/verify/retry/backoff guard that already protects a click), while PageDown performs the DOM-ONLY hide the text filter's 'hide' mode performs (no API call, nothing sent to Grindr, nothing persisted — the id joins the session-only hidden set and the enforcement sweep collapses the card until you reload). That mirrors the block-vs-hide distinction TEXT_FILTER_ACTION already draws, so PageDown costs nothing against the rate limiter and PageUp is the one that sticks; PageDown on an already-blocked profile says so instead of pretending to act. Both advance the tile cursor afterwards (HOTKEY_BLOCK_ADVANCES) the way Home already does. Note the deliberate trade-off: while NOT typing, these four keys no longer do their native job on the grid, because a hotkey that fires calls preventDefault() — in practice PageUp/PageDown stop scrolling the cascade, so use Insert/Delete (which scroll the cursor into view) or the wheel. Inside a text field nothing changes: the action keys are still ignored while typing, which is what leaves Home/End/PageUp/PageDown free to do their real editing jobs there. Keys are configurable via HOTKEY_GREET_KEY / HOTKEY_ALBUM_KEY / HOTKEY_BLOCK_KEY / HOTKEY_HIDE_KEY, and __grindrBlock_hotkeys() now reports all six and exposes .block() / .hide() alongside .greet() / .unlock(). v0.25.0: the PageDown hide is now PERSISTENT and self-reversing. Hidden profileIds live in localStorage under grindrMiddleClickHiddenList_v1 (STORAGE_KEEP_PREFIX, so the stay-logged-in guard preserves it through logout's clear()), stored as id -> hiddenAt, and the enforcement sweep collapses them on every re-render — so a hide survives reloads instead of lasting one session. It is still LOCAL-ONLY: no API call, nothing sent to Grindr, nothing charged against the rate limiter. The one thing that reverses it is the person themselves: any message from them unhides them and restores the card. The message shape is taken from a HAR of a real conversation fetch ({senderId, timestamp, conversationId, type, body}), and two guards make it behave — messages whose senderId is YOUR own id are skipped (so your side of a thread can't unhide someone you just hid), and the message must be NEWER than hiddenAt (so scrolling back through old history doesn't resurface everyone in it). Detection runs on two paths: a dedicated walk of every Grindr JSON response, kept separate from walkAndIndex because that walker's ARRAY_SAMPLE_CAP and depth limit are tuned for cascade payloads and a silently-missed message would look identical to the feature not working; and a WebSocket RECEIVE observer for live arrivals, since incoming chat never touches fetch. That observer wraps addEventListener('message') only, peeks inside its own try/catch, and always calls the original listener afterward, so it cannot break chat delivery — if the app instead assigns socket.onmessage it simply sees nothing and the response scan remains the backstop. A block now supersedes a hide (PageUp drops the id from the hide list) so a later message can't resurface someone you have since blocked. Also: an action key now only swallows the keystroke when it actually acted — each handler returns false when no profile resolves, and only a true return reaches preventDefault(), so Home/End/PageUp/PageDown keep their native behaviour over empty space and PageDown still scrolls the cascade there. New console helpers: __grindrBlock_hiddenList(), __grindrBlock_unhide(id), __grindrBlock_clearHiddenList(), plus .unhide() on __grindrBlock_hotkeys(). Set UNHIDE_ON_MESSAGE = false to make a hide unconditional. v0.26.0: three refinements to the hide list. (1) myProfileId is now SEEDED (MY_PROFILE_ID_SEED, confirmed from this account's own traffic as the id common to the conversations 500000000:600000000 and 400000000:500000000), with intersection learning kept as the backup rather than the only path. This matters because the self-check that stops YOUR OWN messages from unhiding someone you just hid needs to know who you are, and learning it by intersection needs two different conversations to have gone past first — until then that check could not fire. The seed is a starting value, not an override: it is adopted only into an empty slot, traffic that confirms it promotes it to learned, and traffic that CONTRADICTS it wins and logs the disagreement, because evidence beats a constant compiled in months earlier; a manual __grindrBlock_setMyProfileId() outranks both. (2) REACTIONS now count as reaching out. The HAR shows them as a bare array on the message they apply to — reactions:[{profileId,reactionType}] — carrying who reacted and nothing about when, and that missing timestamp is the whole difficulty, since the timestamp is exactly what stops old history from resurfacing everyone in it. A reaction added today can sit on a message from last year, so the parent message's timestamp is not a usable stand-in: trusting it would miss today's reaction, ignoring it would unhide half the list the moment you scrolled an old thread. So the two cases are split by HOW the reaction reached us, which is a sound proxy for when: arriving live on a WebSocket frame means it is happening now and unhides unconditionally, while one sitting in fetched history is only honoured when the message it hangs off is itself newer than the hide — the same rule messages already follow. A standalone live reaction frame with no senderId is handled too. (3) Hides now EXPIRE after 90 days (HIDE_MAX_AGE_MS, 0 disables), pruned on load and on every backstop sweep. An entry with an unknown hide time is re-stamped with now instead of expiring, since expiring it would silently unhide everyone on upgrade — the opposite of what an unknown time implies. __grindrBlock_hiddenList() now reports expiresInDays per entry. v0.27.0: fixed a greet that typed the phrase, opened the LOCATION PICKER, and then reported "Sent" when nothing had been sent. Two independent bugs, both visible in one HAR. (1) WRONG BUTTON: clickSendButton matched on aria.includes('send'), and Grindr's location control is named "Send Location" — it contains the word, and being left of the input it also came FIRST in DOM order, so it beat the real send arrow on the right every time. The HAR shows the sequence exactly: POST /api/v4/chatstatus/typing (our fill working), then 68ms later — precisely the setTimeout in typeAndSendGreeting — a fetch of assets/MapWithDot-*.js, the picker's map chunk, followed by mapbox tiles. Matching is now anchored to a whole name (^send|send message|send chat|submit$) instead of a substring, any candidate whose name mentions an attachment type (location, photo, camera, album, gif, sticker, emoji, attach, file, voice, video, tap, gift…) is rejected outright, and among survivors the one that comes AFTER the input in document order wins, because the send button sits right of the box while the attachment row sits left of it. This is the same failure mode as the v0.23 Chat-button fix: a substring match plus first-in-DOM-order grabbing a neighbouring control. (2) THE TOAST LIED: clickSendButton returned true whenever it clicked ANYTHING, and pressEnter returned true whenever dispatching didn't throw — which is always — so both send paths reported success without evidence, and "Sent: How's it going?" appeared while the text sat untouched in the box. Since chat travels over the WebSocket and no HTTP request can confirm a send, the composer itself is now the evidence: Grindr clears the box when a message goes out and leaves it alone when one doesn't, so submitComposer clicks send, polls up to ~1.2s for the box to clear, and only a cleared box may report "Sent". If it didn't clear, any panel the click opened is dismissed with Escape and the app's own Enter handler is tried, with the same verification — and a still-full box now honestly says "Typed … press Enter to send". All four send sites (hotkey greet, inline chat greet, SPA-route greet, URL auto-greet) were sharing the unverified pattern and all four now go through submitComposer; the auto-greet tab additionally only self-closes on a CONFIRMED send, where before a hopeful true could close the tab with the text still sitting in the box. v0.28.0: swept the remaining DOM matchers for the failure mode that has now bitten twice — a SUBSTRING match on an element name, plus first-in-DOM-order winning, selecting a neighbouring control instead of the intended one (the global "Chats" nav in v0.23, "Send Location" in v0.27). Of the six .click() call sites, three were already safe: the beta-dialog dismiss resolves an exact element id, spaNavigate matches an exact href, and the grid-tile click is resolved by profileId rather than by name. The other three are fixed here. (1) findProfileChatButton returned candidates[0], and the loose selector matches were collected BEFORE the exact text matches — so a control merely CONTAINING "chat" or "message" in its label always beat a button actually labelled "Chat" (e.g. "Video chat" or "Unread messages" appearing earlier in the DOM). Candidates are now RANKED, exact name over loose regardless of DOM order, and filtered through a not-a-chat-button list (unread, request, settings, mute, notification, video, voice, call, group, delete, archive, report, block, album, photo, location, gift, tap). (2) clickProfilePagerButton was the loosest matcher in the file: it included button[class*="left" i] and [class*="right" i], and a class attribute is a SPACE-SEPARATED BAG of utility names, so align-left, pl-2, right-panel and chevron-left-icon all matched — on a utility-class build that selector covered a large share of the buttons on screen and the first in DOM order got clicked. Class and testid matching is now anchored to a whole word, the naked directions "left"/"right" are accepted only from an authored accessible name and never from a class bag, app chrome is excluded, and a not-a-pager list rejects the genuinely dangerous neighbours ("Go back"/"Back to…" navigate AWAY from the profile rather than advancing it). (3) findChatComposer had no floor: it returned the highest scorer even at score 0, so it could never say "there is no composer here", only "here is the least-bad text field" — meaning any stray visible input would do, and a greeting could be typed into a SEARCH box, which looks exactly like a silent failure. Search/filter/url/email/password/phone/postal fields are now excluded outright and a minimum score of 3 is required — the lowest a real composer can earn (a message/chat name scores 4 alone; an unnamed textarea or contenteditable in the lower half of the viewport scores 2 + 1) — so an unnamed input at the top of the page now correctly yields null. v0.29.0: remapped the six hotkeys and documented them properly. The new layout is Insert = greet, Delete = unlock album, Home = block, End = hide, PageUp = previous profile, PageDown = next profile — actions on the four corner keys, navigation on the two page keys. A THE SIX KEYS table at the top of the hotkey section now states every binding, what it does, and whether it advances the cursor, so the mapping no longer has to be reconstructed by reading the keydown handler. ONE BEHAVIOUR IS LOST AND IT IS DELIBERATE: navigation no longer works while a text field has focus. Navigation sat on Insert/Delete since v0.18 precisely BECAUSE those two are inert in a text box (on a Mac the key labelled "delete" is Backspace, untouched; the Delete bound here is fn+Delete forward-delete, which almost nothing uses), which let it fire even with the chat composer focused — the fix for Grindr's own arrow navigation dying the moment you click the chat box. PageUp/PageDown are NOT inert: they scroll a focused textarea, so hijacking them while typing would break editing in the composer. HOTKEY_NAV_IN_TEXT_FIELDS is therefore false now, and clicking into the chat box means clicking back out before the page keys will step profiles. Setting HOTKEY_PREV_KEY/HOTKEY_NEXT_KEY back to 'Insert'/'Delete' and that flag back to true restores the old behaviour in three lines. Everything else is unchanged: all six keys stay ignored while typing, all six pass the keystroke through untouched when they have nothing to act on, and block still tells Grindr while hide still tells nobody. v0.30.0: output of a full multi-pass code audit (18 passes, five parallel bundles). Two CRITICAL wrong-target paths are closed. (a) greetViaUi's tile fallback clicked whatever card was under the mouse without checking it belonged to the target: findCardsForProfile returns [] whenever the id came from a source that never populated the photo-hash index, so the fallback handed back a DIFFERENT profile's tile and we opened it, pressed its Chat button and typed there — and greetTargetMismatch cannot veto that, because a brand-new conversation has no observed conversation and the check deliberately proceeds on 'unknown'. Both that path and the block/hide path now verify the card resolves back to the target (cardBelongsToProfile). (b) A 1.2s cooldown was guarding a 12-SECOND async state machine, so two Insert presses ~1.5s apart ran two concurrent greet flows and one flow's poll resolved on the other's composer. A single in-flight greet token now makes the flow single-threaded, registers every poll against it, and cancels on route change so an abandoned flow can no longer click or type into whatever replaced its screen. HIGH fixes: myProfileId provenance is persisted (myProfileIdSource), without which a SEEDED id was treated as LEARNED from the second page load onward and could never be corrected by traffic — and a wrong id there means your own messages unhide everyone you hid; goHome() no longer fires Escape and a route change in the middle of send verification, which was unmounting the composer exactly when the Enter fallback was needed; WebSocket.removeEventListener is now patched alongside addEventListener, so Grindr can actually detach its own message handler instead of processing every frame twice; a reaction with no timestamp in fetched history no longer unhides unconditionally (scrolling one old thread could empty the hide list); capturedAt is refreshed only by a CREDENTIAL header, so a lone accept-language can no longer keep a rotated-out token alive forever; the stay-logged-in guard can no longer kill the whole script at document-start when site data is blocked (reading window.localStorage throws SecurityError outside the guard's own try); blockSessionDead is finally READ inside processQueue, making the documented 401/403 pause real; and a stored album listUrl is host-validated before it is replayed with the bearer token. MEDIUM: confirmComposerCleared now requires a genuinely EMPTY box (accepting 'the text changed' reported false sends when React re-normalised a contenteditable); VIEWED_PROFILE_URL_RE no longer matches /albums/{id}/, which was writing an ALBUM id into lastViewedProfileId every time the Media picker opened and arming the action keys on a non-existent profile; resolveProfileIdFromClick routes /chat/<a>:<b> through chatPeerIdFromPath instead of taking the numerically smaller half (a coin flip between the peer and YOURSELF); indexProfileFromPayload enforces isPlausibleProfileId; findSendButton refuses a page-wide search and applies the app-chrome filter; PAGER_NAME_RE accepts left/right from an accessible name as its own comment promised, while class/testid matching still refuses them; the overlay detector is anchored to [role=dialog]/[aria-modal]/whole-word classes, since one permanently-mounted element whose class bag contained 'sheet' silently disabled the enforcement sweep and the keep-alive forever; capture logging is verbosity-gated and no longer prints chat message bodies verbatim; the hide toast no longer promises durability when the storage write failed; hide expiry batches its writes instead of one full serialise per expired entry on a 3s sweep; e.repeat is checked BEFORE the nav branch, so a held page key no longer re-runs navigation at OS repeat rate; listCascadeCards dedupes with a Set instead of an O(n^2) includes scan on the nav hot path; the message walk gained a breadth cap and seenConversationIds a size cap; and the album unlock no longer floats an unhandled rejection. v0.31.0: the enforcement sweep no longer scales with the size of the block list. TWO-TIER BLOCK LIST: the sweep exists to bridge one specific gap — between POSTing a block and Grindr's own server-side hide propagating into the cascade. Until it propagates the profile keeps arriving and we must collapse its tile ourselves; AFTER it propagates Grindr stops sending that profile at all, so every scan looking for it is guaranteed to find nothing, forever. That was the entire cost of a large block list. Blocks are now split into PENDING (still enforced against the DOM) and CONFIRMED (propagated server-side, never scanned for), persisted separately in grindrMiddleClickBlockConfirmed_v1. A block promotes to CONFIRMED once it has landed 2xx and has not appeared in a cascade payload for BLOCK_CONFIRM_QUIET_MS (10 min), and demotes back to PENDING the instant Grindr sends it again. The demotion check is what makes this safe and it costs nothing: it rides indexProfileFromPayload, which already runs for every profile in every payload, so we learn a block stopped working from Grindr's own traffic rather than by scanning for it. INVERTED SWEEP: enforceAllBlocked ran per id — for each blocked/hidden profile, for each of its 2-10 photo hashes, a document-wide querySelectorAll('img[src*=…]'), an attribute-SUBSTRING match no selector index can serve, so the engine visits every <img> on the page and scans its src. With a few hundred ids that is thousands of full-document scans every 3 seconds, nearly all finding nothing because the virtualised grid renders only a few dozen tiles. It now runs per RENDERED TILE: one querySelectorAll for the images actually on screen, an O(1) photoHashToProfileId lookup per image, and a Set membership test — O(ids x hashes x imgs) becomes O(imgs). Modelled at 60 rendered tiles and 4 hashes per profile, a 500-entry block list goes from ~120,000 src comparisons per sweep to 60, and to ZERO once those blocks are confirmed. Inspect the split with __grindrBlock_blockTiers(); __grindrBlock_state() gains blocksPending / blocksConfirmed. Also: the profile-photo selector literal, previously repeated at four sites, is now the single constant PROFILE_PHOTO_SELECTOR. v0.32.0: block confirmation is now AUTHORITATIVE rather than inferred. v0.31 promoted a block to CONFIRMED after a quiet period, which was a guess. A HAR of a real block shows there is no need to guess: GET /api/v1/hides returns the COMPLETE list in one unpaginated response — {"hides":[{"profileId":N,"displayName":…,"mediaHash":…}, …]}, 3309 entries, ~230KB, including the profile hidden seconds earlier. So reconcileBlockTiers() asks Grindr's own hide and block lists (walking the paginated /api/v4/blocks) and re-tiers EVERY pending block in a single pass: present server-side means CONFIRMED and never scanned for again, absent means it never landed and stays PENDING under active enforcement. It self-throttles to once per 30 minutes, runs from the sweep, and is callable on demand via __grindrBlock_reconcileBlocks(). Parsing the real payload takes 2ms. The quiet-period rule survives only as a FALLBACK for when the list cannot be reached, and its window is now a conservative ONE HOUR — guessing wrong there means abandoning a block that never landed. (The same capture shows a weaker second signal: opening a hidden profile's conversation returns 403 urn:gr:err:unauthorized_action. It confirms one profile at a time and only when you happen to open it, so the list is used instead. That capture also gave a third independent confirmation of the sorted-conversation-id rule: 400000001:500000000.) SECURITY: under @grant none every window.__grindrBlock_* function is callable by anything else running on web.grindr.com. The twelve that ACT — greet() sends a message as you, unlockAlbum()/reshareAlbum() share a PRIVATE album with an arbitrary id, and the clear*/undo*/set* family destroys or rewrites local state — are now disarmed until __grindrBlock_arm() (per-tab, sessionStorage). Read-only diagnostics stay open, and disable()/enable()/cancelBlock()/clearQueue() are deliberately NOT gated: the kill switch's entire value is being reachable in ten seconds. MAINTENANCE: the Escape dispatch, previously inlined at three sites, is now pressEscape(); the four localStorage stores share readJson/writeJson, and writeJson returns whether the write actually landed. v0.33.0: an on-screen HUD, a diagnostic recorder, and the real reason a greet fails on someone you already hid. HUD: a small badge bottom-right expands into a panel listing what all six keys do IN THIS BUILD — read from the HOTKEY_* constants themselves, so the legend can never drift from the code, which is exactly what made the last two failures confusing (a key that means 'greet' in one version means 'block' in the next, and nothing on the page tells you which build is installed). It also shows live state: where the script thinks you are, the resolved target, the block/hide tier counts, greet mode, and whether the console surface is armed. Toggle with the backslash key or __grindrBlock_hud(); the open/closed choice persists. RECORDER: 'record' captures every log line at TRACE detail plus structured events (each hotkey press and its resolved action) into a bounded 3000-entry buffer, WITHOUT putting the console into trace mode for the rest of the session — the recorder taps the log helpers before the verbosity gate. 'save' downloads a plain-text report carrying the build, the full keymap, the live state, __grindrBlock_why() and the captured timeline with relative timestamps. Console equivalents: __grindrBlock_record() / __grindrBlock_saveReport(). Off by default, so it costs nothing until armed. GREET ON A BLOCKED/HIDDEN PROFILE: a capture shows GET /api/v4/chat/conversation/<id>/message returning 403 urn:gr:err:unauthorized_action for a profile that had just been hidden — Grindr withholds the Chat button and refuses the conversation, so no selector change can ever make that greet work. The greet now refuses up front with 'Can't greet <id> — you blocked/hid them' instead of opening the profile and polling twelve seconds for a button that will never exist, and the no-Chat-button giveup path checks the same thing before blaming the matcher. Also: /api/v4/blocks?page=1 is confirmed to return {"blocks":[{profileId,displayName,mediaHash}]} — the same shape as /hides — so reconcileBlockTiers parses both identically. v0.34.0: driven by the first real diagnostic capture, which found two bugs and proved the recorder itself was unusable. (1) SELF-DEMOTING RECONCILE — the v0.31 tier system read Grindr's own /api/v1/hides response as evidence that a block had FAILED. Grindr fetches that list on every page load; the response observer walked it; indexProfileFromPayload fired once per entry; and noteProfileSeenInPayload treated all 3309 hidden profiles as 'reappeared', demoting every confirmed block back to PENDING on every load. The capture shows it happening: two list fetches at +0.69s followed by a flood of 'reappeared in a payload — demoting'. Appearing in the HIDES LIST is proof the block landed, the exact opposite. Demotion is now suppressed while walking a list response — and the same response is read POSITIVELY, confirming every block found in it, which makes tier reconciliation free and automatic on every page load instead of a 30-minute poll. (2) GREET ON AN OPEN PROFILE — the capture shows profileViewFound:false while profileOverlayFromUrl:true, so findProfileChatButton (which since v0.28 refuses to search without a resolved profile view) returned null and every greet died with 'no Chat button'. findOpenProfileView's geometry heuristic caps a match at 6 photos to tell a profile apart from the cascade grid; when the URL already says ?profile=true that ambiguity is gone, so the cap is lifted and a bounded largest-container fallback (app-chrome excluded) is allowed. (3) RECORDER — a first recording filled all 3000 entries in FOUR SECONDS, 2952 of them the single trace line indexProfileFromPayload, evicting the one hotkey press it was meant to capture. The buffer is now PARTITIONED: events/warnings/errors live in a protected ring that trace can never evict, and the known floods are sampled 1-in-50 with the omission recorded. HUD is now DRAGGABLE (position persisted and clamped back into view; __grindrBlock_resetHudPosition() returns it to the corner), and 'reconcile' now reports what it did instead of appearing to do nothing. MAINTAINABILITY: processQueue's 248-line body is split into runUnblockJob and runBlockJob, verbatim extractions that return a loop directive ('continue'/'break'/'next') so the scheduling logic stays in one place — processQueue is now 87 lines and each arm can be read on its own. v0.35.0: a diagnostics release. The previous capture proved the v0.34 fixes landed — profileViewFound went false→TRUE, and reconcile took the block list from 1404 pending down to 232 — but it could not explain a report of the hotkeys doing nothing, because the recorder only logged a keypress that survived EVERY gate. A key swallowed early produced no evidence at all, which is exactly the case that needs evidence. Every exit path of the keydown handler is now instrumented: hotkey-seen records the key plus whether we thought you were typing and what had focus (document.activeElement is described, since a focused Grindr control is the likeliest silent gate), and hotkey-ignored names the specific gate that stopped it — disabled, modifier-held, key-repeat, typing, or navigateProfiles finding nothing to move. hotkey-acted and hotkey-noop close the loop on keys that did run. The saved report also now INVENTORIES every visible button inside the open profile view — tag, id, classes, aria-label, text, data-testid, whether it counts as app chrome, and its size — because chatButtonFound:false says the matcher missed but never said WHAT it missed, and the Chat-button selector has now been guessed at twice. HUD: the panel no longer rebuilds itself every second. The old unconditional 1s re-render wiped and recreated the whole panel, which destroys focus on a button you just clicked, and called resolveTargetProfileId() — a full DOM resolution — once per second forever just to redraw identical text; the state is now fingerprinted and the rebuild skipped when nothing changed. The [endpoint-sniff] log line drops from warn to trace, since the endpoints it was discovering are long since known. v0.36.0: a capture with the v0.35 instrumentation answered all three complaints, and two were my own regressions. (1) INSERT IS UNREACHABLE. The recording shows Delete, Home, PageUp and PageDown all arriving while Insert produced NO keydown event at all — Apple keyboards have no Insert key, so the greet hotkey could never fire from the keyboard whatever the code did, and 'pressed it and nothing happened' was literally true. Bindings are now LISTS of accepted keys: greet is ['Insert','F8'], so Insert still works from a mouse or macro pad that can send it while F8 gives the keyboard a key that exists. (2) A CONFIRMED BLOCK STOPPED BEING ENFORCED. v0.31 skipped confirmed ids in the DOM sweep, on the premise that once Grindr's hide propagates it stops sending that profile. The capture disproves it — a block reported 'confirmed' and the profile was still in the feed before AND after a refresh — so a server-side hide does not reliably remove a profile from the cascade, and trusting it turned a working block into one that claimed success and visibly did nothing. Every block is enforced against the DOM again; the CONFIRMED tier now only means 'don't re-POST this', which is the one thing Grindr's list actually proves. Enforcing all of them is free because the sweep is already one pass over rendered tiles. (3) THE SWEEP COULD NOT SEE UNINDEXED TILES. 'confirm-DOM …: hashCards=0' in the capture: a profile resolved by React fiber or attribute scan has no photo-hash entry, and the inverted sweep looks up tiles by hash alone, so its card was invisible to enforcement forever. The sweep now falls back to the same resolver a real click uses for tiles it cannot hash-match, and caches the result; blocking from a card also indexes that card's hashes up front. RECORDER, as requested, now captures far more than log lines: every Grindr request with status, timing and bodies — exported as a real HAR 1.2 file alongside the text report, openable in any HAR viewer; every click, described as the resolvers see it (target element, whether it hit a cascade card, and which profileId it resolves to); and the page's own console.error/warn, since Grindr's errors are often the real story. The text report gains a compact network table with request bodies and the response body of anything that failed. v0.37.0: the v0.36 capture showed why the last two rounds could not converge — the recorder was blind to the only requests that mattered. A 50-second session of block, hide and unlock presses captured 13 requests, ALL of them Grindr's and NOT ONE of ours: everything this script sends goes through origFetch, which deliberately bypasses the observer so it never self-indexes, and that also kept it out of the recording. origFetch is now wrapped for diagnostics only — our calls are captured with status, timing and bodies and marked '>>' in the report — without feeding them back into the observers. The enforcement sweep is instrumented too (images scanned, ids matched, cards collapsed), because that same capture contained no sweep output at all, leaving no way to tell whether it was running, finding nothing, or finding tiles and failing to hide them. KEYS ARE NOW REBINDABLE BY PRESSING ONE. Two chosen keys have turned out to be unsendable by this keyboard — Insert (absent from Apple keyboards) and F8 (a media key unless the standard-function-keys setting is on) — and guessing what someone else's hardware can send is not solvable from here. Click any key row in the HUD, press the key you want, and the actual event.key your keyboard produces is stored and persisted; double-click the hint line to reset. Console equivalents __grindrBlock_setKey(action, key) / __grindrBlock_resetKeys(). The HAR now has its own button rather than downloading automatically after the text report: Chrome blocks a SECOND automatic download from one gesture behind an easy-to-miss 'allow multiple downloads?' prompt, which is why the .har silently never appeared. One click, one file. v0.38.0: the capture with our own traffic visible found the real cause of "it says it blocked but the profile is still there", and it was never the API. POST /api/v1/me/hides/{id} returns 200 every time — the capture shows four of them. The failure is entirely in the DOM:     sweep {"imgs":153,"matched":5,"hidden":0} — the sweep correctly identified five blocked profiles among the images on screen and collapsed NONE of them, because img.closest(CASCADE_CARD_SELECTOR) returned null every single time. Grindr now renders the grid with styled-components, so a tile's classes are content hashes like "sc-jKCWkB caHOKQ" and not one of the names that selector looks for (cascadeCellContainer / cascade-cell / profile-card) exists in the markup any more. That also explains every confirm-DOM line reporting profileEl=false: the block applied server-side and there was simply no element left to hide. Card resolution now falls back to GEOMETRY, which cannot rot — walk up from the photo to the first ancestor big enough to be a tile, the same heuristic resolveProfileIdFromClick and listCascadeCards already use, so all three agree on what a tile is. The sweep event also reports noCard now, so a future selector break is visible in one line rather than inferred. Two more fixes from the same capture: every Grindr request was being recorded TWICE (patchedFetch called origFetch, which is the new diagnostic wrapper) which doubled the HAR — it calls rawFetch now; and an album returning 403 is RETIRED from the unlock rotation instead of being re-read on every press, which is what made "Delete says it unlocked but nothing happened" — the capture shows album 800000003 answering 403 to both the shares read and the share POST, and the rotation stalling on it every time. v0.39.0: GREET WORKS — a capture shows it end to end for the first time, 'greet to 600000006 CONFIRMED on the wire (outbound WS frame carries the text)' followed by 'greeted 600000006: "Howdy" (sent via Enter)'. Note 'via Enter': the send BUTTON still misses and the Enter fallback carried it, which is exactly what the verified-send path was built for. Two fixes from the same capture. (1) THE SWEEP WAS POISONING ITS OWN INDEX. v0.36 added a fallback that ran resolveProfileIdFromClick against any tile whose photo hash was unknown — but that resolver is deliberately generous, and when a tile yields nothing it falls back to CONTEXT (the open profile, the last profile fetched). In a sweep that is catastrophic, because the answer is then the same id for every unresolved tile: the capture shows `matched` jumping from 0 to 49 the instant a single profile was blocked — one real tile plus ~48 unrelated photos all resolving to the id just blocked — and the fallback then CACHED each wrong pairing into the photo-hash index, corrupting the one structure every resolver trusts. (All 49 were then skipped by the 30-second undo-window guard, which is why `hidden` stayed 0 and the tiles never disappeared.) The fallback is removed: it was added for hashCards=0, which turned out to be the dead cascade selector fixed properly in v0.38's cardForImage, and the hash index is populated from every cascade payload anyway. (2) The blanket 'Greeting throttled' toast is gone. greetViaUi fails for several distinct reasons — cooldown, a flow already in flight, no visible tile, target already blocked — each of which had already shown an accurate message, and since showToast reuses one element the blanket text OVERWROTE it, so a greet that failed because the profile was blocked reported a throttle instead. Also added a 45-second watchdog on the greet flow token: every terminal path is meant to release it, but one that throws would wedge the lock and make every later greet report 'already in progress' forever. v0.40.0: URGENT — fixes a destructive bug this script shipped in v0.38, found by inspecting the live page directly rather than inferring from captures. TWO CORRECTIONS. First, v0.38's premise was WRONG: [data-testid="cascadeCellContainer"] is alive and well — the live page has 18 of them — so CASCADE_CARD_SELECTOR was never dead, and img.closest() finds a real tile every time. The blocked tiles that would not disappear were caused by the poisoned photo-hash index (fixed in v0.39) together with the 30-second undo-window skip, not by the selector. Second, and far worse, the geometry fallback v0.38 added to "fix" that non-problem was dangerous. The same page holds about 132 profile photos that are NOT cascade tiles — the conversation avatars running down the inbox sidebar — and walking up from one of those to "the first ancestor at least 80x80" landed on a UL measuring 241x13414: the entire sidebar. Blocking anyone who appeared in that list would have set display:none on it and wiped the chat list off the screen. Measured on the live page, 132 of 140 profile images resolved to that oversized element. The fallback is now strictly bounded: it stops the moment an ancestor contains more than the one profile photo (a real tile holds exactly one; anything holding two is a list), it refuses anything taller than the viewport, and it returns null rather than guessing — a refusal counts as noCard in the sweep event, so a genuine miss stays visible instead of turning into a wrong element. Re-measured against the same page: 8 real tiles resolve, all 132 sidebar avatars are refused, and the largest thing the sweep will ever hide is 559x745 — an actual tile. v0.41.0: verified against the live logged-in page with browser automation instead of inferred from captures, which finally settled why every greet sent via the Enter fallback rather than the Send button. The composer is <input type="text" placeholder="Say something..."> and it has NO ancestor matching form / [class*=chat] / [class*=message] / [class*=conversation] — Grindr's classes are styled-components content hashes — so findSendButton's scope lookup returned null every time and the caller fell through to Enter. A page-wide search is still refused (that is how "Send Location" got clicked in v0.26); instead the scope falls back to a bounded six-level ancestor walk, which on the live page yields exactly ONE candidate, "Send", with the location / gif / saved-phrases / tap buttons all rejected by the anchored name test. Also confirmed: the Send button is disabled while the composer is empty and enables on the first input event, so a disabled button is no longer treated as disqualifying — we always fill before we look. Verified end to end in the live page: filling the composer enabled the button, clicking it sent the message and cleared the box, and a block through the hotkey path produced >> 200 POST /api/v1/me/hides/{id} and collapsed exactly one tile. Everything observed is written down in docs/grindr-dom-and-api.md so the next matcher break starts from evidence rather than a sixth round of guessing. v0.42.0: greet finally works the way this build actually behaves, found by driving the live page rather than reading captures. THREE FAULTS, all in the same path. (1) PROFILE_VIEW_SELECTOR contained [data-testid*="cascade" i], which matches cascadeCellContainer — a GRID TILE. findOpenProfileView was returning a 559x745 tile holding zero buttons, so findProfileChatButton searched an empty box and chatButtonFound was false every single time. Removed. (2) There is NO Chat button on an open profile in this build: the overlay carries its OWN composer, the "Say something..." input along the bottom of the detail pane. The only element named "Chat" anywhere on the page belongs to the floating chat drawer. greetViaUi now types into that composer directly when a profile is open, and only hunts for a Chat button if no composer is present. (3) Worst of the three: TWO composers can be on screen at once — the profile's (input, 1152px) and the chat drawer's (textarea, 296px) — and findChatComposer preferred the DRAWER, because a textarea earns a +2 type bonus and outscored the real one 7 to 5. That would have typed the greeting into whichever conversation the drawer had open: a message to the wrong person, the exact failure this project has been guarding against since v0.23. While a profile overlay is open, a composer inside the chat drawer is now refused, identified by controls only the drawer has (close drawer / Open chat list / chat-button-*), bounded to five ancestors so it cannot over-match. Verified live end to end: the fixed scorer picks the 1152px profile composer, filling it enables the Send button, and clicking Send delivers the message and clears the box — the first time a greet has completed through the button rather than the Enter fallback. All of it is written up in docs/grindr-dom-and-api.md. v0.43.0: fixes a CONFIRMED WRONG-PERSON SEND. A capture shows a profile opened (600000002), the greet key pressed, and the message delivered to 600000003 — a different person entirely. Reproduced live: with 600000002's overlay open, resolveTargetProfileId() returned 600000003 while Grindr's own traffic said 500000000:600000002, and lastViewedProfileId held a THIRD id, 600000004. Root cause: ?profile=true carries no profile id, and v0.42 removed the (wrong, but populated) cascade match from PROFILE_VIEW_SELECTOR, so both the URL step and the profile-view step returned nothing and resolution fell through to a STALE hotkey cursor. Two changes. FIRST, an open overlay now has an authoritative source: the conversation Grindr itself fetched when the overlay opened (GET /api/v4/chat/conversation/<me>:<them>/message) names the profile on screen, and nothing else does — it is consulted before every other source, and the observation window grows from 60s to 10min so it does not silently expire while a profile sits open. SECOND, and more important, a hard guard: greet and block now REFUSE outright when the resolved target contradicts the open profile, rather than acting on an id that came from somewhere stale. Verified live — the new resolver returns 600000002, and the guard would have blocked the send that actually went out. Also: the post-send route no longer pushes the captured `from` back. When a greet starts on an open profile that value is "/?profile=true", a flag with no profile state behind it, and restoring it produced the blank screen seen after a successful send; it now routes to the grid, which always renders. Finally, v0.42's blanket refusal of the chat drawer's composer is relaxed — the drawer is the normal way to start a conversation with someone new, so refusing it outright broke the main use case. It is now refused only when it demonstrably holds a DIFFERENT conversation than the profile being greeted; otherwise it just loses the textarea scoring bonus so the profile's own box wins a tie. v0.44.0: a settings tab, and blocks that look like they worked. FIRST, the block investigation is closed: our POST was never the problem. A capture shows Grindr's own hide button calling the IDENTICAL endpoint we do — POST /api/v1/me/hides/{id} — and asking Grindr's own list afterwards confirms both of our test blocks landed (600000004 and 600000005 both come back CONFIRMED against /api/v1/hides, 3853 entries). The reason a block "didn't take" is that GRINDR'S CASCADE KEEPS SERVING PROFILES YOU HAVE HIDDEN; their client filters them out locally, so removing the card ourselves is the only thing that makes the block visible. Blocking now collapses the profile's card immediately instead of waiting up to three seconds for the enforcement sweep (hideCardOnBlock). SECOND, a SETTINGS TAB in the HUD — click "settings" in the header. After a greet you can now choose next profile / stay in chat / stay put / back to grid, and after a block next profile / stay put / back to grid; the default for both is advancing to the next profile, which is what the rhythm of these keys wants. Settings persist per browser and are readable and settable from the console via __grindrBlock_settings(). THIRD, the post-greet blank screen is gone for good: instead of pushing the captured route back — which on an open profile is "/?profile=true", a flag with no profile state behind it — the greet now performs whichever after-action you chose, and 'advance' drives Grindr's own pager on a profile and the tile cursor on the grid, so it behaves correctly in both places. v0.45.0: Home now performs a REAL BLOCK, and End is confirmed local-only. Until now Home fired a HIDE — POST /api/v1/me/hides/{id}, with the block collection only as a fallback — because that is what Grindr's own card menu does. But a hide does not remove anyone from the cascade: Grindr keeps serving hidden profiles and its client filters them locally, so a "block" was cosmetic on our side and the profile kept coming back. Tested live, the two are genuinely different relationships: POST /api/v3/me/blocks/{id} returns 200 {"updateTime":0} and the id then appears in /api/v4/blocks (94 entries) and NOT in /api/v1/hides (3322) — a real block, reversible with DELETE on the same path, which also returns 200. Note the asymmetry that made the old unblock path unreliable: DELETE /api/v1/me/hides/{id} returns 501, so there is no un-hide via that verb at all. Home is therefore wired to the blocks collection (BLOCK_MODE = 'block'; set it to 'hide' to restore the old hide-first behaviour), and Undo reverses through the same collection so it actually undoes what was done. End is unchanged and remains what it claims to be: a LOCAL-ONLY hide that makes no API call whatsoever — nothing is sent to Grindr, no rate limit is consumed, the id simply goes on the persistent local list and the card is collapsed. v0.46.0: three HUD additions. UNBLOCK THE LAST BLOCK — the 30-second Undo toast is deliberately short-lived, which is no help when you realise a minute later that you blocked the wrong person, so the id of the most recent block is now remembered indefinitely and the main tab carries an "unblock <id>" button that drops it from the local list, sends the unblock, and restores its card. GREETINGS TAB — the phrase list is editable in the HUD (header → greetings): a plain textarea, one phrase per line, with save, restore-defaults and preview. A stored list wins over the built-in one, and clearing it falls back to the built-in list rather than leaving nothing to send. {timeOfDay} and {dayPart} still resolve at pick time. Typing here cannot fire a hotkey — the keydown handler already ignores everything while a text field has focus. Readable and settable from the console via __grindrBlock_greetings(). HIDE → BLOCK UPGRADE ON THE RECONCILE BUTTON — reconcile now also reads /api/v4/blocks, so it knows which of your local entries Grindr holds as a REAL block and which are only hides. Since a hide never removes anyone from the cascade, that second number is "how many of your blocks are not actually doing anything", and it now shows on the button itself as reconcile (N). Clicking it reconciles and then queues a batch of upgrades through the ordinary rate-limited block queue — never a burst, and safe to leave: each success lands in Grindr's block list and drops out of the count on the next reconcile, so the number simply counts down over repeated presses. __grindrBlock_upgradeHides(n) does the same from the console. v0.47.0: the hide→block upgrade now runs itself, and the unblock button survives a reload. AUTO-DRAIN: a toggle beside reconcile starts a background pass that keeps upgrading until every local entry is a real block, showing what is left as it goes ("▶ drain 1183" → "■ draining (1183)"). It writes to the account roughly twelve hundred times, so it is paced rather than fired: the drain only ever tops the ordinary block queue up when that queue has run LOW, which means all the existing protection still applies — MIN_INTERVAL_MS between calls, the rolling hourly cap, the 401/403 session-dead pause — and it can never burst. It also survives a reload, because the flag is persisted and the remaining work is recomputed from Grindr's own lists rather than from a saved cursor, so nothing is double-sent if you close the tab mid-run. Stopping is immediate: the toggle is checked on every tick, and the drain stops itself and says so when the backlog reaches zero. Control it from the console with __grindrBlock_autoDrain(true|false), or read progress with no argument. Toasts are suppressed while draining so it does not interrupt you every fifteen seconds. UNBLOCK PERSISTS: the last blocked id is now written to localStorage rather than held in memory, so "unblock <id>" is still there after a refresh — which is exactly when you tend to want it, since the 30-second Undo toast is long gone by then. v0.48.0: the blocked card no longer leaves a hole, and the drain shows its progress. EMPTY CARD — hiding a blocked profile left a card-shaped gap in the grid because a cascade tile is WRAPPED: the live DOM nests three divs of identical size, [data-testid=cascadeCellContainer] plus two single-child wrappers, all 559x745, and we were hiding the innermost while the outer two went on holding the space. Measured directly on the page — hiding the inner element leaves 745px of empty grid, hiding the outermost wrapper collapses it to 0px. Card resolution now walks up while the parent is the same size AND has exactly one child (a pure layout wrapper) and hides that instead; the walk stops at the grid itself, which has hundreds of children. DRAIN LOOKED DEAD BUT WASN'T — a check while it ran showed running:true, queued:17, remaining:1461, so it was working the whole time and simply never redrew. Two causes, both fixed. The HUD only re-renders when its state fingerprint changes and the fingerprint did not include the upgrade count, the drain flag or the queue depth, so the button label was computed once and frozen. And the backlog is derived from Grindr's block list, which reconcile refreshes at most once every thirty minutes — so even a correct redraw would have shown the same number for half an hour while hundreds of upgrades landed. A block that succeeds now records itself as a real block immediately, so the count falls as the work happens; the next reconcile still corrects it either way. v0.49.0: middle-click blocking hides the card again. v0.44 added the immediate collapse to the HOTKEY wrapper only, so pressing Home hid the profile while a middle-click — which calls startBlock directly, as do shift+left-click and the text filter's auto-block — left the card sitting there. The collapse now lives in startBlock itself, the one entry point every block gesture shares, so all of them behave the same; that is also the right home for it, since Grindr keeps serving profiles you have blocked until its own cascade refreshes and removing the card is the only thing that makes a block visible at all. The new hideCardsForProfile also collapses EVERY card it can find for that profile rather than just the one clicked — the virtualised grid can render the same person more than once — and it resolves from whatever was actually clicked, which for a middle-click is the <img> rather than the cell. collapseClickedCard, used when a block is confirmed server-side, was still hiding the raw element it was handed and now goes through the same outermost-wrapper logic as everything else. Verified against the live grid, clicking an <img> the way a middle-click does: the card collapses to a 0px gap with no empty slot left behind. v0.50.0: the End key now hides the card immediately, and a block can no longer fail to hide one for want of an element. END DID NOT HIDE ANYTHING — hotkeyHideTarget only called scheduleEnforce(), and that sweep is debounced AND stands down entirely while any Grindr overlay is open, so pressing End on an open profile did nothing visible until some later sweep happened to run with the overlay closed. That is the intermittency: it was never random, it depended on whether an overlay was up when the next sweep fired. Blocking has collapsed the card immediately since v0.49; hiding now does the same, which is the entire point of a local hide. NO ELEMENT, NO HIDE — hideCardsForProfile finds cards through the photo-hash index, which only knows profiles seen in a cascade payload, and a capture shows blocks landing with hashCards=0: nothing indexed, so nothing found, and when the caller had no element either the card simply stayed. It now falls back to the tile under the pointer or the one the keyboard cursor is on — but only after verifying that tile really belongs to the profile being hidden, because an unverified fallback here is precisely how the wrong person's card gets hidden, and this project has already shipped that bug once. v0.52.0: manual blocks no longer starve behind the auto-drain. A capture of "blocks are not working at all" shows they were not failing — they were QUEUED: "Hourly cap (500) hit, waiting 48m". The drain is a background migration of some fourteen hundred old entries and it runs continuously, so it had spent the entire rolling-hour budget and every block pressed by hand went to the back of a 48-minute wait. Nothing reported an error, which is why it looked broken rather than throttled. Three changes. The drain now keeps only HALF the hourly budget (DRAIN_BUDGET_FRACTION) and holds once its share is spent, so there is always headroom for what you do right now; it resumes on its own as the window rolls. Jobs the drain creates are marked `bulk` and queue BEHIND every interactive one, so a block you just pressed is never stuck behind a thousand migrations. And the cap is no longer silent: the toast says how long and suggests turning the drain off, while the HUD shows "block cap paused Nm" and the queue depth, so a waiting block is visibly waiting instead of looking dead. Extracted from the Aggregaytor extension. v0.53.0: manual and drain blocks now draw on SEPARATE hourly budgets (MANUAL_HOURLY_CAP + DRAIN_HOURLY_CAP = MAX_PER_HOUR), so a saturated auto-drain can no longer delay a block you pressed — the v0.52.0 reserve still paused the whole queue on one shared count. Interactive jobs are now LIFO, so the newest press runs next. Also fixes SCRIPT_VERSION having been left at 0.51.0 in the v0.52.0 release, which mislabelled every diagnostic capture; the docs gate now checks it. v0.54.0: fixes the reconcile/drain backlog counting UP. The backlog is `blockedProfileIds \ serverBlockedIds`; blockedProfileIds was persisted and serverBlockedIds was not, so every page load reset the subtrahend to empty and recomputed the backlog as the entire local block list — including everything already upgraded in earlier sessions. It could never trend down across reloads, and the drain re-blocked profiles Grindr already held. The snapshot now persists (grindrMiddleClickServerBlocks_v1) and the drain refuses to run until it has one, instead of treating "unknown" as "nothing is blocked". v0.55.0: fixes a deadlock v0.54.0 introduced. The drain refused to run until it had a snapshot of Grindr's block list, but that gate sat ABOVE the only reconcile the drain performs — and because a reconcile stamps its 30-minute throttle before fetching, one failed attempt left the drain holding for half an hour, logging "no snapshot yet" every 15s and never escaping (seen in a live capture). The gate now sits after the walk, and the walk is forced when no snapshot exists. Adds __grindrBlock_block(id) to queue an interactive block by id, and an end-to-end suite that runs the real queue against a stubbed Grindr — including a cold-start test that fails on the v0.54.0 code and passes on this one. v0.56.0: the HUD now shows both hourly budgets — how much of each cap is spent and when the next slot frees — so a paused queue no longer looks like a broken one. End on an ALREADY-BLOCKED profile now hides the card instead of refusing: that branch only fires when the sweep could not resolve the card (capture: matched:4, hidden:0, noCard:2), so the profile is on screen and refusing leaves it there. Hide refusals now record their reason in the diagnostic rather than a bare noop. v0.57.0: blocked profiles with NO PICTURE could never be hidden. Grindr renders the grey silhouette as an inline data:image/svg+xml <img>, which matches none of PROFILE_PHOTO_SELECTOR's host patterns — and the enforcement sweep walks up from photos, so those tiles were invisible to it. Measured live: 13 of 30 cascade cells were placeholder-only. A second pass now walks the cascade cells themselves and resolves each id from the React fiber. Also raises DRAIN_BUDGET_FRACTION to 0.9 (drain 450/hr, 50/hr kept for blocks you press). v0.58.0: THE reason the drain stalled — blockSessionDead latches on a 401 and nothing could ever clear it. clearSessionDeadIfSet() is reached only from the block/unblock success paths inside processQueue, which breaks out the moment the flag is set; putting the clear in reconcileBlockTiers does not help either, since that declines to run while the latch is set. A standalone sessionCanaryTick (one cheap GET every 15s, ignoring the latch) now resumes the queue. Also, at the operator's request: hourly caps DISABLED (HOURLY_CAPS_ENABLED=false) and the drain ticks every 1s instead of 15s. MIN_INTERVAL_MS still spaces calls at 500ms. v0.59.0: HUD gets a 'resume queue' button (shown only while something is actually holding the queue, so its presence is the signal) and an auth row that says REJECTED 401 while paused, or 'recovered, N rejects' afterwards — a queue stopped by a 401 and a queue with nothing to do used to look identical. Auth rejections are now counted and exposed in __grindrBlock_state() so a capture explains a stall. v0.60.0: the backlog that reset to the same number forever. Some profiles accept POST /api/v3/me/blocks/{id} with 200 {"updateTime":0} and never appear in /api/v4/blocks — measured live, 391 of 1496: 156 present in the HIDES list (hide and block are mutually exclusive, so blocking a hidden profile is a no-op) and 235 in neither list, almost certainly deleted accounts. upgradeHidesToBlocks always took the same first slice, so the drain retried them forever while the optimistic add counted down and each walk restored the count. Profiles are now retired after MAX_UPGRADE_ATTEMPTS completed POSTs the walk does not reflect; they stay blocked LOCALLY and are listed by __grindrBlock_stuckBlocks() (pass true to retry them). v0.61.0: stops spending writes on blocks that cannot land. A block is now skipped at enqueueAction — the one point every gesture funnels through — when the profile is already in Grindr's blocks list, or has been retired as unconvertible; the card is hidden locally instead. That is what 'middle-click blocking isn't working' was: a capture shows three POSTs to one id, all 200, against a profile already BLOCKED and HIDDEN, so nothing changed and the tile stayed. MAX_UPGRADE_ATTEMPTS drops to 1, so the ~391 unconvertible entries are retired after a single pass instead of three.
// @author       mithudso
// @match        https://web.grindr.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────────
  // HOW IT ALL FITS TOGETHER
  //
  // Grindr's web app is a React SPA whose cascade grid renders profile photos
  // but exposes no profile IDs on the DOM cells, and whose auth tokens rotate
  // too often to scrape from storage. This script works around both by passively
  // observing the app's own network traffic, then acts on a click. The pipeline:
  //
  //   1. NETWORK PATCH (window.fetch + XMLHttpRequest, installed at
  //      document-start so nothing is missed): every grindr.com request donates
  //      its auth headers; every JSON response is walked for {profileId, photo
  //      hash} pairs.
  //   2. AUTH CACHE (captureFromHeaders / getCapturedAuth): the freshest auth
  //      headers, expired after AUTH_TTL_MS. Block/unblock calls reuse these so
  //      they look identical to the app's own requests.
  //   3. PHOTO-HASH INDEX (photoHashToProfileId): maps the image hash in a
  //      cell's <img src> back to a profileId, since the cells themselves carry
  //      no ID. This is the bridge from "a photo you clicked" to "who it is".
  //   4. ID RESOLUTION (resolveProfileIdFromClick): on a click, tries 7 fallback
  //      strategies in reliability order (URL → data attrs → href → photo hash →
  //      attribute scan → React fiber) to recover the profileId.
  //   5. RATE-LIMITED QUEUE (processQueue): serializes every block/unblock
  //      behind MIN_INTERVAL_MS with hourly cap + backoff, because Grindr
  //      silently kills the session on bursts. Block and unblock share it.
  //   6. UNDO UI (startBlock / offerUnblock): a click blocks immediately and
  //      shows a 30s "Unblock" toast that reverses it.
  //   7. TEXT AUTO-FILTER (maybeAutoFilterByText): independently of any click,
  //      every sniffed profile's text is checked against TEXT_FILTER_KEYWORDS
  //      (top of file); a match is hidden DOM-only or routed through the block
  //      queue per TEXT_FILTER_ACTION — no click and no profile-open needed. An
  //      auto-block also shows a rich 30s Undo toast (name, photo, matched text).
  //   8. STAY LOGGED IN (installStayLoggedIn): Grindr's bundle arms a 30-min idle
  //      setTimeout that calls logOut({type:"automatic"}) and clears ALL of
  //      localStorage on the way out. At document-start we rewrite that long
  //      countdown to ~99h, preserve this script's own storage keys through the
  //      logout clear(), and ping synthetic activity as a backstop (STAY_LOGGED_IN).
  //   9. SKIP BETA DIALOG (installBetaDialogSkip): after login the app shows a
  //      one-time "Grindr Web Beta" welcome modal gated on a sessionStorage flag
  //      that logout wipes (so it returns every login). We pre-seed that flag at
  //      document-start so it never opens, and click its dismiss button as a
  //      fallback if a re-login mounts it anyway (SKIP_BETA_DIALOG).
  //  10. GREETING (triggerShiftRightGreetForProfile → greetViaUi): a
  //      shift+right-click over any profile, or the Insert hotkey, sends it a random
  //      canned greeting. The chat is reached by changing the route INSIDE the
  //      running app (history.pushState + a synthetic popstate, or a click on an
  //      in-app link), the composer is filled and submitted, and the route goes
  //      back to where you were. It deliberately never opens a tab or sets
  //      location.href: a second app instance refreshes POST /v2/api-tokens,
  //      Grindr rotates the refresh token, and the original tab is logged out —
  //      that was the "pressed f and it logged me out" bug (GREET_MODE).
  //  11. HOTKEYS (navigateProfiles / hotkeyGreetTarget / hotkeyUnlockAlbum /
  //      hotkeyBlockTarget / hotkeyHideTarget): one keydown listener drives the
  //      six-key navigation cluster — Insert greets, Delete unlocks an album,
  //      Home blocks, End hides, PageUp/PageDown navigate. Navigation — on an open
  //      profile by blurring whatever stole focus and re-dispatching the arrow key
  //      Grindr itself listens for (navigateOpenProfile), on the grid by walking a
  //      visual tile cursor (moveHotkeyCursor); they fire even while a text field
  //      is IGNORED while typing, because PageUp/PageDown have a real job inside
  //      a text field. Insert greets and Delete unlocks an album for the target from
  //      resolveTargetProfileId (hover → URL → open view → cursor → last profile
  //      the app fetched), and both are ignored while typing (HOTKEYS_ENABLED).
  //  12. ALBUM UNLOCK (shareNextAlbumWith): CONFIRMED endpoints, taken from a HAR
  //      of the app sharing two albums — POST /api/v1/albums/{id}/shares with a
  //      client-minted uuid shareId, and GET the same path for the authoritative
  //      list of who already has that album. 'u' walks ALBUM_ORDER, asks the
  //      server who already holds each album, and shares the first one this
  //      profile is missing — so an album they already have is never re-sent
  //      (re-sharing doesn't re-notify; the app makes you Stop Sharing first).
  //      Album ids are learned from the app's own /albums/{id}/shares calls, which
  //      it only ever makes for albums you own.
  //  13. STAYING OUT OF THE WAY (grindrOverlayOpen / __grindrBlock_disable): while
  //      a Grindr modal or picker is open, the enforcement sweep and the synthetic
  //      keep-alive mousemove — the only two things this script does to the page
  //      on its own — stand down. And the kill switch turns every listener into a
  //      no-op and restores the patched globals, so "is the userscript causing
  //      this?" is a ten-second test rather than an argument.
  //
  // Entry points are at the bottom: the auxclick / mousedown listeners →
  // attemptBlock → startBlock (block); the contextmenu listener →
  // triggerShiftRightGreetForProfile → openGreetChat (greet), with
  // maybeAutoSendPendingGreetFromUrl() firing on the opened chat page; the keydown
  // listener → navigateProfiles / hotkeyGreetTarget / hotkeyUnlockAlbum /
  // hotkeyBlockTarget / hotkeyHideTarget
  // (hotkeys). DevTools
  // hooks (__grindrBlock_*) sit just above the final load log.
  // ───────────────────────────────────────────────────────────────────────────

  // ── User-tunable knobs ────────────────────────────────────────────────────
  // Flip LOCAL_ONLY=true to skip the block/unblock API calls — the card is still
  // hidden AND the id is still written to the persistent local block list, so the
  // hide does survive a reload. NOTE: the album hotkey ignores this flag entirely.
  // Zero rate-limit / forced-re-login risk from blocks, but the profile will
  // re-appear next session.
  const LOCAL_ONLY = false;
  // Minimum gap between successive API calls (block, unblock, and the verify
  // GETs), applied by the queue so calls never burst. 500ms (0.5s) is the
  // current setting; the rolling-hour cap (MAX_PER_HOUR) is the dominant limiter
  // for sustained use, while this gap just smooths short bursts. Raising it
  // widens the safety margin against Grindr's burst-triggered forced logout;
  // lowering it increases that risk.
  const MIN_INTERVAL_MS = 500;
  // Hard cap per rolling hour. Real Grindr limit is unknown, this is a
  // conservative ceiling that keeps the session alive even on long runs.
  const MAX_PER_HOUR = 500;
  // That ceiling is split into two INDEPENDENT budgets, tracked in separate
  // windows: one for work you started (a block you pressed, an album unlock) and
  // one for the background hide-to-block drain. They do not draw from each other.
  //
  // A single shared budget is what made blocking look broken: the drain runs
  // continuously over a ~1400-entry backlog, so it reached 500/hr on its own and
  // a block pressed by hand was told "Hourly cap (500) hit, waiting 48m". Two
  // windows mean a saturated drain can never delay a block you pressed, while the
  // worst case they can reach together is still MAX_PER_HOUR — so the safety
  // margin against Grindr's burst-triggered forced logout is unchanged.
  // 0.9 = the drain gets 450 calls an hour and you keep 50. Set deliberately: the
  // backlog is thousands of entries and personal use is a handful of blocks a day,
  // so the reserve only has to cover a burst you actually press. One block costs
  // one API call (VERIFY_BLOCKS is off), so 50/hr is fifty blocks an hour by hand.
  // Do not raise this to 1.0 — a zero reserve is the starvation this split exists
  // to prevent, and the split-budget test refuses it.
  const DRAIN_BUDGET_FRACTION = 0.9;
  // Hourly caps OFF, at the operator's explicit request (2026-08-30), having been
  // told the risk: these exist so a burst of writes cannot trigger Grindr's
  // forced re-login. With a backlog in the thousands, waiting out a rolling hour
  // was itself what made the drain look broken.
  //
  // The caps and their split are left intact and merely bypassed, so restoring
  // them is this one flag. MIN_INTERVAL_MS still spaces calls — see its comment.
  const HOURLY_CAPS_ENABLED = false;
  const DRAIN_HOURLY_CAP = Math.floor(MAX_PER_HOUR * DRAIN_BUDGET_FRACTION);
  const MANUAL_HOURLY_CAP = MAX_PER_HOUR - DRAIN_HOURLY_CAP;
  // How long the userscript caches captured auth headers before treating
  // them as stale.
  const AUTH_TTL_MS = 90 * 60_000;
  // After a middle-click (which blocks immediately), how long the "Unblock"
  // option stays on screen. Click it within the window to reverse the block —
  // it cancels the block if it's still queued unsent, otherwise sends a real
  // DELETE un-hide / un-block through the same rate-limited queue.
  const UNDO_WINDOW_MS = 30_000;

  // ── Stay logged in (defeat the 30-minute idle auto-logout) ─────────────────
  // Grindr's web app arms react-idle-timer with a 30-min (1,800,000 ms) timeout;
  // when it fires with no mouse/key/touch/focus/tab-visibility activity it calls
  // logOut({type:"automatic"}) UNLESS you logged in with "Remember Me", then
  // logoutCleanup() runs sessionStorage.clear() + localStorage.clear() and you're
  // bounced to /login?sessionEnd=…. A userscript can't delete Grindr's logout code
  // (it lives in their bundle, in a scope @grant none can't reach), so STAY_LOGGED_IN
  // instead neutralises what TRIGGERS the idle logout — see installStayLoggedIn().
  // The 401-refresh-fail and server-side ban logouts are reactive to server
  // responses, not client timers, and are intentionally left alone. False disables.
  const STAY_LOGGED_IN = true;
  // Any setTimeout Grindr arms with delay >= this floor is treated as the idle
  // countdown and rewritten to IDLE_TIMEOUT_OVERRIDE_MS. 25 min sits below the
  // real 30-min timer but well above every short app timer (1s idle-debounce, 60s
  // Sentry backoff, boost ticks), so only the idle countdown is ever caught.
  const IDLE_CLAMP_FLOOR_MS = 25 * 60_000;
  // What the idle countdown is rewritten to — effectively "never". 99 hours.
  const IDLE_TIMEOUT_OVERRIDE_MS = 99 * 60 * 60_000;
  // Backstop behind the clamp: dispatch a synthetic 'mousemove' this often so the
  // idle timer keeps resetting even if Grindr changes its timeout out from under
  // the clamp. Set to 0 to rely solely on the clamp and send no heartbeat.
  const KEEPALIVE_INTERVAL_MS = 5 * 60_000;
  // Preserve this script's own storage (keys starting with STORAGE_KEEP_PREFIX,
  // e.g. the block list) through logoutCleanup()'s clear(). Grindr's own keys are
  // still cleared exactly as before — only our keys are restored afterward.
  const GUARD_LOCALSTORAGE = true;
  const STORAGE_KEEP_PREFIX = 'grindrMiddleClick';

  // ── Skip the "Grindr Web Beta" welcome dialog ──────────────────────────────
  // After login the app shows a one-time modal ("Notifications Sounds" toggle +
  // "Using Grindr discreetly? … Let's Go!"). It renders only while
  // sessionStorage["grindrWebBetaDialogDismissed"] is absent, and its "Let's Go!"
  // button (id="beta-dismiss-btn") just writes that flag. Because logoutCleanup()
  // clears sessionStorage, the flag is gone on every fresh login, so the modal
  // reappears each time. SKIP_BETA_DIALOG pre-seeds the flag at document-start (so
  // it never opens) and, as a fallback for an in-SPA re-login that mounts it
  // anyway, clicks its dismiss button (which runs the app's own dismiss handler).
  // False disables.
  const SKIP_BETA_DIALOG = true;
  const BETA_DIALOG_SS_KEY = 'grindrWebBetaDialogDismissed';
  const BETA_DIALOG_BTN_ID = 'beta-dismiss-btn';

  // ── Block verification + retry-until-it-sticks ────────────────────────────
  // OFF by design (as of v0.10.1). HAR analysis showed the hide/block POSTs return
  // 200 and the action sticks — exactly as Grindr's own app relies on (it POSTs,
  // gets 200, and just refetches the list to update its UI; it does NOT gate
  // success on finding the id in the list). The list read-back here proved
  // UNRELIABLE: /api/v1/hides doesn't reflect a just-made hide within the retry
  // window (propagation lag and/or a capped/paginated list), so verification
  // false-negatived and the same profile got POSTed 2–3 times (until
  // BLOCK_VERIFY_MAX_MISSES), burning 2–3× the API budget for no benefit. With
  // this OFF, a 200 from the POST = confirmed (stuck = result.ok) — one attempt,
  // done. Genuine failures (network/429/401/403/dead-endpoint) still retry or
  // pause via the transport-handling paths; only the false-negative retry loop is
  // gone. Flip back to true ONLY if you find Grindr silently dropping accepted
  // POSTs AND confirm /api/v1/hides + /api/v4/blocks reflect a new entry promptly.
  const VERIFY_BLOCKS = false;
  // Retry schedule for an unconfirmed block: attempt N waits
  // min(BASE * 2^(N-1), MAX). With base 2s / cap 5m the delays run
  // 2s,4s,8s,…,5m,5m,… so a permanently-stuck block settles into a slow poll
  // instead of a hot loop — important because each retry costs a POST + a
  // verify GET against MAX_PER_HOUR.
  const BLOCK_RETRY_BASE_MS = 2000;
  const BLOCK_RETRY_MAX_MS = 5 * 60_000;
  // Grace period after the POST before the first read-back, so a just-applied
  // block has time to propagate on Grindr's side and we don't false-negative
  // (and immediately retry) a block that did in fact land. NOTE: 500ms is a
  // guess — if blocks take longer to show up in the list, raise it.
  const BLOCK_VERIFY_SETTLE_MS = 500;
  // Safety valve for a read-back that structurally can't see the block (e.g. the
  // list endpoint is paginated/filtered/recency-capped and a just-blocked
  // profile isn't on the page it returns). If the POST keeps succeeding but the
  // read-back keeps saying "not blocked" this many times in a row, stop
  // retrying and trust the POST — otherwise an already-successful block would
  // retry forever and hammer Grindr toward the very forced-logout we avoid.
  const BLOCK_VERIFY_MAX_MISSES = 3;

  // ── Chat greetings / intro messages ────────────────────────────────────────
  // A middle-click or shift+left-click inside a chat composer, a shift+right-click
  // over any profile, and the Insert hotkey all send a random one of these. Edit
  // freely; one greeting per entry.
  //
  // Two optional tokens are substituted at send time from the LOCAL CLOCK, so a
  // greeting can reference the time of day without every greeting doing it (which
  // reads stilted). Keep most entries plain — the mix below is deliberate.
  //   {timeOfDay} → "this morning" | "today" | "tonight"
  //   {dayPart}   → "morning" | "day" | "night"
  const GREETINGS = [
    'Hey',
    'Howdy',
    'Hey there',
    "What's up?",
    "How's it going?",
    'Sup',
    "Hey man, how's it going?",
    'Hey, how are you?',
    // The only time-aware entries — roughly 2 in 9 draws.
    "What're you up to {timeOfDay}?",
    "How's your {dayPart} going?",
  ];
  // Hour-of-day → token values. Boundaries are local time: pre-dawn counts as
  // night, so a 2am "How's your night going?" still reads right.
  function greetingTimeTokens(hour) {
    if (hour < 5)  return { timeOfDay: 'tonight',      dayPart: 'night' };
    if (hour < 12) return { timeOfDay: 'this morning', dayPart: 'morning' };
    if (hour < 17) return { timeOfDay: 'today',        dayPart: 'day' };
    return { timeOfDay: 'tonight', dayPart: 'night' };
  }
  // Substitute the time tokens in a phrase. Applied at PICK time (pickGreeting),
  // not at send time, so a phrase queued for another tab is already resolved and
  // can't drift across a midnight boundary while it waits.
  function resolveGreetingTokens(phrase) {
    const t = greetingTimeTokens(new Date().getHours());
    return String(phrase || '').replace(/\{(timeOfDay|dayPart)\}/g, (_m, k) => t[k]);
  }
  // One physical middle-click can fire BOTH mousedown and auxclick; greeting sends
  // within this window are coalesced so a single gesture sends exactly one.
  const GREETING_COOLDOWN_MS = 1200;
  // One physical middle-click can also fire mousedown AND auxclick for the BLOCK
  // path; a single capture-phase handler is shared by both events and ignores a
  // second fire within this window, so one gesture invokes attemptBlock once.
  const MIDDLE_CLICK_DEDUPE_MS = 150;

  // ── Shift+right-click greeting navigation ───────────────────────────────────
  // Shift+right-click on a profile (a cascade tile, a profile view, or — via the
  // URL — the chat you're already viewing) queues a random greeting and opens that
  // profile's /chat/<id> so it gets sent without you opening the chat by hand —
  // the Sniffies "auto-message" model. The pending phrase is stored in localStorage
  // keyed by profileId; the opened chat page reads these URL params to know which
  // queued greeting to send and whether to self-close afterward. The storage key
  // carries STORAGE_KEEP_PREFIX ('grindrMiddleClick') so the stay-logged-in guard
  // preserves it across Grindr's logout storage clear().
  const PENDING_GREET_STORAGE_KEY = 'grindrMiddleClickPendingGreet_v1';
  const GREET_URL_PARAM = 'grindrGreet';
  const GREET_TS_PARAM = 'grindrGreetTs';
  const GREET_TOKEN_PARAM = 'grindrGreetToken';
  const GREET_AUTOCLOSE_PARAM = 'grindrGreetAutoclose';
  // A queued greeting older than this is discarded rather than sent (stale intent).
  const GREET_PENDING_MAX_AGE_MS = 10 * 60_000;
  // On the opened chat page, poll this often / this many times for the composer
  // before giving up (~12s) — the React chat view mounts asynchronously.
  const GREET_AUTOSEND_INTERVAL_MS = 500;
  const GREET_AUTOSEND_ATTEMPTS = 24;
  // Delay before an auto-greet tab self-closes, giving the send request time to go.
  // (Only used by the legacy 'newtab' mode below.)
  const GREET_TAB_CLOSE_DELAY_MS = 900;
  // How a greet reaches a chat you're not currently on:
  //   'ui'     — DEFAULT. Drive the app's own flow: open the profile, click its
  //              Chat button, type, send, come back. The only path that works for
  //              someone you have NEVER messaged (see greetViaUi).
  //   'spa'    — route in-app to /chat/<sorted conversation id>. Works only for one
  //              that ALREADY exists; a new one makes the app POST that id to
  //              /api/v1/inbox/conversation and get 500.
  //   'newtab' — the pre-0.20 behaviour: open /chat/<id> in a new tab. DON'T use
  //              this unless you know why: a second app instance refreshes
  //              POST /v2/api-tokens, Grindr rotates the refresh token, the
  //              original tab's token is invalidated and you get logged out.
  //   'inline' — only ever send into a chat you already have open; never navigate.
  const GREET_MODE = 'ui';
  // After a successful 'spa' greet, route back to where you were (the grid).
  const GREET_RETURN_AFTER_SEND = true;
  // Wait this long after the send before routing back, so the message request
  // actually leaves before the chat view unmounts.
  const GREET_RETURN_DELAY_MS = 700;

  // ── Keyboard hotkeys ───────────────────────────────────────────────────────
  // ── THE SIX KEYS ───────────────────────────────────────────────────────────
  // Every hotkey lives in the navigation cluster, so the whole set is one
  // contiguous block a mouse or macro pad can drive without touching the
  // alphabet. Read the table as three pairs:
  //
  //   ┌──────────┬────────────────────┬──────────────────────────────────────┐
  //   │ KEY      │ ACTION             │ WHAT IT DOES                         │
  //   ├──────────┼────────────────────┼──────────────────────────────────────┤
  //   │ Insert   │ greet              │ Sends a random canned greeting to the│
  //   │          │                    │ target by driving the app's own UI:  │
  //   │          │                    │ open profile → Chat button → type →  │
  //   │          │                    │ send → return. Advances the cursor.  │
  //   │ Delete   │ unlock album       │ Shares the next album the target does│
  //   │          │                    │ not already have, in ALBUM_ORDER.    │
  //   │          │                    │ Never advances the cursor.           │
  //   ├──────────┼────────────────────┼──────────────────────────────────────┤
  //   │ Home     │ block              │ Full middle-click path: persistent   │
  //   │          │                    │ local block list + rate-limited      │
  //   │          │                    │ hide/block queue + 30s Undo toast.   │
  //   │          │                    │ GRINDR IS TOLD. Advances the cursor. │
  //   │ End      │ hide               │ LOCAL-ONLY: collapses the card in our│
  //   │          │                    │ own DOM, no API call, nothing sent.  │
  //   │          │                    │ Persists (HIDELIST_STORAGE_KEY), ages│
  //   │          │                    │ out after HIDE_MAX_AGE_MS, and is    │
  //   │          │                    │ reversed if they message you.        │
  //   │          │                    │ Advances the cursor.                 │
  //   ├──────────┼────────────────────┼──────────────────────────────────────┤
  //   │ PageUp   │ previous profile   │ Step BACK one profile.               │
  //   │ PageDown │ next profile       │ Step FORWARD one profile.            │
  //   └──────────┴────────────────────┴──────────────────────────────────────┘
  //
  // WHAT NAVIGATION DOES depends on what is on screen:
  //   • A profile open full-screen → advance Grindr's OWN profile pager. We blur
  //     whatever you clicked (the reason its arrow keys went dead) and re-dispatch
  //     the arrow key it listens for; if that doesn't move, we click the view's
  //     next/prev control as a fallback (navigateProfiles).
  //   • The cascade grid → move the script's own tile cursor (a visual outline),
  //     scrolling it to the middle of the viewport and scrolling the page at the
  //     end of the rendered rows so the virtualised grid mounts more.
  //
  // EVERY KEY IS IGNORED WHILE TYPING, and that is a change from v0.24–v0.28.
  // Navigation used to sit on Insert/Delete precisely BECAUSE those two are inert
  // inside a text box — on a Mac the key labelled "delete" is Backspace (untouched),
  // and the `Delete` bound here is FORWARD delete (fn+Delete), which almost nothing
  // uses — so navigation could fire even while the chat composer had focus. That
  // solved a real annoyance: Grindr's own arrow-key profile navigation dies the
  // moment you click the chat box, and you had to click back out to keep moving.
  //
  // v0.29.0 moved navigation onto PageUp/PageDown at the user's request, and those
  // two are NOT inert in a text field — they scroll a focused textarea. Hijacking
  // them while typing would break editing in the composer, so HOTKEY_NAV_IN_TEXT_FIELDS
  // is now false and navigation-while-typing is gone. It is a deliberate trade, not
  // an oversight: click into the chat box and you must click out again before
  // PageUp/PageDown will step profiles. Setting HOTKEY_NEXT_KEY/HOTKEY_PREV_KEY back
  // to 'Insert'/'Delete' and HOTKEY_NAV_IN_TEXT_FIELDS back to true restores the old
  // behaviour in three lines.
  //
  // The action keys were always ignored while typing and still are, which is what
  // leaves Home and End free to do their real editing jobs (start/end of line) in
  // the composer.
  //
  // A KEY ONLY SWALLOWS THE KEYSTROKE WHEN IT ACTUALLY ACTS. Each handler resolves
  // its target synchronously and returns false when there isn't one, and only a
  // true return reaches preventDefault() — so all six keep their native behaviour
  // over empty space (PageDown still scrolls the cascade when no profile is under
  // the cursor) and lose it only where there is genuinely something to act on.
  //
  // TARGETING: the action keys resolve their target through
  // resolveTargetProfileId() — the profile under the mouse pointer on the grid,
  // the open profile/chat otherwise, with several fallbacks (see that function).
  //
  // BLOCK vs HIDE is a difference in WHO IS TOLD, not in how long it lasts — both
  // persist across reloads:
  //   • Home (block) tells Grindr. Local block list + queue + Undo toast.
  //   • End (hide) tells nobody. DOM-only, no API call, no rate-limit cost. The
  //     ids persist in localStorage so a hidden profile stays hidden across
  //     reloads and logouts.
  // The one thing that reverses a hide is the person themselves: any message from
  // them — or a reaction to yours — newer than the moment you hid them unhides
  // them (UNHIDE_ON_MESSAGE). A block supersedes a hide: blocking someone drops
  // them from the hide list so a later message can't resurface a profile you have
  // since blocked outright.
  const HOTKEYS_ENABLED = true;
  // Touch device? The desktop gestures (middle-click, shift-click, hover tracking,
  // hardware keys) do not exist on touch, so mobile relies on the on-screen HUD
  // action buttons and the opt-in long-press. Detected once at load.
  const IS_TOUCH = (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0)
    || (typeof window !== 'undefined' && 'ontouchstart' in window);
  // event.key values. All six are compared case-insensitively.
  //   Insert → greet    Delete → unlock album
  //   Home   → block    End    → hide
  //   PageUp → previous profile   PageDown → next profile
  // Each binding is a LIST of accepted event.key values, because Insert turned out
  // to be unreachable. A capture recorded Delete, Home, PageUp and PageDown all
  // arriving while Insert produced NO keydown at all — Apple keyboards simply do
  // not have an Insert key, so the greet hotkey could never fire from the
  // keyboard no matter what the code did. Aliases keep Insert working for anyone
  // whose mouse or macro pad can send it, while giving the keyboard a key that
  // exists. F8 is the alias: unbound on macOS by default and outside the cluster
  // so it cannot be mistaken for a neighbour.
  const HOTKEY_GREET_DEFAULT = ['Insert', 'F8'];
  const HOTKEY_ALBUM_DEFAULT = ['Delete'];
  const HOTKEY_BLOCK_DEFAULT = ['Home'];
  const HOTKEY_HIDE_DEFAULT = ['End'];
  const HOTKEY_PREV_DEFAULT = ['PageUp'];
  const HOTKEY_NEXT_DEFAULT = ['PageDown'];
  // Accepts a string or a list, so a binding can be edited either way.
  // ── User-rebindable bindings ──────────────────────────────────────────────
  // Two keys have now been chosen that the user's keyboard cannot send: Insert
  // (absent from every Apple keyboard) and F8 (a media key unless "Use F1, F2 as
  // standard function keys" is on). Guessing which keys exist on someone else's
  // hardware is not a solvable problem from here, so stop guessing: the HUD can
  // LEARN a key. Click the binding, press whatever you want, and the actual
  // event.key your keyboard produces is stored. Overrides persist and win over
  // the defaults below.
  const KEYBIND_STORAGE_KEY = 'grindrMiddleClickKeys_v1';
  let keyOverrides = {};
  // Restore user key rebindings from localStorage into keyOverrides.
  function loadKeyOverrides() {
    const o = readJson(KEYBIND_STORAGE_KEY, {}, 'key overrides');
    keyOverrides = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  }
  // Bind `action` ('greet'|'album'|'block'|'hide'|'prev'|'next') to `key`,
  // persist it, and redraw the HUD. Returns true.
  function setKeyBinding(action, key) {
    if (!action || !key) return false;
    keyOverrides[action] = [String(key)];
    writeJson(KEYBIND_STORAGE_KEY, keyOverrides, 'key overrides');
    logInfo(`${LOG} ${action} rebound to "${key}".`);
    showToast(`${action} → ${key}`, 'ok');
    refreshHud();
    return true;
  }
  // Drop every rebinding so the built-in defaults apply again.
  function clearKeyBindings() {
    keyOverrides = {};
    writeJson(KEYBIND_STORAGE_KEY, keyOverrides, 'key overrides');
    showToast('Key bindings reset to defaults', 'ok');
    refreshHud();
    return true;
  }
  // Resolve a binding: a stored override wins, else the built-in default.
  const bindingFor = (action, dflt) => (keyOverrides[action] && keyOverrides[action].length ? keyOverrides[action] : dflt);
  const keyList = (b) => (Array.isArray(b) ? b : [b]).map(String);
  const keyMatches = (b, k) => keyList(b).some((x) => x.toLowerCase() === String(k || '').toLowerCase());
  const keyLabel = (b) => keyList(b).join(' or ');
  const HOTKEY_GREET_KEY = () => bindingFor('greet', HOTKEY_GREET_DEFAULT);
  const HOTKEY_ALBUM_KEY = () => bindingFor('album', HOTKEY_ALBUM_DEFAULT);
  const HOTKEY_BLOCK_KEY = () => bindingFor('block', HOTKEY_BLOCK_DEFAULT);
  const HOTKEY_HIDE_KEY  = () => bindingFor('hide',  HOTKEY_HIDE_DEFAULT);
  const HOTKEY_PREV_KEY  = () => bindingFor('prev',  HOTKEY_PREV_DEFAULT);
  const HOTKEY_NEXT_KEY  = () => bindingFor('next',  HOTKEY_NEXT_DEFAULT);
  // Navigation now sits on PageUp/PageDown, which DO have a job inside a text
  // field (scrolling it), so it can no longer fire while typing — see the note
  // above. Flipping this to true without also moving navigation back to
  // Insert/Delete would break scrolling in the composer.
  const HOTKEY_NAV_IN_TEXT_FIELDS = false;
  // Shows/hides the on-screen legend + diagnostics panel.
  const HOTKEY_TOGGLE_HUD_KEY = '\\';
  // After greeting, advance to the next profile so you can hold a rhythm of
  // Insert → PageDown → Insert → PageDown (or just Insert, since it advances for
  // you).
  const HOTKEY_GREET_ADVANCES = true;
  // Same for block/hide: the card is on its way off the screen either way, so
  // stepping to the next one is what you were going to do next anyway.
  const HOTKEY_BLOCK_ADVANCES = true;
  // The grid cursor highlight, applied as inline styles on the tile (and fully
  // restored when the cursor moves away).
  const HOTKEY_CURSOR_OUTLINE = '3px solid #ffcc00';
  const HOTKEY_CURSOR_RADIUS = '6px';
  // A tile smaller than this in either dimension is a thumbnail/avatar, not a
  // cascade cell — same 80px floor resolveProfileIdFromClick uses.
  const HOTKEY_MIN_TILE_PX = 80;
  // At the end of the rendered grid, scroll by this fraction of the viewport and
  // retry the move after HOTKEY_EDGE_SCROLL_WAIT_MS so virtualised tiles mount.
  const HOTKEY_EDGE_SCROLL_FRACTION = 0.7;
  const HOTKEY_EDGE_SCROLL_WAIT_MS = 400;
  // After re-dispatching the arrow key into an open profile view, wait this long
  // and check whether the view actually changed; if it didn't, click the view's
  // own next/prev button instead (navigateOpenProfile).
  const PROFILE_NAV_VERIFY_MS = 300;
  // Mouse-position tracking for "greet whoever I'm hovering". Sampled at most
  // this often so a fast mouse can't cost anything measurable.
  const HOVER_SAMPLE_MS = 50;
  // ── Auto-hide / auto-block by profile text ─────────────────────────────────
  // Independently of any click, every profile the script sniffs out of Grindr's
  // own traffic (see indexProfileFromPayload) has its text checked against this
  // keyword list; a match is acted on automatically. Edit the list freely — one
  // keyword or phrase per entry, matched case-insensitively. Leave it EMPTY to
  // disable the whole feature (it then costs nothing — every check short-circuits).
  const TEXT_FILTER_KEYWORDS = [
    // 'no fats',
    // 'no fems',
    // 'masc only',
    // 'sober',
  ];
  // What to do with a profile whose text matches a keyword above:
  //   'hide'  — DOM-only: collapse the card locally, NO API call and nothing
  //             recorded — the profile can reappear next session. Zero rate-limit
  //             risk; the safest default.
  //   'block' — route it through the SAME rate-limited block queue as a manual
  //             middle-click block: it's added to the persistent local block list,
  //             a hide/block is POSTed, and it stays hidden across refresh/scroll.
  const TEXT_FILTER_ACTION = 'hide';
  // true  → a keyword only matches on a whole-word boundary, so 'fem' will NOT
  //         match 'feminine'. false → plain case-insensitive substring match.
  const TEXT_FILTER_WHOLE_WORD = false;
  // Profile fields scanned for keywords. Each value may be a string or an array
  // (tags/tribes), and array entries may be plain strings or objects with a
  // `.name`; everything else is ignored. Add a field name here if a future Grindr
  // payload exposes profile text under a different key.
  const TEXT_FILTER_FIELDS = [
    'displayName', 'aboutMe', 'about', 'profileName', 'name', 'headline',
    'lookingFor', 'tags', 'hashtags', 'tribes', 'interests',
  ];
  // Precompiled keyword matchers, built ONCE at load. Substring keywords are
  // lower-cased and tested with String.includes; whole-word keywords compile to a
  // boundary-anchored RegExp with their regex metacharacters escaped, so a stray
  // '.', '(' or '\' in a keyword can't break (or inject into) the pattern. A
  // left-boundary group (not a lookbehind) keeps it parseable on older Safari.
  const escapeTextFilterRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textFilterMatchers = TEXT_FILTER_KEYWORDS
    .map(k => String(k || '').trim().toLowerCase())
    .filter(Boolean)
    .map(k => TEXT_FILTER_WHOLE_WORD
      ? { keyword: k, re: new RegExp('(?:^|[^a-z0-9])' + escapeTextFilterRe(k) + '(?:[^a-z0-9]|$)', 'i') }
      : { keyword: k, re: null });
  // Session-only set of profileIds hidden DOM-only by the text filter ('hide'
  // mode — no API call was made). Kept SEPARATE from the persistent
  // blockedProfileIds so a local hide is never mistaken for a real block, and
  // re-derived from scratch each session.
  const autoTextHiddenIds = new Set();
  // Profiles already run through the filter this session. The cascade re-delivers
  // the same profile object on every scroll/refresh, so this guard keeps the
  // decision (and its log line) to once per profile.
  const autoTextHandled = new Set();
  // Cap it like every other session index (photoHashToProfileId, seenConversationIds,
  // the diag rings): once a text-filter keyword is configured this grows one entry
  // per distinct profile for the life of the tab, and the cascade serves hundreds
  // per scroll. Insertion-order eviction keeps it bounded.
  const AUTO_TEXT_HANDLED_MAX = 20_000;
  // Record a profile as text-filter-handled, evicting the oldest entry past the cap.
  function markAutoTextHandled(pid) {
    autoTextHandled.add(pid);
    if (autoTextHandled.size > AUTO_TEXT_HANDLED_MAX) autoTextHandled.delete(autoTextHandled.values().next().value);
  }

  // Flatten the configured text fields of one profile object into a single
  // searchable string (fields joined by a separator that can't occur in a
  // keyword, so a keyword can't accidentally span two fields).
  function collectProfileText(obj) {
    const parts = [];
    for (const field of TEXT_FILTER_FIELDS) {
      const v = obj[field];
      if (typeof v === 'string') parts.push(v);
      else if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string') parts.push(item);
          else if (item && typeof item === 'object' && typeof item.name === 'string') parts.push(item.name);
        }
      }
    }
    return parts.join(' \u241f ');
  }

  // Pull the {name, photoUrl, text} an auto-block toast displays. Name and photo
  // reuse the same field fallbacks the indexer uses; text is a whitespace-
  // collapsed snippet (About Me if present, else the flattened scanned text) so
  // the toast shows roughly WHY the profile matched. All fields are optional —
  // makeUnblockToast renders only what's present.
  function collectProfileMeta(obj) {
    const name = String(
      obj.displayName || obj.profileName || obj.name || obj.headline || ''
    ).trim();
    let photoUrl = '';
    for (const u of [obj.primaryImageUrl, obj.imageUrl, obj.profileImageUrl, obj.primaryPhotoUrl, obj.thumbUrl]) {
      const s = String(u || '').trim();
      if (s) { photoUrl = s; break; }
    }
    const aboutMe = String(obj.aboutMe || obj.about || '').trim();
    const text = (aboutMe || collectProfileText(obj)).replace(/\s+/g, ' ').trim().slice(0, 160);
    return { name, photoUrl, text };
  }

  // Return the first keyword that matches `text`, or '' if none. Always '' when
  // the matcher set is empty, which is what makes the disabled feature free.
  function matchTextFilter(text) {
    if (!text || !textFilterMatchers.length) return '';
    const lower = text.toLowerCase();
    for (const m of textFilterMatchers) {
      if (m.re ? m.re.test(text) : lower.includes(m.keyword)) return m.keyword;
    }
    return '';
  }

  // Auto-hide / auto-block decision for one freshly-indexed profile. Short-circuits
  // when the feature is off, the profile was already handled this session, or it's
  // already on the persistent block list (existing enforcement covers it). On a
  // keyword hit it either enqueues a real block (TEXT_FILTER_ACTION 'block') or
  // records a DOM-only hide ('hide'); either way scheduleEnforce() collapses the
  // visible card on the next sweep.
  function maybeAutoFilterByText(pid, obj) {
    if (!textFilterMatchers.length || !pid || autoTextHandled.has(pid)) return;
    if (blockedProfileIds.has(pid)) { markAutoTextHandled(pid); return; }
    const hit = matchTextFilter(collectProfileText(obj));
    if (!hit) return;
    markAutoTextHandled(pid);
    if (TEXT_FILTER_ACTION === 'block') {
      logInfo(`${LOG} Auto-BLOCK ${pid} — profile text matched "${hit}".`);
      addToLocalBlockList(pid);
      enqueueAction(pid, 'block');
      // Pop a rich Undo toast (name/photo/matched-text). No card element exists
      // yet — the enforcement sweep collapses it — so offerUnblock gets a null
      // profileEl; its undo still works (drops the id and restores by photo-hash).
      try { offerUnblock(pid, null, null, collectProfileMeta(obj)); }
      catch (e) { logTrace(`${LOG} auto-block toast error:`, e); }
    } else {
      logInfo(`${LOG} Auto-HIDE ${pid} — profile text matched "${hit}".`);
      autoTextHiddenIds.add(pid);
    }
    scheduleEnforce();
  }

  const LOG = '[GrindrBlock]';
  // Single source for the runtime version. Keep in step with the @version header
  // line above (Tampermonkey reads that from the comment; this is for the code).
  const SCRIPT_VERSION = '0.61.0';

  // ── Verbosity-gated logging ────────────────────────────────────────────────
  // Every log call in the script routes through these helpers and prints only
  // when LOG_LEVEL is at or above the message's level. Levels are cumulative:
  //   silent — nothing
  //   error  — failures only (network errors)
  //   warn   — + recoverable problems (rate-limit, session-dead, no-auth, drops)
  //   info   — + normal lifecycle: blocks, unblocks, queue results   ← default
  //   trace  — + one line on entry to (nearly) every function call
  // Tune live from the page's DevTools console:
  //   __grindrBlock_setLog('trace')   // full per-call trace
  //   __grindrBlock_setLog('warn')    // quiet down to problems only
  // Messages already carry the `${LOG}` prefix, so the helpers don't re-add it;
  // logTrace uses console.debug (Chrome's "Verbose" tier) to stay out of the way.
  const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, trace: 4 };
  let LOG_LEVEL = 'info';
  const logEnabled = (level) => LOG_LEVELS[LOG_LEVEL] >= (LOG_LEVELS[level] ?? 99);
  // ── Diagnostic recorder ───────────────────────────────────────────────────
  // Every log line is offered to the recorder BEFORE the verbosity gate, so a
  // recording captures trace-level detail without the console being flooded at
  // trace level for the rest of the session. Off by default and bounded, so it
  // costs nothing until armed.
  // A first real recording filled all 3000 entries in FOUR SECONDS: 2952 of them
  // were a single trace line, indexProfileFromPayload, which fires once per
  // profile in every payload — and Grindr's hides list alone carries 3309. The
  // signal (one hotkey press) was evicted before it could be pressed.
  //
  // So the buffer is now PARTITIONED. Events, warnings and errors go in a
  // protected ring that high-volume trace can never evict, and the noisiest
  // trace lines are sampled rather than recorded in full.
  const DIAG_MAX_TRACE = 1500;
  const DIAG_MAX_SIGNAL = 1500;
  const DIAG_NOISY_TRACE_RE = /(indexProfileFromPayload|walkAndIndex|captureFromHeaders|setTimeout\()/;
  const DIAG_NOISY_SAMPLE = 50;      // keep 1 in N of the noisy lines
  let diagRecording = false;
  let diagTrace = [];
  let diagSignal = [];
  let diagNoisyCount = 0;
  let diagNoisySkipped = 0;
  let diagStartedAt = 0;
  // Merged, time-ordered view — what the report and the entry count use.
  function diagAll() { return diagTrace.concat(diagSignal).sort((a, b) => a.t - b.t); }
  // Total entries held by the recorder across both rings.
  function diagCount() { return diagTrace.length + diagSignal.length; }
  // Empty every recorder buffer and counter.
  function diagReset() { diagTrace = []; diagSignal = []; diagNet = []; diagNoisyCount = 0; diagNoisySkipped = 0; diagClicks = 0; }
  // Offer a log line to the recorder. Trace goes in a ring that signal cannot be
  // evicted by; known floods are sampled.
  function diagPush(level, args) {
    if (!diagRecording) return;
    let msg;
    try {
      msg = args.map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try { return JSON.stringify(a); } catch (_e) { return String(a); }
      }).join(' ');
    } catch (_e) { msg = '(unserialisable)'; }
    const entry = { t: Date.now(), level, msg: msg.slice(0, 2000) };
    if (level === 'trace') {
      // Sample the known floods; keep everything else.
      if (DIAG_NOISY_TRACE_RE.test(entry.msg)) {
        diagNoisyCount += 1;
        if (diagNoisyCount % DIAG_NOISY_SAMPLE !== 1) { diagNoisySkipped += 1; return; }
        entry.msg += `  (1 of every ${DIAG_NOISY_SAMPLE} kept)`;
      }
      diagTrace.push(entry);
      if (diagTrace.length > DIAG_MAX_TRACE) diagTrace.shift();
      return;
    }
    diagSignal.push(entry);
    if (diagSignal.length > DIAG_MAX_SIGNAL) diagSignal.shift();
  }
  // Record a structured event (a keypress, a resolution, an API outcome) that is
  // not otherwise a log line. These are what make a recording diagnosable.
  function diagEvent(kind, detail) {
    if (!diagRecording) return;
    diagSignal.push({ t: Date.now(), level: 'event', msg: `${kind} ${(() => { try { return JSON.stringify(detail); } catch (_e) { return String(detail); } })()}` });
    if (diagSignal.length > DIAG_MAX_SIGNAL) diagSignal.shift();
  }

  // ── Network capture (HAR 1.2) ─────────────────────────────────────────────
  // While recording, every Grindr request is captured with its status, timing
  // and bodies, and emitted as a real HAR file — the same format DevTools
  // exports, so it opens in any HAR viewer. This is what turns "it said it
  // worked but nothing happened" into an answerable question: the log says what
  // we THOUGHT happened, the HAR says what Grindr actually returned.
  const DIAG_MAX_NET = 400;
  const DIAG_MAX_BODY = 20_000;      // per body, to keep the file openable
  let diagNet = [];
  // Credential-bearing endpoints. Their request/response bodies carry the refresh
  // token and freshly-minted access/refresh JWTs, and the recorder writes a HAR the
  // user is explicitly told to share — so these bodies must never be captured.
  const SENSITIVE_URL_RE = /(api-tokens|\/auth\b|\/login\b|\/logout\b|\/sessions?\b|password|refresh[_-]?token|oauth|credential)/i;
  // Defence in depth: scrub token-shaped substrings from anything that will be
  // exported or shared, in case a token is echoed in an unexpected field of an
  // otherwise-innocent endpoint. Capture-time gating (SENSITIVE_URL_RE) is primary.
  function scrubSecrets(text) {
    if (typeof text !== 'string' || !text) return text;
    return text
      .replace(/("(?:access|refresh|id)[_-]?[Tt]oken"\s*:\s*")[^"]+(")/g, '$1[REDACTED]$2')
      .replace(/("(?:authorization|password|secret|api[_-]?key)"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
      .replace(/\b(Grindr3?\s+)[A-Za-z0-9._~+/=-]{12,}/g, '$1[REDACTED]')
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9._-]{20,}/g, '[REDACTED-JWT]');
  }
  // Store a captured body: redact credential endpoints wholesale, scrub the rest.
  function captureBody(url, body) {
    if (SENSITIVE_URL_RE.test(String(url || ''))) return '(redacted: credential endpoint)';
    return scrubSecrets(String(body).slice(0, DIAG_MAX_BODY));
  }
  // Begin recording one request. Returns a record to hand to diagNetFinish, or
  // null when not recording.
  function diagNetStart(method, url) {
    if (!diagRecording) return null;
    const rec = { method: String(method || 'GET').toUpperCase(), url: String(url || ''), started: Date.now(), reqBody: '', status: 0, statusText: '', resBody: '', mime: '', ms: 0 };
    diagNet.push(rec);
    if (diagNet.length > DIAG_MAX_NET) diagNet.shift();
    return rec;
  }
  // Complete a request record with status, timing and body.
  function diagNetFinish(rec, res, resBody) {
    if (!rec) return;
    rec.ms = Date.now() - rec.started;
    try {
      rec.status = res ? res.status : 0;
      rec.statusText = res ? String(res.statusText || '') : '';
      rec.mime = res && res.headers && res.headers.get ? String(res.headers.get('content-type') || '') : '';
    } catch (_e) {}
    if (typeof resBody === 'string') rec.resBody = captureBody(rec.url, resBody);
  }
  // Convert one internal request record to a HAR 1.2 entry.
  function harEntry(r) {
    return {
      startedDateTime: new Date(r.started).toISOString(),
      time: r.ms,
      request: {
        method: r.method, url: r.url, httpVersion: 'HTTP/1.1',
        cookies: [], headers: [], queryString: [], headersSize: -1,
        bodySize: r.reqBody ? r.reqBody.length : 0,
        postData: r.reqBody ? { mimeType: 'application/json', text: r.reqBody } : undefined,
      },
      response: {
        status: r.status, statusText: r.statusText, httpVersion: 'HTTP/1.1',
        cookies: [], headers: [], redirectURL: '', headersSize: -1,
        bodySize: r.resBody ? r.resBody.length : 0,
        content: { size: r.resBody ? r.resBody.length : 0, mimeType: r.mime || 'application/json', text: r.resBody },
      },
      cache: {}, timings: { send: 0, wait: r.ms, receive: 0 },
    };
  }
  // Build a complete HAR 1.2 document from everything captured this recording.
  function buildHar() {
    return {
      log: {
        version: '1.2',
        creator: { name: 'GrindrBlock userscript', version: SCRIPT_VERSION },
        pages: [], entries: diagNet.map(harEntry),
      },
    };
  }

  // Log an error. Always offered to the diagnostic recorder first, then gated by
  // LOG_LEVEL.
  function logError(...a) { diagPush('error', a); if (logEnabled('error')) console.error(...a); }
  // Log a warning. Recorded before the verbosity gate.
  function logWarn(...a)  { diagPush('warn', a);  if (logEnabled('warn'))  console.warn(...a); }
  // Log an informational line. Recorded before the verbosity gate.
  function logInfo(...a)  { diagPush('info', a);  if (logEnabled('info'))  console.log(...a); }
  // Log trace detail. Recorded before the verbosity gate, so a recording
  // captures trace without the console being flooded.
  function logTrace(...a) { diagPush('trace', a); if (logEnabled('trace')) console.debug(...a); }

  // ── Persistent local block list ───────────────────────────────────────────
  // The middle-click block hides a card and POSTs a hide, but Grindr's cascade
  // is virtualised and re-fetches profiles, so a just-blocked profile reappears
  // on scroll/refresh until the server-side hide propagates. To bridge that gap
  // we keep a LOCAL-only list of blocked profileIds in localStorage (this script
  // is @grant none, so no GM storage is available). On every cascade payload and
  // DOM mutation we re-hide any listed profile that reappears and, if it actually
  // rendered visibly again, re-submit the block through the rate-limited queue.
  // ── Persistent LOCAL-ONLY hide list (PageDown) ─────────────────────────────
  // A hide is not a block. Nothing is sent to Grindr, no API call is made, no
  // rate limit is consumed — the profile is simply collapsed in our own DOM. What
  // makes it useful rather than cosmetic is that it PERSISTS: the ids live in
  // localStorage under the STORAGE_KEEP_PREFIX the stay-logged-in guard preserves,
  // so a hidden profile stays hidden across reloads and logouts, unlike the
  // session-only set the text filter's 'hide' mode uses.
  //
  // The one thing that undoes it is the person themselves. We store WHEN each
  // profile was hidden, and any message from them newer than that timestamp
  // unhides them (see noteIncomingMessages). The timestamp comparison is the
  // whole point: without it, merely scrolling back through an old conversation
  // you had before hiding someone would resurface them. Only a message that
  // arrived AFTER you hid them counts as them reaching out.
  const HIDELIST_STORAGE_KEY = 'grindrMiddleClickHiddenList_v1';
  const hiddenProfileIds = new Map();   // profileId -> hiddenAt (epoch ms)
  // Set false to make a hide permanent regardless of incoming messages.
  const UNHIDE_ON_MESSAGE = true;
  // A hide expires after this long and the profile comes back into the cascade.
  // Set to 0 for no expiry. Pruning happens on load and on each backstop sweep,
  // so an entry can outlive its deadline by at most one sweep interval — which is
  // fine, since the only consequence is a card staying hidden a few seconds longer.
  const HIDE_MAX_AGE_MS = 90 * 24 * 60 * 60_000;   // 90 days
  // Drop every hide older than HIDE_MAX_AGE_MS. Entries with hiddenAt = 0 (an
  // unknown time, e.g. a list written in an older shape) are stamped with now
  // rather than expired immediately — expiring them would silently unhide
  // everyone on upgrade, which is the opposite of what an unknown time implies.
  function pruneHiddenList() {
    if (!HIDE_MAX_AGE_MS || !hiddenProfileIds.size) return 0;
    const now = Date.now();
    let dropped = 0;
    let restamped = 0;
    const expired = [];
    for (const [id, at] of [...hiddenProfileIds.entries()]) {
      if (!at) { hiddenProfileIds.set(id, now); restamped += 1; continue; }
      if (now - at <= HIDE_MAX_AGE_MS) continue;
      expired.push(id);
    }
    // Collect, then write ONCE. unhideProfile → removeFromHiddenList →
    // saveHiddenList meant a full JSON.stringify + setItem per expired entry,
    // inside a loop that runs on every 3-second sweep.
    for (const id of expired) {
      hiddenProfileIds.delete(id);
      try { for (const card of findCardsForProfile(id)) { card.style.display = ''; card.style.opacity = ''; } } catch (_e) {}
      logInfo(`${LOG} UNHID ${id} — hide expired after ${Math.round(HIDE_MAX_AGE_MS / 86_400_000)} days`);
      dropped += 1;
    }
    if (restamped || expired.length) saveHiddenList();
    return dropped;
  }
  // Restore the persistent local hide list (id -> hiddenAt) from localStorage.
  function loadHiddenList() {
    try {
      const raw = localStorage.getItem(HIDELIST_STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      // Accept the plain-array form too, so a list written by any future/earlier
      // shape still loads; an unknown hiddenAt becomes 0, which means "any
      // message unhides them" — the safe direction to err in.
      if (Array.isArray(obj)) { for (const id of obj) if (id != null) hiddenProfileIds.set(String(id), 0); return; }
      if (obj && typeof obj === 'object') {
        for (const [id, at] of Object.entries(obj)) hiddenProfileIds.set(String(id), Number(at) || 0);
      }
    } catch (e) { logWarn(`${LOG} loadHiddenList failed:`, e); }
  }
  // Returns whether the write actually landed. The caller toasts "Hidden … until
  // they message you", which is a durability promise — under QuotaExceededError
  // the in-memory Map and storage silently diverged and the hide vanished on
  // reload while the user had been told it would persist.
  function saveHiddenList() { return writeJson(HIDELIST_STORAGE_KEY, Object.fromEntries(hiddenProfileIds), 'saveHiddenList'); }
  // Add a profile to the local hide list. Returns whether the write actually
  // persisted.
  function addToHiddenList(profileId) {
    const id = String(profileId || '');
    if (!id || hiddenProfileIds.has(id)) return false;
    hiddenProfileIds.set(id, Date.now());
    const persisted = saveHiddenList();
    logTrace(`${LOG} hide list + ${id} (${hiddenProfileIds.size} total, persisted=${persisted})`);
    return persisted;
  }
  // Drop a profile from the local hide list. Returns true if it was there.
  function removeFromHiddenList(profileId) {
    const id = String(profileId || '');
    if (!hiddenProfileIds.delete(id)) return false;
    saveHiddenList();
    logTrace(`${LOG} hide list - ${id} (${hiddenProfileIds.size} total)`);
    return true;
  }
  // Undo a hide and put the card back on screen. The enforcement sweep only ever
  // sets display:none/opacity:0, so clearing those two is a complete restore.
  function unhideProfile(profileId, why) {
    const id = String(profileId || '');
    if (!removeFromHiddenList(id)) return false;
    try {
      for (const card of findCardsForProfile(id)) {
        card.style.display = '';
        card.style.opacity = '';
      }
    } catch (_e) {}
    logInfo(`${LOG} UNHID ${id}${why ? ` — ${why}` : ''}`);
    return true;
  }

  // ── Two-tier block list: PENDING vs CONFIRMED ─────────────────────────────
  // The enforcement sweep exists to bridge one specific gap: between the moment
  // we POST a block and the moment Grindr's own server-side hide propagates into
  // the cascade. Until it propagates, the profile keeps arriving in payloads and
  // we must collapse its tile ourselves. AFTER it propagates, Grindr stops
  // sending that profile at all — so every DOM scan looking for it is guaranteed
  // to find nothing, forever. That was the entire cost of a large block list.
  //
  // So the list is split. Only PENDING ids are enforced against the DOM.
  // CONFIRMED ids are kept as a record and cost nothing per sweep.
  //
  //   pending  = blockedProfileIds \ blockConfirmedIds
  //   promote  pending → confirmed when a landed block has not been seen in a
  //            cascade payload for BLOCK_CONFIRM_QUIET_MS
  //   demote   confirmed → pending the instant it appears in a payload again
  //
  // The demotion check is what makes this safe, and it is FREE: it rides
  // indexProfileFromPayload, which already runs for every profile in every
  // payload. No DOM query is involved in noticing that a block stopped working —
  // we learn it from Grindr's own traffic, and only then start scanning again.
  // ── localStorage JSON helpers ─────────────────────────────────────────────
  // Four stores repeated the same getItem -> JSON.parse -> validate and
  // JSON.stringify -> setItem -> logWarn pair. writeJson returns whether the
  // write LANDED, which callers need: a hide that failed to persist must not be
  // reported to the user as durable.
  function readJson(key, fallback, label) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { logWarn(`${LOG} ${label || key} read failed:`, e); return fallback; }
  }
  // JSON-encode and store a value. Returns whether the write landed, which
  // callers need before promising durability.
  function writeJson(key, value, label) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { logWarn(`${LOG} ${label || key} write failed:`, e); return false; }
  }

  const BLOCK_CONFIRMED_STORAGE_KEY = 'grindrMiddleClickBlockConfirmed_v1';
  const blockConfirmedIds = new Set();
  // When each block last landed 2xx, so promotion can require a quiet period.
  const blockLandedAt = new Map();
  // Fallback only — used when the authoritative list can't be reached. An hour is
  // deliberately conservative: guessing wrong here means we stop enforcing a block
  // that never actually landed.
  const BLOCK_CONFIRM_QUIET_MS = 60 * 60_000;
  // Restore the set of blocks Grindr has confirmed.
  function loadConfirmedBlocks() {
    try {
      const raw = localStorage.getItem(BLOCK_CONFIRMED_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) for (const id of arr) { if (id != null) blockConfirmedIds.add(String(id)); }
    } catch (e) { logWarn(`${LOG} loadConfirmedBlocks failed:`, e); }
  }
  // Persist the confirmed-block set.
  function saveConfirmedBlocks() { return writeJson(BLOCK_CONFIRMED_STORAGE_KEY, [...blockConfirmedIds], 'saveConfirmedBlocks'); }
  // ── Authoritative confirmation: ask Grindr who it thinks is hidden/blocked ──
  // Far better than inferring propagation from silence. A HAR of a real block
  // shows GET /api/v1/hides returning the COMPLETE list in one unpaginated
  // response — {"hides":[{"profileId":N,"displayName":…,"mediaHash":…}, …]},
  // 3309 entries, ~230KB, including the profile hidden seconds earlier. So one
  // request answers "has this propagated?" for every pending block at once,
  // instead of guessing from a quiet period.
  //
  // (The same capture shows a second, weaker signal: opening a hidden profile's
  // conversation returns 403 urn:gr:err:unauthorized_action. That confirms one
  // profile at a time and only when you happen to open it, so it isn't used —
  // the list is strictly better.)
  const LIST_RESPONSE_URL_RE = /\/api\/(?:v1\/hides|v\d+\/blocks)/i;
  // Every id in a hides/blocks list is a block Grindr has already applied.
  function confirmBlocksFromListPayload(data) {
    if (!blockedProfileIds.size) return 0;
    let promoted = 0;
    for (const id of idsFromListPayload(data)) {
      if (blockedProfileIds.has(id) && !blockConfirmedIds.has(id)) { blockConfirmedIds.add(id); promoted += 1; }
    }
    if (promoted) {
      saveConfirmedBlocks();
      logInfo(`${LOG} ${promoted} block(s) confirmed from Grindr's own list response — ${pendingBlockIds().length} still pending.`);
      refreshHud();
    }
    return promoted;
  }
  // Ids Grindr has as REAL blocks (from /api/v4/blocks), learned by reconcile.
  // What Grindr's own /blocks list held at the last authoritative walk.
  //
  // THIS MUST PERSIST. It is the subtrahend in hidesNeedingUpgrade() — the drain
  // backlog is `blockedProfileIds \ serverBlockedIds` — and blockedProfileIds IS
  // persisted. When this set was memory-only, every page load reset it to empty
  // and the backlog was recomputed as the ENTIRE local block list, including the
  // thousand entries already upgraded in earlier sessions. The count therefore
  // could never trend down across reloads; it only tracked the growth of the local
  // list, which is exactly the "the number keeps going up" that was reported. The
  // drain then re-blocked profiles Grindr already had, spending its whole hourly
  // budget re-doing finished work.
  const SERVER_BLOCKS_STORAGE_KEY = 'grindrMiddleClickServerBlocks_v1';
  let serverBlockedIds = new Set();
  // False until we have a real picture of what Grindr holds — no snapshot restored
  // and no reconcile completed yet. The drain refuses to run while this is false,
  // because an empty snapshot makes every local block look unupgraded and the drain
  // would re-block the entire list.
  let serverBlocksKnown = false;
  // Validate a stored snapshot. Pure, and deliberately strict: a corrupt or
  // foreign value must read as "no snapshot" rather than as an empty one, because
  // an empty snapshot silently means "Grindr holds nothing" and would send the
  // drain through the whole list again.
  function parseServerBlocksSnapshot(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let o;
    try { o = JSON.parse(raw); } catch (_e) { return null; }
    if (!o || typeof o !== 'object' || !Array.isArray(o.ids)) return null;
    const ids = o.ids.filter((x) => typeof x === 'string' && /^\d+$/.test(x));
    if (ids.length !== o.ids.length) return null;   // partial corruption is still corruption
    return { ids, at: typeof o.at === 'number' ? o.at : 0 };
  }
  // Restore the snapshot of what Grindr holds.
  function loadServerBlocks() {
    const snap = parseServerBlocksSnapshot(localStorage.getItem(SERVER_BLOCKS_STORAGE_KEY));
    if (!snap) return;
    serverBlockedIds = new Set(snap.ids);
    serverBlocksKnown = true;
    logInfo(`${LOG} restored Grindr's block snapshot: ${serverBlockedIds.size} real block(s) from the last reconcile.`);
  }
  // Persist it. Called after the authoritative walk and after each optimistic add,
  // so a reload never loses ground the drain has already made.
  function saveServerBlocks() {
    return writeJson(SERVER_BLOCKS_STORAGE_KEY,
      { ids: [...serverBlockedIds], at: Date.now() }, 'saveServerBlocks');
  }
  // Our local entries that Grindr does NOT have as a real block. These were made
  // as hides (pre-v0.45 behaviour), and a hide never removes anyone from the
  // cascade — upgrading them is what actually gets them out of the feed.
  function hidesNeedingUpgrade() {
    const out = [];
    for (const id of blockedProfileIds) {
      if (serverBlockedIds.has(id)) continue;
      if (isUnupgradeable(id)) continue;   // proven not to take a block; see above
      out.push(id);
    }
    return out;
  }
  // Upgrade a bounded batch through the normal rate-limited queue, so this can
  // never burst. Progress is implicit: each success lands in Grindr's block list
  // and drops out of hidesNeedingUpgrade() on the next reconcile.
  const UPGRADE_BATCH = 25;
  // The drain must never spend the whole hour's budget. It is a background
  // migration of ~1400 old entries; a block you press right now is the thing you
  // are actually waiting on. Without a reserve the drain wins simply by running
  // continuously, and a capture shows exactly that: it exhausted MAX_PER_HOUR and
  // a manual block was told "Hourly cap (500) hit, waiting 48m" — so blocking
  // looked completely broken when it was only queued behind bulk work.
  //
  // Half the hourly budget is kept for interactive use. The drain simply pauses
  // once it has spent its share and resumes next hour as the window rolls.
  // True once the drain has used its own hourly budget, at which point it holds
  // until the window rolls. It reads ONLY the drain's window, so blocks you press
  // yourself neither shorten this nor are shortened by it.
  function drainBudgetSpent() {
    if (!HOURLY_CAPS_ENABLED) return false;
    pruneCallWindows();
    return recentBulkCalls.length >= DRAIN_HOURLY_CAP;
  }
  // ── Session-dead recovery ────────────────────────────────────────────────
  // blockSessionDead latches on a 401/403 so a dead session is not hammered. The
  // flaw was that NOTHING could clear it: clearSessionDeadIfSet() is reached only
  // from the block and unblock success paths, which live inside processQueue —
  // and processQueue breaks out at the top the moment the flag is set. One
  // transient 401 therefore froze the queue permanently. Observed live: a forced
  // reconcile returned {known:3874, promoted:7} against a three-minute-old token,
  // proving the session was fine, while sessionDead stayed true, 27 jobs sat
  // unprocessed, and the drain backlog did not move for hours.
  //
  // Putting the clear inside reconcileBlockTiers does not work either — that
  // function declines to run while the latch is set, so the canary would sit
  // behind the guard it is meant to lift.
  //
  // So this is a standalone probe that deliberately ignores the latch. It is ONE
  // cheap GET (page 1 of the blocks list, not the full paginated walk), it runs
  // only while the session is believed dead, and it is spaced by
  // SESSION_CANARY_INTERVAL_MS so a genuinely dead session sees four requests a
  // minute rather than a burst.
  const SESSION_CANARY_INTERVAL_MS = 15_000;
  let lastSessionCanaryAt = 0;
  let sessionCanaryInFlight = false;
  // One cheap authenticated GET, run only while the session is believed dead, to
  // find out whether it still is. Deliberately ignores blockSessionDead — it is
  // the only thing that can lift it.
  async function sessionCanaryTick() {
    if (!blockSessionDead || SCRIPT_DISABLED) return;
    if (sessionCanaryInFlight) return;
    if (Date.now() - lastSessionCanaryAt < SESSION_CANARY_INTERVAL_MS) return;
    const auth = getCapturedAuth();
    if (!auth) return;                       // nothing to test with yet
    sessionCanaryInFlight = true;
    lastSessionCanaryAt = Date.now();        // stamp the attempt, not the success
    try {
      const res = await origFetch(BLOCK_LIST_URL, {
        method: 'GET', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...auth },
      });
      noteApiCalls(1);
      if (res.status === 401 || res.status === 403) {
        logTrace(`${LOG} session canary: still ${res.status}, staying paused.`);
        return;
      }
      if (!res.ok) return;                   // a 5xx says nothing about auth
      logInfo(`${LOG} session canary succeeded (${res.status}) — resuming the queue.`);
      clearSessionDeadIfSet();
      processQueue().catch((e) => logTrace(`${LOG} processQueue after canary:`, e));
    } catch (e) {
      logTrace(`${LOG} session canary failed:`, e);
    } finally { sessionCanaryInFlight = false; }
  }

  // Auto-drain: keep topping the queue up until every hide has been upgraded.
  //
  // This writes to the account ~1200 times, so it is paced rather than fired: the
  // ordinary block queue already enforces MIN_INTERVAL_MS between calls and a
  // rolling hourly cap, and the drain only ever ADDS to that queue when it has
  // run low. So it cannot burst, it survives a reload (the flag is persisted and
  // the remaining work is recomputed from Grindr's own lists), and stopping it is
  // immediate — the toggle is checked on every tick.
  const DRAIN_STORAGE_KEY = 'grindrMiddleClickDrain_v1';
  const DRAIN_TICK_MS = 1_000;
  const DRAIN_QUEUE_LOW_WATER = 5;    // top up once the queue gets this short
  let autoDrain = false;
  let drainTimer = 0;
  // Start or stop the background hide-to-block drain and persist the choice.
  function setAutoDrain(on) {
    autoDrain = !!on;
    writeJson(DRAIN_STORAGE_KEY, { on: autoDrain }, 'auto-drain');
    logInfo(`${LOG} hide→block auto-drain ${autoDrain ? 'STARTED' : 'stopped'}.`);
    showToast(autoDrain ? 'Auto-drain started — upgrading in the background' : 'Auto-drain stopped', 'ok');
    refreshHud();
    return autoDrain;
  }
  let drainTickRunning = false;
  // One drain step: top the block queue up if it has run low and work remains.
  // Paced by the queue's own limits. Re-entrancy-guarded so a tick awaiting a slow
  // reconcile can't overlap the next.
  async function drainTick() {
    if (drainTickRunning) return;   // a tick awaiting a slow reconcile must not overlap
    if (!autoDrain || SCRIPT_DISABLED) return;
    if (blockQueue.length > DRAIN_QUEUE_LOW_WATER) return;   // still working through the last batch
    if (blockSessionDead) { logWarn(`${LOG} auto-drain paused: session is dead.`); return; }
    if (drainBudgetSpent()) {
      logTrace(`${LOG} auto-drain holding: its share of the hourly budget is spent, leaving the rest for manual blocks.`);
      return;
    }
    if (!getCapturedAuth()) return;
    drainTickRunning = true;
    try {
      // Refresh what Grindr actually holds, so finished work leaves the backlog.
      //
      // The snapshot check MUST come after this, not before it. v0.54.0 put the
      // `serverBlocksKnown` gate at the top of the tick and deadlocked the drain:
      // this line is the only reconcile the drain ever performs, so returning
      // above it meant the snapshot could never arrive and the tick held forever
      // ("auto-drain holding: no snapshot ... waiting for the first reconcile",
      // logged every 15s and never escaped). Forcing the walk when we have no
      // snapshot bootstraps it on the first tick instead of waiting out the
      // 30-minute throttle.
      try { await reconcileBlockTiers(!serverBlocksKnown, true); } catch (_e) {}   // the drain's own bookkeeping, on the drain's budget
      if (!serverBlocksKnown) {
        logWarn(`${LOG} auto-drain holding: could not read Grindr's block list, so every entry would look unupgraded and the drain would re-block the lot. Retrying next tick.`);
        return;
      }
      const left = hidesNeedingUpgrade().length;
      if (!left) {
        logInfo(`${LOG} auto-drain complete — every local entry is a real block.`);
        showToast('Auto-drain complete — all blocks are real blocks', 'ok');
        setAutoDrain(false);
        return;
      }
      upgradeHidesToBlocks(UPGRADE_BATCH);
    } finally { drainTickRunning = false; }
  }
  // Restore the drain flag and start its timer.
  function installAutoDrain() {
    const o = readJson(DRAIN_STORAGE_KEY, null, 'auto-drain');
    autoDrain = !!(o && o.on);
    drainTimer = setInterval(() => {
      drainTick().catch((e) => logTrace(`${LOG} drainTick error:`, e));
      // Independent of autoDrain: a frozen queue must recover whether or not the
      // background drain is switched on.
      sessionCanaryTick().catch((e) => logTrace(`${LOG} sessionCanaryTick error:`, e));
    }, DRAIN_TICK_MS);
    installedIntervals.push(drainTimer);
    if (autoDrain) logInfo(`${LOG} hide→block auto-drain resumed from a previous session.`);
  }

  // Queue up to `limit` hide-only entries for re-issue as real blocks. Returns
  // how many were queued.
  function upgradeHidesToBlocks(limit) {
    const todo = hidesNeedingUpgrade().slice(0, Math.max(1, limit || UPGRADE_BATCH));
    if (!todo.length) { showToast('Nothing to upgrade — every entry is already a real block', 'ok'); return 0; }
    for (const id of todo) enqueueAction(id, 'block', { bulk: true });
    const remaining = Math.max(0, hidesNeedingUpgrade().length - todo.length);
    logInfo(`${LOG} queued ${todo.length} hide→block upgrade(s); ${remaining} remaining.`);
    if (!autoDrain) showToast(`Upgrading ${todo.length} hide(s) to real blocks…`, 'ok');
    refreshHud();
    return todo.length;
  }

  const BLOCK_RECONCILE_INTERVAL_MS = 30 * 60_000;
  const BLOCK_LIST_MAX_PAGES = 20;
  let lastBlockReconcileAt = 0;
  let blockReconcileInFlight = false;

  // Pull every profileId out of a hides/blocks payload. Parsed structurally where
  // possible (the shape is confirmed for /hides) and by whole-number regex as a
  // fallback, so an unknown shape still yields ids rather than nothing.
  function idsFromListPayload(text) {
    const out = new Set();
    let parsed = false;
    try {
      const seen = (v, d) => {
        if (!v || typeof v !== 'object' || d > 4) return;
        if (Array.isArray(v)) { for (const x of v) seen(x, d + 1); return; }
        const pid = v.profileId != null ? String(v.profileId) : '';
        if (isPlausibleProfileId(pid)) out.add(pid);
        for (const k of Object.keys(v)) { const x = v[k]; if (x && typeof x === 'object') seen(x, d + 1); }
      };
      // Accept a parsed value or a JSON string — callers that already have the
      // object (the response observer) shouldn't pay a stringify→parse round-trip
      // of a ~230KB list just to hand it here.
      seen(typeof text === 'string' ? JSON.parse(text) : text, 0);
      parsed = true;
    } catch (_e) {}
    // Regex fallback ONLY for a payload we could not parse (a genuinely unknown
    // shape). A well-formed but EMPTY list must return empty — otherwise a
    // standalone number in the envelope (a totalCount, a timestamp) is mistaken for
    // a profileId, which both defeats reconcile's empty-page pagination break and
    // inflates serverBlockedIds. Require whole-number boundaries and the same
    // plausibility gate the structural walk uses.
    if (!parsed && !out.size && typeof text === 'string') {
      for (const mm of text.matchAll(/(?:^|[^0-9])([0-9]{5,10})(?![0-9])/g)) {
        if (isPlausibleProfileId(mm[1])) out.add(mm[1]);
      }
    }
    return out;
  }

  // One pass over both lists, reconciling every pending block at once.
  async function reconcileBlockTiers(force, bulk) {
    if (blockReconcileInFlight) return null;
    if (!force && Date.now() - lastBlockReconcileAt < BLOCK_RECONCILE_INTERVAL_MS) return null;
    // A dead session can't be reconciled; don't burn the 3s sweep hammering it.
    if (!force && blockSessionDead) return null;
    if (!blockedProfileIds.size) return null;
    const auth = getCapturedAuth();
    if (!auth) { logTrace(`${LOG} reconcileBlockTiers: no auth captured yet`); return null; }
    blockReconcileInFlight = true;
    // Stamp the ATTEMPT, not just a success: otherwise a 401/403 or network error
    // leaves trustworthy=false, the throttle never advances, and the 3s enforcement
    // sweep turns into an unthrottled authed-request loop — the exact burst the
    // queue exists to prevent.
    lastBlockReconcileAt = Date.now();
    try {
      const headers = { 'Content-Type': 'application/json', ...auth };
      const known = new Set();          // hides ∪ blocks: anything Grindr already has
      const blocksOnly = new Set();     // real BLOCKS only, so the HUD can upgrade hides
      let trustworthy = false;
      // /hides is unpaginated (confirmed: 3309 entries in one response).
      // /blocks takes a page param, so walk it until a page returns nothing.
      const urls = [HIDE_LIST_URL];
      for (let page = 1; page <= BLOCK_LIST_MAX_PAGES; page += 1) {
        urls.push(BLOCK_LIST_URL.replace(/page=\d+/, `page=${page}`));
      }
      for (const url of urls) {
        let res;
        try { res = await origFetch(url, { method: 'GET', credentials: 'include', headers }); }
        catch (err) { logTrace(`${LOG} reconcileBlockTiers fetch failed ${url}:`, err); continue; }
        if (res.status === 401 || res.status === 403) { logWarn(`${LOG} reconcileBlockTiers: auth rejected (${res.status})`); break; }
        if (!res.ok) { logWarn(`${LOG} reconcileBlockTiers: ${url} → ${res.status}`); continue; }
        noteApiCalls(1, bulk);
        const pageIds = idsFromListPayload(await res.text());
        for (const id of pageIds) known.add(id);
        const isBlocksPage = url.includes('page=');
        if (isBlocksPage) for (const id of pageIds) blocksOnly.add(id);
        trustworthy = true;
        // A blocks PAGE that returned no ids of its own means we're past the end.
        // (The old test — union size unchanged — broke immediately, because /hides
        // had already put every id in `known`, so blocks pages 2+ were never read
        // and serverBlockedIds only ever held page 1 → the drain never terminated.)
        if (isBlocksPage && pageIds.size === 0) break;
      }
      if (!trustworthy) { logTrace(`${LOG} reconcileBlockTiers: no trustworthy list`); return null; }
      // Real BLOCKS as opposed to mere hides, so the HUD can offer to upgrade the
      // rest. The full paginated walk is authoritative — replace, don't merge. A
      // merge would make a wrong optimistic add permanent: a drain-upgraded hide
      // whose block POST returned 200 but did NOT stick gets optimistically added
      // (verifyBlock also accepts its presence in /hides), and a merge could never
      // drop it — so hidesNeedingUpgrade() would under-report and the drain would
      // announce "complete" and disarm itself with real hides left un-upgraded.
      // The between-reconcile optimistic add still bridges the gap until this
      // 30-minute authoritative walk; a block that genuinely stuck is in the list
      // by then, and one that did not is correctly dropped so the drain retries it.
      serverBlockedIds = blocksOnly;
      serverBlocksKnown = true;
      saveServerBlocks();
      // Anything that actually landed is not stuck after all — forget its history
      // so a transient failure can never retire a profile permanently.
      // Judge every upgrade that has completed a POST since the last walk.
      let cleared = 0;
      let charged = 0;
      for (const id of awaitingUpgradeCheck) {
        if (serverBlockedIds.has(id)) { upgradeAttempts.delete(id); cleared += 1; }
        else { upgradeAttempts.set(id, (upgradeAttempts.get(id) || 0) + 1); charged += 1; }
      }
      awaitingUpgradeCheck.clear();
      // One that landed later is not stuck after all, so a transient failure can
      // never retire a profile permanently.
      for (const id of [...upgradeAttempts.keys()]) {
        if (serverBlockedIds.has(id)) { upgradeAttempts.delete(id); cleared += 1; }
      }
      if (cleared || charged) saveUpgradeAttempts();
      const stuck = stuckUpgradeIds().length;
      if (stuck) {
        logWarn(`${LOG} ${stuck} entr${stuck === 1 ? 'y' : 'ies'} will not convert to a real block after ${MAX_UPGRADE_ATTEMPTS} attempts `
          + '(Grindr answers 200 but never lists them — hidden profiles, or deleted accounts). '
          + 'They stay blocked locally and are excluded from the backlog. __grindrBlock_stuckBlocks() lists them.');
      }
      // A walk that Grindr answered proves auth is alive. (This alone is NOT
      // enough to recover — see sessionCanaryTick: reconcile itself declines to
      // run while the latch is set, so it can only confirm recovery, never cause
      // it.)
      clearSessionDeadIfSet();
      logInfo(`${LOG} Grindr holds ${serverBlockedIds.size} real block(s); ${hidesNeedingUpgrade().length} of our entries are hides that could be upgraded.`);
      let promoted = 0;
      let demoted = 0;
      for (const id of blockedProfileIds) {
        const onServer = known.has(id);
        if (onServer && !blockConfirmedIds.has(id)) { blockConfirmedIds.add(id); promoted += 1; }
        else if (!onServer && blockConfirmedIds.delete(id)) { demoted += 1; blockLandedAt.set(id, Date.now()); }
      }
      if (promoted || demoted) saveConfirmedBlocks();
      logInfo(`${LOG} block tiers reconciled against Grindr's own lists: ${known.size} known server-side, +${promoted} confirmed, -${demoted} demoted, ${pendingBlockIds().length} still pending.`);
      if (demoted) scheduleEnforce();
      return { known: known.size, promoted, demoted, pending: pendingBlockIds().length };
    } finally {
      blockReconcileInFlight = false;
    }
  }

  // ── Profiles that will not take a block ─────────────────────────────────
  // Some entries can be POSTed forever and never appear in /api/v4/blocks. The
  // API answers 200 {"updateTime":0} and nothing changes. Measured live: a local
  // list of 1496 against 1656 real blocks left 391 that would not convert —
  // 156 of them present in Grindr's HIDES list (hide and block are mutually
  // exclusive, so blocking a hidden profile is a no-op) and 235 in neither list
  // at all (almost certainly deleted or banned accounts).
  //
  // Because upgradeHidesToBlocks takes hidesNeedingUpgrade().slice(0, BATCH), it
  // took the SAME first 25 every cycle: the optimistic add counted the backlog
  // down, the next authoritative walk restored it, and the drain ran forever
  // without converting anything. Observed exactly that: 391 -> upgrade -> 391,
  // promoted 0.
  //
  // So count attempts, and retire an id after MAX_UPGRADE_ATTEMPTS. A retired id
  // stays blocked LOCALLY — the card is still hidden and the sweep still enforces
  // it — it is only excluded from the hide-to-block backlog, because that backlog
  // is meant to be work that can actually be finished.
  const UPGRADE_ATTEMPTS_STORAGE_KEY = 'grindrMiddleClickUpgradeAttempts_v1';
  // One is enough. The evidence is not marginal — a profile that will not convert
  // answers 200 {"updateTime":0} and never lists, on every cycle, forever. Three
  // attempts meant 3x391 = ~1200 doomed writes before the backlog settled. A
  // retirement is cheap to undo (__grindrBlock_stuckBlocks(true)) and cannot lose
  // anything, because a retired profile stays blocked locally; and one that lands
  // late has its counter cleared by the walk that sees it.
  const MAX_UPGRADE_ATTEMPTS = 1;
  let upgradeAttempts = new Map();
  // Ids whose upgrade POST has completed and is awaiting judgement by the next
  // authoritative walk. An "attempt" is one round-trip Grindr accepted that the
  // walk then failed to reflect — NOT one call to enqueueAction, which dedups and
  // would otherwise charge a job an attempt on every drain tick while it merely
  // sat in the queue. That retired everything within three seconds.
  const awaitingUpgradeCheck = new Set();
  // Restore the per-profile upgrade attempt counts.
  function loadUpgradeAttempts() {
    try {
      const o = readJson(UPGRADE_ATTEMPTS_STORAGE_KEY, null, 'upgrade-attempts');
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (isPlausibleProfileId(String(k)) && Number.isFinite(v)) upgradeAttempts.set(String(k), Number(v));
        }
      }
    } catch (e) { logWarn(`${LOG} loadUpgradeAttempts failed:`, e); }
  }
  // Persist them.
  function saveUpgradeAttempts() {
    return writeJson(UPGRADE_ATTEMPTS_STORAGE_KEY, Object.fromEntries(upgradeAttempts), 'upgrade-attempts');
  }
  // True once a profile has refused enough block attempts to be considered
  // unconvertible. Not a judgement about the profile — only about this endpoint.
  function isUnupgradeable(id) {
    return (upgradeAttempts.get(String(id)) || 0) >= MAX_UPGRADE_ATTEMPTS;
  }
  // Ids retired from the backlog, for the HUD and the console.
  function stuckUpgradeIds() {
    const out = [];
    for (const id of blockedProfileIds) if (!serverBlockedIds.has(id) && isUnupgradeable(id)) out.push(id);
    return out;
  }

  // Ids the sweep still has to look for. Everything else is Grindr's problem now.
  function pendingBlockIds() {
    const out = [];
    for (const id of blockedProfileIds) if (!blockConfirmedIds.has(id)) out.push(id);
    return out;
  }
  // A block POST came back 2xx — start its quiet clock.
  function noteBlockLanded(profileId) {
    const id = String(profileId || '');
    if (!id) return;
    blockLandedAt.set(id, Date.now());
    if (blockConfirmedIds.delete(id)) saveConfirmedBlocks();
  }
  // Grindr sent us this profile again. If we thought the block had propagated,
  // it hasn't (or it was reversed) — put it back under active enforcement.
  // True only while we are walking a hides/blocks LIST response. Appearing in
  // one of those lists means the block LANDED — the exact opposite of appearing
  // in a cascade — so demotion must not fire for it.
  let indexingListResponse = false;
  // Grindr sent us this profile, so any confirmed block on it has not
  // propagated. Demote it back to pending. Ignored while walking a hides/blocks
  // list.
  function noteProfileSeenInPayload(profileId) {
    // THE BUG THIS GUARD FIXES: Grindr fetches /api/v1/hides on every page load,
    // the response observer walked it, and indexProfileFromPayload called this
    // once per entry — so all 3309 hidden profiles looked like they had
    // "reappeared", and every confirmed block was demoted back to PENDING on
    // every single load. A diagnostic capture shows exactly that: two
    // list fetches at +0.69s followed by a flood of
    // "reappeared in a payload — demoting to PENDING".
    if (indexingListResponse) return;
    const id = String(profileId || '');
    if (!id || !blockedProfileIds.has(id)) return;
    blockLandedAt.set(id, Date.now());          // restart the quiet clock
    if (blockConfirmedIds.delete(id)) {
      saveConfirmedBlocks();
      logInfo(`${LOG} ${id} reappeared in a payload — demoting to PENDING and enforcing again.`);
      scheduleEnforce();
    }
  }
  // Promote anything that has been quiet long enough. Called from the sweep,
  // where it replaces a great deal of scanning with a few Map lookups.
  function promoteQuietBlocks() {
    // Ask Grindr first — reconcileBlockTiers self-throttles, so this is a cheap
    // no-op most sweeps. The quiet-period promotion below only ever fires when
    // the authoritative list could not be reached.
    reconcileBlockTiers(false).catch((e) => logTrace(`${LOG} reconcileBlockTiers error:`, e));
    const now = Date.now();
    let promoted = 0;
    for (const id of blockedProfileIds) {
      if (blockConfirmedIds.has(id)) continue;
      const landed = blockLandedAt.get(id);
      if (!landed || now - landed < BLOCK_CONFIRM_QUIET_MS) continue;
      blockConfirmedIds.add(id);
      promoted += 1;
    }
    if (promoted) {
      saveConfirmedBlocks();
      logInfo(`${LOG} ${promoted} block(s) confirmed server-side — no longer scanned for (${pendingBlockIds().length} still pending).`);
    }
    return promoted;
  }

  const BLOCKLIST_STORAGE_KEY = 'grindrMiddleClickBlockList_v1';
  const blockedProfileIds = new Set();
  // Per-profile timestamp of the last auto re-block, so a noisy/virtualised grid
  // can't spam Grindr's API toward the very forced-logout the queue guards against.
  const lastReblockAt = new Map();
  // Re-block a reappearing profile at most once per this interval; debounce DOM
  // sweeps to one pass per quiet window; and run a periodic backstop sweep.
  const REBLOCK_MIN_INTERVAL_MS = 60_000;
  const ENFORCE_DEBOUNCE_MS = 300;
  const BLOCKLIST_SWEEP_MS = 3000;
  // Restore the persistent local block list.
  function loadBlockList() {
    try {
      const raw = localStorage.getItem(BLOCKLIST_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) for (const id of arr) { if (id != null) blockedProfileIds.add(String(id)); }
    } catch (e) { logWarn(`${LOG} loadBlockList failed:`, e); }
  }
  // Persist the local block list.
  function saveBlockList() { return writeJson(BLOCKLIST_STORAGE_KEY, [...blockedProfileIds], 'saveBlockList'); }
  // Record a profile as blocked locally. Returns true if newly added.
  function addToLocalBlockList(profileId) {
    const id = String(profileId || '');
    if (!id || blockedProfileIds.has(id)) return false;
    blockedProfileIds.add(id);
    // Honour the persist result: on a QuotaExceededError the in-memory Set and
    // localStorage diverge, and the id vanishes on reload while the user was told
    // "Blocked". Surface it rather than swallowing writeJson's landed-boolean.
    const persisted = saveBlockList();
    if (!persisted) logWarn(`${LOG} block list + ${id}: in-memory only — storage write failed (won't survive reload).`);
    else logTrace(`${LOG} block list + ${id} (${blockedProfileIds.size} total)`);
    return persisted;
  }
  // Drop a profile from every local block structure.
  function removeFromLocalBlockList(profileId) {
    const id = String(profileId || '');
    if (!blockedProfileIds.delete(id)) return false;
    lastReblockAt.delete(id);
    blockLandedAt.delete(id);
    if (blockConfirmedIds.delete(id)) saveConfirmedBlocks();
    saveBlockList();
    logTrace(`${LOG} block list - ${id} (${blockedProfileIds.size} total)`);
    return true;
  }
  loadKeyOverrides();
  loadBlockList();
  loadConfirmedBlocks();
  loadServerBlocks();
  loadUpgradeAttempts();
  loadHiddenList();
  pruneHiddenList();

  // ── Kill switch + overlay safe-mode ────────────────────────────────────────
  // Two separate ideas, both about staying out of Grindr's way:
  //
  // 1. SCRIPT_DISABLED / __grindrBlock_disable() — a hard off switch. It flips
  //    every listener of ours into a no-op, disconnects our observers, stops our
  //    timers, and puts the patched globals (fetch, XHR, WebSocket.send,
  //    sendBeacon, setTimeout, the storage clear() guards) back to the originals.
  //    This exists to make "is the userscript causing this?" a ten-second
  //    question instead of an argument: run __grindrBlock_disable() in the
  //    console, reproduce the misbehaviour, and you know. Re-enabling flips the
  //    listeners back on; the global patches are NOT re-applied (re-wrapping them
  //    mid-session is riskier than losing passive sniffing until reload).
  //
  // 2. grindrOverlayOpen() — while Grindr has a modal/drawer/picker on screen
  //    (the Media/album picker being the one that matters), our DOM-mutating and
  //    event-synthesising background work stands down: no enforcement sweeps
  //    hiding cards, no synthetic keep-alive mousemove. Those are the only two
  //    things this script does spontaneously to a page it doesn't own, and an
  //    open picker is exactly when an unexpected hide or a stray pointer event
  //    can dismiss what you were doing.
  let SCRIPT_DISABLED = false;
  const installedObservers = [];
  const installedIntervals = [];
  // Originals, captured where they're patched so the kill switch can restore
  // them. Null means "never patched" (frozen intrinsics) — nothing to undo.
  let origWsSendRef = null;
  let origWsAddRef = null;
  let origWsRemoveRef = null;
  const wsListenerMap = new WeakMap();   // original listener -> our wrapper
  let origSendBeaconRef = null;
  let origSetTimeoutRef = null;
  const origStorageClears = [];   // [{ store, clear }]

  const GRINDR_OVERLAY_SELECTOR = [
    '[role="dialog"]', '[aria-modal="true"]',
    // Anchored to real overlay semantics. The former [class*="sheet" i] /
    // [class*="picker" i] substring matches are the same space-separated
    // class-bag anti-pattern v0.28 removed from the pager: ONE permanently
    // mounted element whose class list merely contains "sheet" made
    // grindrOverlayOpen() true forever, which silently disabled the enforcement
    // sweep and the keep-alive heartbeat with no log line.
    '[role="dialog"]', '[aria-modal="true"]',
    '[class~="modal"]', '[class~="drawer"]', '[class~="picker"]', '[class~="popover"]',
  ].join(', ');
  // Throttled: this is consulted from timers and observer callbacks, and a
  // querySelectorAll on every one of those would be wasteful. 250ms is far below
  // human interaction speed and far above our own callback rate.
  const OVERLAY_CHECK_THROTTLE_MS = 250;
  let overlayCheckedAt = 0;
  let overlayCheckedVal = false;
  // True when a Grindr modal/drawer/picker is up. Throttled; the sweep and
  // keep-alive stand down while it is.
  function grindrOverlayOpen() {
    const now = Date.now();
    if (now - overlayCheckedAt < OVERLAY_CHECK_THROTTLE_MS) return overlayCheckedVal;
    overlayCheckedAt = now;
    try {
      overlayCheckedVal = Array.from(document.querySelectorAll(GRINDR_OVERLAY_SELECTOR))
        .some((el) => !isOwnGreetUi(el) && isVisibleEl(el));
    } catch (_e) { overlayCheckedVal = false; }
    return overlayCheckedVal;
  }

  // ── Auth capture ──────────────────────────────────────────────────────────
  // Grindr's web app rotates tokens fairly often; rather than scraping
  // localStorage (fragile), we sniff outbound API calls and grab whatever
  // Authorization / X-Auth-Token / X-Grindr-* headers it's currently using.
  //
  // Captured map structure: { headers: {...}, capturedAt: number }
  let capturedAuth = null;

  // Extract auth-bearing headers from whatever shape a fetch/XHR call passed
  // them in and, if any matched, stash them as the current credentials.
  // `headers` can arrive as a Headers instance, an array of [k,v] pairs, or a
  // plain object — all three are handled. We keep only the small allow-list of
  // header names Grindr actually authenticates with (Authorization, the
  // X-Auth-Token / X-Api-Key / X-Csrf-Token / X-Session-Id family, and anything
  // X-Grindr-*) so we don't hoard irrelevant headers. Original key casing is
  // preserved so replayed requests match the app's exactly.
  function captureFromHeaders(headers) {
    logTrace(`${LOG} captureFromHeaders`);
    if (!headers) return;
    const out = {};
    const consider = (key, value) => {
      if (!key || !value) return;
      const lk = String(key).toLowerCase();
      // authorization (Grindr3 <JWT>) + the X-* auth family AND the request-context
      // headers Grindr's API gateway REQUIRES on every authed call: country-code and
      // l-locale. Replaying a block WITHOUT these returned 501 Not Implemented even
      // though the endpoint was right — confirmed by diffing our failing request
      // against the app's working one in a HAR. accept-language is grabbed too (cheap
      // and the app sends it). These are interpolated into a request, not a selector,
      // so no injection surface.
      if (lk === 'authorization' || lk === 'x-auth-token' || lk === 'x-api-key' ||
          lk === 'x-csrf-token' || lk === 'x-session-id' ||
          lk === 'country-code' || lk === 'l-locale' || lk === 'accept-language' ||
          lk.startsWith('x-grindr')) {
        out[key] = String(value);
      }
    };
    if (headers instanceof Headers) {
      headers.forEach((v, k) => consider(k, v));
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) consider(k, v);
    } else if (typeof headers === 'object') {
      for (const k of Object.keys(headers)) consider(k, headers[k]);
    }
    if (Object.keys(out).length) {
      // MERGE, don't replace: different requests carry different subsets (one may
      // have authorization, another country-code). Merging accumulates the full
      // required set; a present key always wins so a rotated token still refreshes.
      //
      // capturedAt may only be bumped by a CREDENTIAL header. The XHR patch calls
      // this once per header, so a lone accept-language on any grindr.com request
      // used to restamp the clock while Authorization stayed whatever it was —
      // and since getCapturedAuth expires purely on capturedAt, a rotated-out
      // token was replayed forever. The queue then 401s, blockSessionDead latches,
      // blocks silently stop, and __grindrBlock_state() still says authCaptured:true.
      const CREDENTIAL_KEYS = ['authorization', 'x-auth-token', 'x-api-key', 'x-csrf-token', 'x-session-id'];
      const sawCredential = Object.keys(out).some((k) => CREDENTIAL_KEYS.includes(String(k).toLowerCase()));
      capturedAuth = {
        headers: { ...(capturedAuth && capturedAuth.headers), ...out },
        capturedAt: sawCredential ? Date.now() : ((capturedAuth && capturedAuth.capturedAt) || Date.now()),
      };
    }
  }

  // Return the current auth headers, or null if none captured yet or the last
  // capture has gone stale (older than AUTH_TTL_MS). Expiry is destructive: a
  // stale entry is cleared here so callers can't accidentally replay it, which
  // forces a wait for a fresh request to donate new headers (see processQueue's
  // no-auth poll). Returns the raw headers object, not the wrapper.
  function getCapturedAuth() {
    logTrace(`${LOG} getCapturedAuth`);
    if (!capturedAuth) return null;
    if (Date.now() - capturedAuth.capturedAt > AUTH_TTL_MS) {
      capturedAuth = null;
      return null;
    }
    return capturedAuth.headers;
  }

  // ── photoHash → profileId index ───────────────────────────────────────────
  // The cascade grid doesn't put profile IDs on the cells. But every profile
  // payload from Grindr's API includes the profileId + one or more photo
  // hashes, and the cell's <img> src embeds that same hash. So if we sniff
  // every JSON response for {profileId, photoHash/mediaHash/...} pairs, we
  // can map a clicked photo back to its profile.
  const photoHashToProfileId = new Map();
  const PHOTO_HASH_MAP_MAX = 10_000;
  // One definition of "a profile photo on screen". Was duplicated at four sites.
  const PROFILE_PHOTO_SELECTOR = 'img[src*="grindr.com/images/profile"], img[src*="cdns.grindr.com"], img[src*=".cloudfront.net/profile"]';
  // Reverse index: profileId → Set<hash>. Kept in sync with photoHashToProfileId
  // by cappedHashSet so removeBlockedCardFromDom / restoreBlockedCardInDom can
  // find a profile's hashes in O(1) instead of scanning the whole forward map.
  const profileIdToHashes = new Map();

  // Insert a hash→profileId pair with a simple LRU-ish cap. A Map iterates its
  // keys in insertion order, so `keys().next()` is always the oldest entry —
  // deleting it once we exceed PHOTO_HASH_MAP_MAX bounds memory on a long
  // browsing session without any bookkeeping. (Re-setting an existing key does
  // NOT refresh its position, so this is "oldest-inserted" rather than true LRU,
  // which is fine here — hashes are effectively immutable per profile photo.)
  function cappedHashSet(hash, pid) {
    // If this hash was previously mapped to a different profile, detach it from
    // that profile's reverse-index set before re-pointing it.
    const prevPid = photoHashToProfileId.get(hash);
    if (prevPid !== undefined && prevPid !== pid) {
      const prevSet = profileIdToHashes.get(prevPid);
      if (prevSet) { prevSet.delete(hash); if (!prevSet.size) profileIdToHashes.delete(prevPid); }
    }
    photoHashToProfileId.set(hash, pid);
    let set = profileIdToHashes.get(pid);
    if (!set) { set = new Set(); profileIdToHashes.set(pid, set); }
    set.add(hash);
    if (photoHashToProfileId.size > PHOTO_HASH_MAP_MAX) {
      const oldest = photoHashToProfileId.keys().next();
      if (!oldest.done) {
        const evHash = oldest.value;
        const evPid = photoHashToProfileId.get(evHash);
        photoHashToProfileId.delete(evHash);
        const evSet = profileIdToHashes.get(evPid);
        if (evSet) { evSet.delete(evHash); if (!evSet.size) profileIdToHashes.delete(evPid); }
      }
    }
  }

  // Pull a profileId and any associated photo hashes out of one object and
  // index them. Grindr's API is inconsistent across endpoints, so the same
  // fields appear under many names — hence the long fallback chains. The string
  // guards ('undefined'/'null'/'') reject values that were missing but got
  // String()-coerced into those literals; the `length > 10` check skips short
  // junk that isn't a real media hash. Only numeric profileIds are accepted.
  // Accept only values that look like a real media hash before indexing them.
  // Two jobs in one guard: (1) reject the missing-but-String()-coerced literals
  // ('undefined'/'null'/'') and short junk — the original intent; (2) SECURITY —
  // these values are later interpolated into a CSS selector
  // (`img[src*="${hash}"]`, see findCardsForProfile), so restrict the charset to
  // hash-safe characters. That keeps a malicious/garbage API field (which can
  // contain `"` `]` `\\`) from injecting into or breaking that selector. Grindr
  // media hashes are long hex-ish tokens, so this is not a real restriction on
  // genuine data; the length floor also rejects 'undefined' (9) and 'null' (4).
  const isUsableHash = (h) => typeof h === 'string' && h.length >= 10 && /^[A-Za-z0-9._-]+$/.test(h);

  // Index one profile object from Grindr's traffic: photo hashes, text filter,
  // block-tier demotion.
  function indexProfileFromPayload(obj) {
    if (!obj || typeof obj !== 'object') return;
    const pid = String(obj.profileId || obj.profileID || '');
    // Must clear the SAME bar every other id crosses. `/^\d+$/` has no length
    // bound, so a 20-digit tracking token in a payload became a doomed
    // POST /api/v1/me/hides/<junk> and a permanent poisoned block-list entry —
    // the documented cause of "hide only sometimes works".
    if (!isPlausibleProfileId(pid)) return;
    // Traced only once a real profile is found (not for every object walked),
    // so trace stays readable even while indexing a large payload.
    logTrace(`${LOG} indexProfileFromPayload(${pid})`);
    // Free demotion signal — see the two-tier block list note. Grindr telling us
    // about a profile we blocked is proof the block has not propagated yet.
    noteProfileSeenInPayload(pid);

    const single = String(
      obj.photoHash || obj.profileImageMediaHash || obj.mediahash || obj.primaryPhotoHash || ''
    );
    if (isUsableHash(single)) cappedHashSet(single, pid);

    // The cascade (GET /api/v4/cascade/) and profile payloads don't expose a bare
    // hash field — the hash is the LAST PATH SEGMENT of an image URL, e.g.
    //   "primaryImageUrl":"https://cdns.grindr.com/images/profile/480x480/<HASH>"
    // The clicked tile's <img src> ends in that same <HASH> (see resolver strategy
    // 4), so pulling it here is what lets a grid click map back to the REAL
    // profileId instead of falling through to the attribute-scan (which grabbed
    // wrong ids like 600000012 — a profile NOT even in the cascade). Without this,
    // grid tiles were never indexed and the photo-hash strategy always missed.
    for (const u of [obj.primaryImageUrl, obj.imageUrl, obj.profileImageUrl, obj.primaryPhotoUrl, obj.thumbUrl]) {
      const s = String(u || '');
      if (!s) continue;
      const m = s.split(/[?#]/)[0].match(/\/([A-Za-z0-9._-]{16,})$/);  // trailing hash segment
      if (m && isUsableHash(m[1])) cappedHashSet(m[1], pid);
    }

    if (Array.isArray(obj.photoMediaHashes)) {
      for (const h of obj.photoMediaHashes) {
        if (isUsableHash(h)) cappedHashSet(h, pid);
      }
    }
    if (Array.isArray(obj.medias)) {
      for (const m of obj.medias) {
        const mh = String((m && m.mediaHash) || '');
        if (isUsableHash(mh)) cappedHashSet(mh, pid);
      }
    }
    // If this profile is on the persistent local block list, the app just
    // re-fetched it (refresh/scroll) — schedule a sweep to re-hide it and, if it
    // rendered visibly again, re-submit the block.
    if (blockedProfileIds.has(pid)) scheduleEnforce();
    // Auto-hide/auto-block by configurable profile text (TEXT_FILTER_* up top).
    // Wrapped so a malformed field can never break the rest of the payload walk.
    try { maybeAutoFilterByText(pid, obj); } catch (e) { logTrace(`${LOG} maybeAutoFilterByText error:`, e); }
  }

  // Recursively walk an arbitrary JSON response, indexing every profile object
  // it contains. Bounded deliberately so sniffing never janks the page: depth is
  // capped at 5 (profile objects live near the top of Grindr's payloads) and
  // arrays are sampled to their first ARRAY_SAMPLE_CAP items. The old cap of 50
  // was WRONG — a real cascade page (GET /api/v4/cascade/) returns ~600 tiles in
  // one batch (confirmed in a HAR), so 50 left ~90% of the grid unindexed and the
  // photo-hash resolver missed most tiles. Raised to 2000: still bounds a
  // pathological payload, but covers a full cascade so every visible tile is
  // indexed. These limits trade a little completeness for a guarantee that a
  // payload can't blow the stack or stall the main thread.
  const ARRAY_SAMPLE_CAP = 2000;
  // Recursively index a JSON payload. Bounded by depth and ARRAY_SAMPLE_CAP.
  function walkAndIndex(value, depth) {
    if (!value || typeof value !== 'object' || depth > 5) return;
    // Trace the top-level entry only — this function recurses across every node
    // of a payload, so logging each call would flood (and jank) at trace level.
    if (depth === 0) logTrace(`${LOG} walkAndIndex(payload)`);
    if (Array.isArray(value)) {
      value.slice(0, ARRAY_SAMPLE_CAP).forEach(item => walkAndIndex(item, depth + 1));
      return;
    }
    indexProfileFromPayload(value);
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (v && typeof v === 'object') walkAndIndex(v, depth + 1);
    }
  }

  // ── "They messaged me" → unhide ────────────────────────────────────────────
  // A hidden profile is un-hidden the moment they message you. The message shape
  // is confirmed from a HAR of a real conversation fetch:
  //     { "messageId": "<ts>:<uuid>", "conversationId": "<a>:<b>",
  //       "senderId": 600000000, "timestamp": 1787516964641,
  //       "type": "Text", "body": { "text": "…" } }
  // So the test is: an object carrying a plausible senderId and a timestamp, sent
  // by someone who is not you, newer than when you hid them.
  //
  // Two guards matter here. Skipping senderId === your own id stops YOUR messages
  // in a thread from unhiding the person you just hid. Requiring
  // timestamp > hiddenAt stops old history from doing it — opening a conversation
  // replays messages you already had, and without the comparison, simply reading
  // an old thread would resurface everyone in it.
  //
  // This is a separate walk from walkAndIndex rather than a hook inside it: that
  // walker exists to index profiles and is bounded by ARRAY_SAMPLE_CAP and a
  // depth limit tuned for cascade payloads, and quietly missing a message because
  // it fell outside those caps would look exactly like the feature not working.
  const MESSAGE_SCAN_MAX_DEPTH = 6;
  const MESSAGE_SCAN_ARRAY_CAP = 5000;
  // Shared gate for every "they engaged with me" signal.
  function unhideForEngagement(profileId, ts, why) {
    try {
      if (!UNHIDE_ON_MESSAGE || !hiddenProfileIds.size) return;
      const who = String(profileId != null ? profileId : '');
      if (!isPlausibleProfileId(who)) return;
      if (albumState.myProfileId && who === albumState.myProfileId) return;
      if (!hiddenProfileIds.has(who)) return;
      const hiddenAt = Number(hiddenProfileIds.get(who) || 0);
      // A signal with no usable timestamp is treated as current: the app only
      // hands us events it is actively rendering, so this errs toward showing
      // someone who reached out rather than silently keeping them buried.
      if (ts && hiddenAt && ts <= hiddenAt) return;
      unhideProfile(who, why);
      showToast(`Unhid ${who} — ${why}`, 'ok');
      scheduleEnforce();
    } catch (e) { logWarn(`${LOG} unhideForEngagement(${profileId}) failed:`, e); }
  }
  // Treat a message object as engagement from its sender.
  function noteIncomingMessage(obj) {
    unhideForEngagement(obj.senderId, Number(obj.timestamp || 0), 'they messaged you');
  }

  // Reactions count as reaching out, but they are NOT timestamped. The HAR shows
  // them as a bare array hanging off the message they apply to:
  //     "reactions": [ { "profileId": 500000000, "reactionType": 1 } ]
  // — who reacted, and nothing about when. That missing timestamp is the whole
  // problem, because the timestamp is what stops old history from resurfacing
  // everyone in it. A reaction added today can sit on a message from last year,
  // so the parent message's timestamp is not a usable stand-in either: trusting
  // it would miss today's reaction, and ignoring it would unhide half your list
  // the moment you scrolled an old thread.
  //
  // So the two cases are split by HOW the reaction reached us, which is a
  // reliable proxy for when it happened:
  //   • Arriving live on a WebSocket frame → it is happening now. Unhide.
  //   • Sitting in a fetched conversation history → undatable. Only honoured if
  //     the message it is attached to is itself newer than the hide, which is
  //     the same rule messages already follow.
  function noteReactions(msg, live) {
    try {
      if (!UNHIDE_ON_MESSAGE || !hiddenProfileIds.size) return;
      const list = msg && msg.reactions;
      if (!Array.isArray(list) || !list.length) return;
      // Live: treat as now (ts 0 → the gate's "no usable timestamp" path).
      // Historical: borrow the parent message's timestamp — and if the carrier has
      // none, DROP the reaction entirely. noteIncomingMessages calls this for any
      // object holding a `reactions` array, not only for real messages, so a
      // wrapper or summary node with no timestamp would otherwise reach the gate
      // with ts = 0, skip the `ts <= hiddenAt` comparison, and unhide every
      // reactor on it. Scrolling one old thread could then empty the hide list —
      // exactly what the timestamp rule exists to prevent.
      const ts = live ? 0 : Number(msg.timestamp || 0);
      if (!live && !ts) return;
      for (const r of list) {
        if (!r || typeof r !== 'object') continue;
        unhideForEngagement(r.profileId, ts, 'they reacted to your message');
      }
    } catch (_e) {}
  }

  // Recursively scan a payload for messages and reactions that should unhide
  // someone. `live` marks a WebSocket frame.
  function noteIncomingMessages(value, depth, live) {
    if (!UNHIDE_ON_MESSAGE || !hiddenProfileIds.size) return;
    if (!value || typeof value !== 'object' || (depth || 0) > MESSAGE_SCAN_MAX_DEPTH) return;
    if (Array.isArray(value)) {
      // Bounded like walkAndIndex, just far wider — a conversation history page is
      // the legitimate big case and must not be truncated, but an unbounded walk
      // of untrusted payloads on the main thread is not acceptable either.
      const cap = Math.min(value.length, MESSAGE_SCAN_ARRAY_CAP);
      for (let i = 0; i < cap; i += 1) noteIncomingMessages(value[i], (depth || 0) + 1, live);
      return;
    }
    if (value.senderId != null) noteIncomingMessage(value);
    if (Array.isArray(value.reactions)) noteReactions(value, live);
    // A live frame may carry a reaction on its own rather than nested on a
    // message — {profileId, reactionType} with no senderId anywhere. Only
    // honoured live, where "it is happening now" is what makes it datable.
    if (live && value.reactionType != null && value.profileId != null && !Array.isArray(value.reactions)) {
      unhideForEngagement(value.profileId, 0, 'they reacted to your message');
    }
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (v && typeof v === 'object') noteIncomingMessages(v, (depth || 0) + 1, live);
    }
  }
  // Live arrivals come over the WebSocket, not fetch, so a message that lands
  // while you sit on the grid would otherwise wait for the next refetch. Parse
  // only strings that already look like they mention a sender, and never let a
  // parse failure reach the app's own listener.
  function noteIncomingMessageFrame(data) {
    try {
      if (!UNHIDE_ON_MESSAGE || !hiddenProfileIds.size) return;
      // Reaction frames need not mention senderId at all, so the cheap
      // pre-filter accepts either marker before paying for a JSON.parse.
      if (typeof data !== 'string') return;
      if (!data.includes('senderId') && !data.includes('reaction')) return;
      noteIncomingMessages(JSON.parse(data), 0, true);
    } catch (_e) {}
  }

  // ── Fetch patch — capture auth + index responses ──────────────────────────
  // Installed at document-start so it sees every Grindr API call from the
  // moment the SPA boots. Two hard rules make this safe to wrap around the
  // app's own networking: (1) it stays fully transparent — it always awaits and
  // returns the real response untouched, and only ever reads a CLONE of the
  // body so Grindr can still consume the original; (2) every observation is in
  // a try/catch that swallows errors, so a parsing hiccup can never break a
  // request the app depends on. `origFetch` is also the handle the block/unblock
  // calls use, so our own API traffic bypasses this patch (no self-indexing).
  // ── Block-endpoint discovery ───────────────────────────────────────────────
  // The hardcoded hide/block endpoints used below (/api/v1/me/hides,
  // /api/v3/me/blocks) once returned 501 on web.grindr.com — NOT because Grindr
  // moved them, but because the required country-code / l-locale headers weren't
  // being replayed (see attemptHideOrBlock, which fixed it). The sniffer below is
  // kept as a discovery tool in case the path really does move. We can't guess
  // the new path, so we OBSERVE it: every grindr.com request the APP ITSELF makes
  // whose path looks like a block/hide/report/mute action is recorded (method +
  // URL + body) and logged at warn. Block ONE person through Grindr's normal UI,
  // then run __grindrBlock_seenActions() to read the real request and wire it into
  // attemptHideOrBlock / verifyBlock. Our own replayed calls use origFetch and
  // bypass this patched fetch, so they're never captured here (no self-pollution
  // from the 501s we generate). Match a path SEGMENT so '/me/blocks' matches but
  // an unrelated url that merely contains 'unblockable' does not.
  const BLOCK_ACTION_URL_RE = /(?:^|\/)(blocks?|hides?|reports?|mute|ban)(?:\/|\?|#|$)/i;
  const seenBlockActions = [];           // ring buffer of {method,url,body,at}
  // Record a block/hide-shaped request Grindr itself made, for endpoint
  // discovery.
  function notePossibleBlockAction(method, url, body) {
    try {
      const u = String(url || '');
      if (!isGrindrUrl(u) || !BLOCK_ACTION_URL_RE.test(u)) return;
      const m = String(method || 'GET').toUpperCase();
      const bodyStr = SENSITIVE_URL_RE.test(u) ? '(redacted: credential endpoint)'
        : (typeof body === 'string') ? scrubSecrets(body.slice(0, 500)) : '';
      seenBlockActions.push({ method: m, url: u, body: bodyStr, at: Date.now() });
      if (seenBlockActions.length > 50) seenBlockActions.shift();
      // warn-level so it surfaces without trace verbosity — this is the line that
      // reveals Grindr's real block endpoint when you block via the app's own UI.
      logWarn(`${LOG} [endpoint-sniff] ${m} ${u}${bodyStr ? ` body=${bodyStr}` : ''}`);
    } catch {}
  }

  // Broad capture window. notePossibleBlockAction only sees fetch paths containing
  // a block-ish keyword on grindr.com, so it MISSES a block sent over a channel we
  // weren't watching — which is exactly what happened: a native block produced no
  // visible fetch/XHR at all, so it's going over the WebSocket, sendBeacon, a
  // service worker, or a non-grindr.com host. When __grindrBlock_captureWrites(ms)
  // is armed, this records + console-logs EVERY mutating request across fetch, XHR,
  // sendBeacon AND WebSocket frames, on ANY host whose name contains 'grindr'
  // (so grindr.mobi etc. count), with its body — so clicking Grindr's OWN Block
  // reveals the real request wherever it goes. console.log so it shows at any
  // verbosity. Records into the same seenBlockActions buffer.
  let captureWritesUntil = 0;
  let captureIncludeBodies = false;   // opt-in: print WS frame bodies verbatim
  const MUTATING_METHOD_RE = /^(POST|PUT|PATCH|DELETE|BEACON)$/i;
  const GRINDR_HOST_RE = /grindr/i;
  // Real hostname test. `String.includes('grindr.com')` is satisfied by
  // https://evil.example/?ref=grindr.com, which was enough to get an unrelated
  // host's headers into captureFromHeaders and its body into the response walkers.
  function isGrindrUrl(u) {
    try {
      const h = new URL(String(u || ''), location.origin).hostname.toLowerCase();
      return h === 'grindr.com' || h.endsWith('.grindr.com');
    } catch (_e) { return false; }
  }
  // Only load a thumbnail from Grindr's own image hosts. photoUrl comes off an
  // untrusted payload, and an <img src> to an arbitrary absolute URL turns every
  // auto-block toast into an outbound beacon to a host of the payload's choosing.
  function isTrustedPhotoUrl(u) {
    try {
      const url = new URL(String(u || ''), location.origin);
      if (url.protocol !== 'https:') return false;
      const h = url.hostname.toLowerCase();
      return h.endsWith('.grindr.com') || h === 'grindr.com' || h.endsWith('.cloudfront.net');
    } catch (_e) { return false; }
  }
  // Record any mutating Grindr request while a capture window is armed.
  function noteWriteDuringCapture(method, url, body) {
    try {
      if (Date.now() > captureWritesUntil) return;
      const u = String(url || '');
      if (!isGrindrUrl(u)) return;
      const m = String(method || 'GET').toUpperCase();
      if (!MUTATING_METHOD_RE.test(m)) return;
      const bodyStr = SENSITIVE_URL_RE.test(u) ? '(redacted: credential endpoint)'
        : (typeof body === 'string') ? scrubSecrets(body.slice(0, 1000))
        : (body ? Object.prototype.toString.call(body) : '');
      seenBlockActions.push({ method: m, url: u, body: bodyStr, at: Date.now() });
      if (seenBlockActions.length > 80) seenBlockActions.shift();
      logWarn(`${LOG} [capture] ${m} ${u}${bodyStr ? ` body=${bodyStr}` : ''}`);
    } catch {}
  }
  // WebSocket frames carry no URL at send() time, and Grindr's realtime socket is
  // the prime suspect for the invisible block. Log every outbound frame during the
  // capture window (strings verbatim; binary as a type+size marker — a protobuf
  // frame can't be replayed as easily but at least identifies the transport).
  function noteWsSendDuringCapture(data) {
    try {
      if (Date.now() > captureWritesUntil) return;
      let desc;
      if (typeof data === 'string') desc = data.slice(0, 1000);
      else if (data instanceof ArrayBuffer) desc = `<ArrayBuffer ${data.byteLength}b>`;
      else if (ArrayBuffer.isView(data)) desc = `<${data.constructor.name} ${data.byteLength}b>`;
      else if (typeof Blob !== 'undefined' && data instanceof Blob) desc = `<Blob ${data.size}b>`;
      else desc = Object.prototype.toString.call(data);
      // Store what we LOG: outbound WS frames carry private chat text verbatim, and
      // __grindrBlock_seenActions() hands the stored body back for sharing. Unless
      // bodies were explicitly opted in, store the summary, not the message text.
      const stored = captureIncludeBodies ? scrubSecrets(desc)
        : (typeof data === 'string' ? `<string ${desc.length}ch>` : desc);
      seenBlockActions.push({ method: 'WS-SEND', url: '(websocket)', body: stored, at: Date.now() });
      if (seenBlockActions.length > 80) seenBlockActions.shift();
      // Outbound WS frames carry chat message text verbatim (noteWsSendForGreet
       // relies on exactly that), so the body is summarised rather than printed
       // unless capture was armed with bodies explicitly.
      logWarn(`${LOG} [capture] WS-SEND ${captureIncludeBodies ? desc : `<${typeof data === 'string' ? `string ${desc.length}ch` : desc}>`}`);
    } catch {}
  }

  // ── Stay logged in: defeat the 30-minute idle auto-logout ──────────────────
  // Runs at document-start (before Grindr's bundle), so the patches below are in
  // place when react-idle-timer arms its countdown and when logoutCleanup() later
  // wipes storage. We can only act from the userscript sandbox — we cannot delete
  // Grindr's logout code — so we neutralise the things that TRIGGER an idle logout.
  // All three guards are gated behind STAY_LOGGED_IN (see the knobs at the top).
  function installStayLoggedIn() {
    if (!STAY_LOGGED_IN) return;

    // 1) Idle-timer neutraliser — the "set the timer to ~99 hours" approach.
    //    react-idle-timer schedules its idle countdown with a single
    //    setTimeout(<timeout>). Because we run BEFORE Grindr's bundle, wrapping
    //    window.setTimeout here means any long countdown it arms (>= the floor) is
    //    rewritten to IDLE_TIMEOUT_OVERRIDE_MS. The timer reschedules on every
    //    activity, so it now effectively never fires. Short app timers (the 1s
    //    idle-debounce, the 60s Sentry backoff, boost ticks) are below the floor
    //    and pass through untouched. setInterval is left alone.
    try {
      const origSetTimeout = window.setTimeout;
      origSetTimeoutRef = origSetTimeout;
      window.setTimeout = function (fn, delay, ...rest) {
        if (typeof delay === 'number' && delay >= IDLE_CLAMP_FLOOR_MS) {
          logTrace(`${LOG} stay-logged-in: setTimeout(${delay}ms) → ${IDLE_TIMEOUT_OVERRIDE_MS}ms (idle clamp).`);
          delay = IDLE_TIMEOUT_OVERRIDE_MS;
        }
        return origSetTimeout(fn, delay, ...rest);
      };
    } catch (e) { logWarn(`${LOG} stay-logged-in: setTimeout clamp failed:`, e); }

    // 2) Storage guard — keep THIS script's persisted data (and only this
    //    script's) alive across logoutCleanup()'s localStorage.clear() /
    //    sessionStorage.clear(). We replace clear() with a selective wipe that
    //    removes every key EXCEPT ours, so Grindr's clear semantics are unchanged
    //    for its own keys while our block list survives a logout.
    if (GUARD_LOCALSTORAGE) {
      const guardClear = (store, label) => {
        try {
          const origClear = store.clear.bind(store);
          origStorageClears.push({ store, clear: origClear });
          store.clear = function () {
            try {
              const keep = [];
              for (let i = 0; i < store.length; i++) {
                const k = store.key(i);
                if (k && k.indexOf(STORAGE_KEEP_PREFIX) === 0) keep.push([k, store.getItem(k)]);
              }
              origClear();
              for (const [k, v] of keep) { try { store.setItem(k, v); } catch {} }
              if (keep.length) logInfo(`${LOG} stay-logged-in: preserved ${keep.length} ${label} key(s) through clear().`);
            } catch (e) { logWarn(`${LOG} stay-logged-in: guarded ${label}.clear() failed:`, e); origClear(); }
          };
        } catch (e) { logWarn(`${LOG} stay-logged-in: could not guard ${label}.clear():`, e); }
      };
      // Reading window.localStorage THROWS SecurityError where site data is
      // blocked (Chrome "block all cookies", a sandboxed frame). That read is an
      // argument expression, so it happens OUTSIDE guardClear's own try — and
      // every listener, the fetch patch and the enforcement sweep are installed
      // AFTER this line, so one throw here used to kill the entire userscript at
      // document-start with nothing but a console error.
      try { guardClear(window.localStorage, 'localStorage'); }
      catch (e) { logWarn(`${LOG} stay-logged-in: localStorage unavailable:`, e); }
      try { guardClear(window.sessionStorage, 'sessionStorage'); }
      catch (e) { logWarn(`${LOG} stay-logged-in: sessionStorage unavailable:`, e); }
    }

    // 3) Keep-alive heartbeat — a redundant safety net behind #1. Dispatches a
    //    synthetic 'mousemove' on document every KEEPALIVE_INTERVAL_MS so the idle
    //    timer keeps resetting even if Grindr changes its idle config out from
    //    under the clamp. mousemove is the lightest event react-idle-timer watches
    //    and has no meaningful app side effect. Uses setInterval (not clamped).
    if (KEEPALIVE_INTERVAL_MS > 0) {
      installedIntervals.push(setInterval(() => {
        try {
          // Never fire a synthetic pointer event into an open modal/picker — a
          // stray mousemove is exactly the kind of thing that dismisses one.
          if (SCRIPT_DISABLED || grindrOverlayOpen()) return;
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: false }));
          logTrace(`${LOG} stay-logged-in: keep-alive mousemove dispatched.`);
        } catch (e) { logTrace(`${LOG} stay-logged-in: keep-alive dispatch failed:`, e); }
      }, KEEPALIVE_INTERVAL_MS));
    }

    logInfo(`${LOG} stay-logged-in active (idle ${Math.round(IDLE_CLAMP_FLOOR_MS / 60_000)}m+ → ${Math.round(IDLE_TIMEOUT_OVERRIDE_MS / 3_600_000)}h, keepAlive=${KEEPALIVE_INTERVAL_MS ? Math.round(KEEPALIVE_INTERVAL_MS / 60_000) + 'm' : 'off'}, guardStorage=${GUARD_LOCALSTORAGE}).`);
  }
  // Same reasoning: nothing in this optional guard may be allowed to take the
  // rest of the script down with it.
  try { installStayLoggedIn(); }
  catch (e) { logWarn(`${LOG} stay-logged-in: install failed (continuing without it):`, e); }

  // ── Skip the "Grindr Web Beta" welcome dialog ──────────────────────────────
  // See SKIP_BETA_DIALOG up top. Runs at document-start so the flag is in place
  // before Grindr's bundle reads it on mount. seedBetaDialogDismissed() writes the
  // exact same sessionStorage flag the "Let's Go!" button writes, so the dialog's
  // useState(!sessionStorage.getItem(key)) initialises closed and it never opens.
  function seedBetaDialogDismissed() {
    try {
      if (!sessionStorage.getItem(BETA_DIALOG_SS_KEY)) {
        sessionStorage.setItem(BETA_DIALOG_SS_KEY, JSON.stringify(Date.now()));
      }
    } catch (e) { logTrace(`${LOG} skip-beta-dialog: seed failed:`, e); }
  }
  // Fallback: if a re-login (no full reload) mounts the dialog before we re-seed,
  // click its dismiss button (id="beta-dismiss-btn"), which runs the app's own
  // handler — setting React state false AND re-writing the flag.
  function dismissBetaDialogIfPresent() {
    try {
      const btn = document.getElementById(BETA_DIALOG_BTN_ID);
      if (!btn) return false;
      seedBetaDialogDismissed();
      btn.click();
      logInfo(`${LOG} skip-beta-dialog: dismissed the welcome dialog (#${BETA_DIALOG_BTN_ID}).`);
      return true;
    } catch (e) { logTrace(`${LOG} skip-beta-dialog: dismiss failed:`, e); return false; }
  }
  // Pre-seed the beta-dialog dismissal flag and watch for the dialog mounting
  // anyway.
  function installBetaDialogSkip() {
    if (!SKIP_BETA_DIALOG) return;
    // 1) Pre-seed the gate flag now, before the bundle reads it on mount.
    seedBetaDialogDismissed();
    // 2) Observe for a dialog that slips through (e.g. an in-SPA re-login) and
    //    dismiss it. documentElement exists at document-start; the cheap
    //    getElementById guard keeps the per-mutation cost negligible.
    try {
      const obs = new MutationObserver(() => {
        if (SCRIPT_DISABLED) return;
        if (document.getElementById(BETA_DIALOG_BTN_ID)) dismissBetaDialogIfPresent();
      });
      installedObservers.push(obs);
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { logWarn(`${LOG} skip-beta-dialog: observer install failed:`, e); }
    dismissBetaDialogIfPresent();
    logInfo(`${LOG} skip-beta-dialog active (sessionStorage["${BETA_DIALOG_SS_KEY}"] seeded).`);
  }
  installBetaDialogSkip();

  const rawFetch = window.fetch.bind(window);
  // Diagnostic wrapper around our OWN outbound calls. Everything this script
  // sends (block, hide, album share, verification reads) deliberately uses
  // origFetch so it bypasses the observer and never self-indexes — but that also
  // made it invisible to the recorder. A capture of a block/hide/unlock session
  // contained 13 requests, ALL of them Grindr's, and not one of ours: the exact
  // requests under investigation were the only ones missing. This adds them to
  // the recording without feeding them back into the observers.
  async function origFetch(input, init) {
    const url = String((input && input.url) || input || '');
    const rec = diagNetStart((init && init.method) || 'GET', url);
    if (rec) {
      rec.mine = true;
      try { const b = init && init.body; if (typeof b === 'string') rec.reqBody = captureBody(url, b); } catch (_e) {}
    }
    let res;
    try {
      res = await rawFetch(input, init);
    } catch (err) {
      if (rec) { rec.status = 0; rec.statusText = `network error: ${err && err.message}`; rec.ms = Date.now() - rec.started; }
      throw err;
    }
    if (rec) { try { res.clone().text().then((t) => diagNetFinish(rec, res, t)).catch(() => diagNetFinish(rec, res, '')); } catch (_e) { diagNetFinish(rec, res, ''); } }
    return res;
  }
  // Install the fetch observer. Guarded: under a hardened runtime (SES/lockdown
  // with frozen intrinsics) `window.fetch` can be non-writable, and the
  // assignment would then throw under 'use strict' and kill the whole IIFE at
  // document-start. If that happens we keep origFetch (so block/unblock/verify
  // still work via the real fetch) and lose only passive response-body indexing.
  try {
    window.fetch = async function patchedFetch(input, init) {
      try {
        const url = String((input && input.url) || input || '');
        if (isGrindrUrl(url)) {
          logTrace(`${LOG} fetch ${url}`);
          // Capture request headers (this is where Authorization lives)
          if (init && init.headers) captureFromHeaders(init.headers);
          else if (input && input.headers) captureFromHeaders(input.headers);
          // Discover Grindr's real block/hide endpoint from its own traffic.
          const reqMethod = (init && init.method) || (input && input.method) || 'GET';
          const reqBody = (init && init.body != null) ? init.body : (input && input.body);
          notePossibleBlockAction(reqMethod, url, reqBody);
          noteWriteDuringCapture(reqMethod, url, reqBody);
          // Remember the last single profile the APP fetched — the backstop id
          // source for the action hotkeys (see resolveTargetProfileId).
          noteViewedProfileFromUrl(url);
          // Album discovery + own-id learning from the URL (see the album section):
          // /albums/{id}/shares proves the album is yours, and two DIFFERENT
          // conversation ids sharing exactly one half name you (the id is sorted,
          // so a single one names a pair and identifies neither).
          noteAlbumIdFromUrl(url);
          noteMyProfileIdFromUrl(url);
          // The typing indicator names the conversation on screen in its BODY
          // (POST /api/v4/chatstatus/typing {"conversationId":"<a>:<b>",…}) —
          // the only signal that survives on a build where the route is bare
          // /chat. It doubles as proof that the composer really took our text,
          // since the app only announces typing for a real input event.
          if (typeof reqBody === 'string') noteOpenConversationFromBody(reqBody);
        }
      } catch {}
      const netRec = (() => { try { const u = String((input && input.url) || input || ''); return isGrindrUrl(u) ? diagNetStart((init && init.method) || (input && input.method) || 'GET', u) : null; } catch (_e) { return null; } })();
      if (netRec) { try { const b = (init && init.body != null) ? init.body : (input && input.body); if (typeof b === 'string') netRec.reqBody = captureBody(netRec.url, b); } catch (_e) {} }
      // rawFetch, not origFetch: origFetch is the diagnostic wrapper, so calling
      // it here recorded every Grindr request TWICE (once as theirs, once as
      // ours) and doubled the HAR.
      const res = await rawFetch(input, init);
      if (netRec) { try { res.clone().text().then((t) => diagNetFinish(netRec, res, t)).catch(() => diagNetFinish(netRec, res, '')); } catch (_e) { diagNetFinish(netRec, res, ''); } }
      try {
        const url = String((input && input.url) || input || '');
        if (isGrindrUrl(url)) {
          const ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
          if (ct.includes('json')) {
            // Clone — don't break Grindr's own consumption of the body
            // Grindr fetches its own hide/block lists on load. That response is
            // authoritative confirmation, so we both (a) suppress the demotion
            // path while walking it and (b) CONFIRM every block we find in it —
            // which makes tier reconciliation free and automatic, with no poll.
            const isListResponse = LIST_RESPONSE_URL_RE.test(url);
            res.clone().json().then((data) => {
              indexingListResponse = isListResponse;
              try {
                walkAndIndex(data, 0);
                // Separate walk, separate caps — see noteIncomingMessages.
                try { noteIncomingMessages(data, 0, false); } catch (_e) {}
              } finally { indexingListResponse = false; }
              if (isListResponse) { try { confirmBlocksFromListPayload(data); } catch (_e) {} }
            }).catch((e) => logTrace(`${LOG} response index failed:`, e));
          }
        }
      } catch {}
      return res;
    };
  } catch (e) {
    logWarn(`${LOG} could not patch window.fetch (frozen intrinsics?) — response indexing disabled`, e);
  }

  // XHR patch — Grindr mostly uses fetch but a few flows still use XHR,
  // particularly older endpoints. Mirror the auth capture path.
  //
  // The two patches form a handshake: open() runs first and stashes the request
  // URL on the XHR instance as `_gb_url`; setRequestHeader() runs later (once
  // per header) and reads `_gb_url` to decide whether this is a grindr.com call
  // worth capturing. open() has to record the URL because setRequestHeader has
  // no other way to know which endpoint it's setting a header for. Only auth is
  // captured here (not response bodies) — the fetch patch already covers JSON.
  const origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  // Same frozen-intrinsics guard as the fetch patch above: if the XHR prototype
  // is locked, skip XHR auth capture instead of aborting the whole script.
  try {
    XMLHttpRequest.prototype.setRequestHeader = function patchedSetHeader(name, value) {
      try {
        const url = String(this._gb_url || '');
        if (isGrindrUrl(url)) {
          captureFromHeaders({ [name]: value });
        }
      } catch {}
      return origXhrSetHeader.call(this, name, value);
    };
    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      try { this._gb_url = url; this._gb_method = method; } catch {}
      try { noteViewedProfileFromUrl(url); noteAlbumIdFromUrl(url); noteMyProfileIdFromUrl(url); } catch {}
      if (isGrindrUrl(url)) logTrace(`${LOG} xhr ${method} ${url}`);
      return origXhrOpen.apply(this, arguments);
    };
    // send() carries the request body — feed it to the capture window so a native
    // block done over XHR is observed too (the body is where a profileId may live).
    XMLHttpRequest.prototype.send = function patchedSend(body) {
      try { noteWriteDuringCapture(this._gb_method || 'GET', this._gb_url || '', body); } catch {}
      try { if (typeof body === 'string') noteOpenConversationFromBody(body); } catch {}
      return origXhrSend.apply(this, arguments);
    };
  } catch (e) {
    logWarn(`${LOG} could not patch XMLHttpRequest (frozen intrinsics?) — XHR auth capture disabled`, e);
  }

  // ── Confirming a greeting actually left the browser ────────────────────────
  // A HAR of a greet that SUCCEEDED contains no message-send request: Grindr
  // sends chat over the WebSocket, and only the typing indicator
  // (POST /api/v4/chatstatus/typing) travels over HTTP. So "did it send?" cannot
  // be answered from the network panel at all, and clickSendButton() returning
  // true only means the gesture was accepted by the DOM.
  //
  // Since WebSocket.prototype.send is already wrapped for the capture window, we
  // can answer it properly: after submitting, watch outbound frames for a short
  // window and look for our own phrase. Seeing it is proof; not seeing it is not
  // disproof (the frame may be binary/protobuf), so a miss only downgrades the
  // log line and never contradicts a toast the user already saw.
  const GREET_FRAME_WATCH_MS = 4000;
  let greetFrameWatch = null;
  // After submitting a greeting, watch outbound WebSocket frames for its text to
  // confirm it left the browser.
  function watchForGreetFrame(phrase, profileId) {
    const needle = String(phrase || '').trim();
    if (!needle) return;
    greetFrameWatch = { needle, profileId: String(profileId || ''), until: Date.now() + GREET_FRAME_WATCH_MS, seen: false };
    const mine = greetFrameWatch;
    setTimeout(() => {
      if (greetFrameWatch !== mine) return;
      if (!mine.seen) logInfo(`${LOG} greet to ${mine.profileId}: no text frame observed (Grindr may frame chat as binary) — not necessarily a failure.`);
      greetFrameWatch = null;
    }, GREET_FRAME_WATCH_MS + 250);
  }
  // Check one outbound frame against the greeting being watched for.
  function noteWsSendForGreet(data) {
    try {
      const w = greetFrameWatch;
      if (!w || w.seen || Date.now() > w.until) return;
      if (typeof data !== 'string' || !data.includes(w.needle)) return;
      w.seen = true;
      logInfo(`${LOG} greet to ${w.profileId} CONFIRMED on the wire (outbound WS frame carries the text).`);
    } catch (_e) {}
  }

  // WebSocket send patch — the leading suspect for the invisible native block on a
  // realtime app. Only the prototype METHOD is wrapped (not the constructor), so we
  // never risk breaking the app's socket; we just observe outbound frames during a
  // capture window. Guarded for frozen intrinsics like the patches above.
  try {
    const origWsSend = WebSocket.prototype.send;
    origWsSendRef = origWsSend;
    WebSocket.prototype.send = function patchedWsSend(data) {
      try { noteWsSendDuringCapture(data); } catch {}
      try { noteWsSendForGreet(data); } catch {}
      return origWsSend.apply(this, arguments);
    };
  } catch (e) {
    logWarn(`${LOG} could not patch WebSocket.send (frozen intrinsics?) — WS capture disabled`, e);
  }

  // WebSocket RECEIVE observer — the only way to see a message arrive live.
  // Everything else in this file watches outbound traffic; incoming chat lands on
  // a 'message' event and never touches fetch, so without this an unhide would
  // wait for the next refetch.
  //
  // This wraps addEventListener rather than the constructor or the onmessage
  // accessor, both of which sit closer to the app's own plumbing. The wrapper's
  // only job is to peek and hand off: our observation runs inside its own
  // try/catch and the original listener is invoked unconditionally afterward, so
  // there is no path where a bug in here stops Grindr from receiving a message.
  // If the app registers its handler via `socket.onmessage = fn` instead, this
  // sees nothing and the fetch-side scan remains the backstop — the feature
  // degrades to "unhides on next refetch", never to "breaks chat".
  try {
    const origWsAdd = WebSocket.prototype.addEventListener;
    origWsAddRef = origWsAdd;
    WebSocket.prototype.addEventListener = function patchedWsAdd(type, listener, options) {
      if (type !== 'message' || typeof listener !== 'function') {
        return origWsAdd.call(this, type, listener, options);
      }
      // The wrapper must be REMOVABLE. Grindr registers its handler and may later
      // detach it; removeEventListener(type, handler) is a no-op when what was
      // actually registered is `wrapped`, so the stale handler stayed attached and
      // Grindr processed every frame twice — duplicated messages and doubled state
      // updates. Remembering the pairing and translating on removal fixes it.
      let wrapped = wsListenerMap.get(listener);
      if (!wrapped) {
        wrapped = function (event) {
          try { noteIncomingMessageFrame(event && event.data); } catch (_e) {}
          return listener.apply(this, arguments);
        };
        wsListenerMap.set(listener, wrapped);
      }
      return origWsAdd.call(this, type, wrapped, options);
    };
    const origWsRemove = WebSocket.prototype.removeEventListener;
    origWsRemoveRef = origWsRemove;
    WebSocket.prototype.removeEventListener = function patchedWsRemove(type, listener, options) {
      const wrapped = (type === 'message' && typeof listener === 'function') ? wsListenerMap.get(listener) : null;
      return origWsRemove.call(this, type, wrapped || listener, options);
    };
  } catch (e) {
    logWarn(`${LOG} could not patch WebSocket.addEventListener — live unhide-on-message disabled (fetch scan still covers it)`, e);
  }

  // sendBeacon patch — some apps fire fire-and-forget actions via Beacon, which
  // never shows as fetch/XHR. Observe it during the capture window too.
  try {
    if (navigator.sendBeacon) {
      const origSendBeacon = navigator.sendBeacon.bind(navigator);
      origSendBeaconRef = origSendBeacon;
      navigator.sendBeacon = function patchedSendBeacon(url, data) {
        try { noteWriteDuringCapture('BEACON', url, typeof data === 'string' ? data : ''); } catch {}
        return origSendBeacon(url, data);
      };
    }
  } catch (e) {
    logWarn(`${LOG} could not patch navigator.sendBeacon — beacon capture disabled`, e);
  }

  // ── Toast UI ──────────────────────────────────────────────────────────────
  // Transient status messages (auth/rate-limit/result notices). Distinct from
  // the interactive "Unblock" toasts further down: this is a single, self-
  // replacing toast pinned at bottom:20px, whereas the undo toasts stack at
  // bottom:72px so the two never collide. `kind` picks the colour — 'ok' green,
  // 'err' red, anything else ('warn') amber. Only one status toast exists at a
  // time (reusing the fixed ID removes the previous one), it's click-through
  // (pointer-events:none), and it self-dismisses: fade at 4.5s, remove at 5s.
  // Wrapped in try/catch so a UI failure can never interrupt a block.
  function showToast(text, kind = 'warn') {
    logTrace(`${LOG} showToast(${kind})`);
    try {
      const ID = 'grindr-block-toast';
      const existing = document.getElementById(ID);
      if (existing) existing.remove();
      const toast = document.createElement('div');
      toast.id = ID;
      const bg = kind === 'ok' ? 'rgba(34,197,94,0.95)'
        : kind === 'err' ? 'rgba(220,38,38,0.95)'
        : 'rgba(234,179,8,0.95)';
      toast.style.cssText =
        `position:fixed;bottom:20px;left:20px;z-index:999999;max-width:340px;` +
        `background:${bg};color:#fff;padding:10px 14px;border-radius:8px;` +
        `font-family:system-ui,sans-serif;font-size:12px;line-height:1.4;` +
        `box-shadow:0 4px 12px rgba(0,0,0,0.4);transition:opacity 0.3s;pointer-events:none`;
      toast.textContent = text;
      (document.body || document.documentElement).appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; }, 4500);
      setTimeout(() => toast.remove(), 5000);
    } catch {}
  }

  // Selector for the enclosing cascade cell / profile card. Centralized here so
  // the hide (removeBlockedCardFromDom) and restore (restoreBlockedCardInDom)
  // paths can never drift apart on it.
  const CASCADE_CARD_SELECTOR =
    '[data-testid="cascadeCellContainer"], [class*="cascade-cell"], [class*="profile-card"]';

  // THE card resolver. Class-name selectors alone are not enough: Grindr renders
  // the grid with styled-components, so a tile's classes are content hashes like
  // "sc-jKCWkB caHOKQ" and NONE of the names in CASCADE_CARD_SELECTOR appear
  // anywhere in the markup any more. A capture makes the consequence exact —
  //     sweep {"imgs":153,"matched":5,"hidden":0}
  // the sweep correctly identified five blocked profiles on screen and collapsed
  // none of them, because img.closest(CASCADE_CARD_SELECTOR) returned null every
  // time. Same reason confirm-DOM kept reporting profileEl=false: the block was
  // applied server-side and there was simply no element to hide.
  //
  // So fall back to GEOMETRY, which cannot rot: walk up from the photo to the
  // first ancestor big enough to be a tile. That is the same heuristic
  // resolveProfileIdFromClick and listCascadeCards already use to decide what a
  // tile is, so all three agree.
  // A cascade tile is wrapped. The live grid nests THREE divs of identical size —
  // [data-testid=cascadeCellContainer] plus two single-child wrappers, all
  // 559x745 — so hiding the innermost leaves the outer two still holding the
  // space and you get a card-shaped hole where the profile was. That is the
  // "blocked card shows empty" report.
  //
  // Walk up while the parent is the same size AND has exactly one child (a pure
  // wrapper contributing nothing but layout) and hide that instead. The walk
  // stops at the grid itself, which has hundreds of children.
  function outermostCardWrapper(el) {
    if (!el) return el;
    let best = el;
    const r0 = el.getBoundingClientRect();
    let node = el.parentElement;
    for (let i = 0; node && i < 4; i += 1, node = node.parentElement) {
      if (node === document.body || node === document.documentElement) break;
      if (node.children.length !== 1) break;          // no longer a pure wrapper
      const r = node.getBoundingClientRect();
      if (Math.abs(r.width - r0.width) > 4 || Math.abs(r.height - r0.height) > 4) break;
      best = node;
    }
    return best;
  }

  // Resolve the grid card owning a profile photo. Selector first, then a
  // strictly bounded geometry walk. Returns null rather than guessing.
  function cardForImage(img) {
    if (!img) return null;
    // The selector path is the ONLY reliable one, and it does still work: a live
    // inspection of the page found 18 [data-testid="cascadeCellContainer"]
    // elements, so v0.38's premise that the selector was dead was WRONG. The
    // real cause of blocked tiles not disappearing was the poisoned hash index
    // (fixed in v0.39) plus the undo-window skip, not this.
    try {
      const direct = img.closest(CASCADE_CARD_SELECTOR);
      if (direct) return outermostCardWrapper(direct);
    } catch (_e) {}

    // The geometry fallback stays, but STRICTLY bounded — v0.38's version was
    // dangerous. That page also holds ~132 profile photos that are NOT cascade
    // tiles (the conversation avatars down the inbox sidebar), and walking up
    // from one of those to "the first ancestor at least 80x80" landed on a
    // UL measuring 241x13414 — the whole sidebar. Blocking anyone who appeared
    // there would have set display:none on it and wiped the chat list.
    //
    // Two bounds make it safe. Stop the moment an ancestor contains more than
    // this one profile photo (a real tile holds exactly one; anything holding
    // two is a list), and never accept something taller than the viewport.
    // Verified against the live page: 8 tiles resolve, all 132 sidebar avatars
    // are refused, and the largest target is 559x745 — an actual tile.
    const maxH = Math.max(400, (window.innerHeight || 800) * 1.2);
    const maxW = window.innerWidth || 1200;
    let best = null;
    let node = img.parentElement;
    for (let i = 0; node && i < 6; i += 1, node = node.parentElement) {
      if (node === document.body || node === document.documentElement) break;
      let count = 0;
      try { count = node.querySelectorAll(PROFILE_PHOTO_SELECTOR).length; } catch (_e) { break; }
      if (count !== 1) break;                       // now spans siblings — too big
      let r;
      try { r = node.getBoundingClientRect(); } catch (_e) { break; }
      if (r.height > maxH || r.width > maxW) break;
      if (r.width >= HOTKEY_MIN_TILE_PX && r.height >= HOTKEY_MIN_TILE_PX) best = node;
    }
    // Refusing is correct when nothing tile-shaped is found. Returning the bare
    // parent (v0.38) is how the sidebar got hit; the sweep counts a refusal as
    // noCard, so a genuine miss stays visible.
    return best;
  }

  // Find the in-DOM cascade card element(s) for a profile. We can't target a
  // cell directly (cells carry no profileId), so we go through the photo-hash
  // reverse index: for each hash known for this profile, find an <img src>
  // containing it and walk up to the enclosing card. Hashes are charset-validated
  // at ingest (isUsableHash), so interpolating one into the selector is safe.
  // Returns a de-duplicated array (possibly empty if the profile's photos were
  // never indexed or its cell scrolled out of the virtualised grid).
  function findCardsForProfile(profileId) {
    const hashes = profileIdToHashes.get(profileId);
    if (!hashes || !hashes.size) return [];
    const cards = [];
    for (const hash of hashes) {
      document.querySelectorAll(`img[src*="${hash}"]`).forEach(img => {
        const card = cardForImage(img);
        if (card && !cards.includes(card)) cards.push(card);
      });
    }
    return cards;
  }

  // Visually remove a blocked profile's cascade cell. Notes on the timing/flags:
  //   • Outer 300ms delay: gives Grindr's own block-success handler a moment to
  //     re-render first, so we hide the settled cell rather than a stale one.
  //   • Hide exactly ONE cell (cards[0]). A profile appears once in the cascade,
  //     and stopping at the first match avoids nuking unrelated cells that might
  //     coincidentally share a cached photo hash.
  //   • Two-phase removal: fade opacity to 0 (0.3s), THEN display:none, for a
  //     smooth disappear instead of an abrupt pop.
  // Best-effort and wrapped in try/catch (it runs in a detached timer task): if
  // nothing is found the block still took effect server-side and the profile
  // simply won't reappear.
  function removeBlockedCardFromDom(profileId) {
    logTrace(`${LOG} removeBlockedCardFromDom(${profileId})`);
    setTimeout(() => {
      try {
        const card = findCardsForProfile(profileId)[0];
        if (!card) return;
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '0';
        setTimeout(() => { card.style.display = 'none'; }, 300);
      } catch (e) { logTrace(`${LOG} removeBlockedCardFromDom error:`, e); }
    }, 300);
  }

  // ── Rate-limited block queue ──────────────────────────────────────────────
  // Grindr will silently invalidate your session if you burst too many block
  // calls in a short window. We serialize calls behind a MIN_INTERVAL_MS gap,
  // back off 30s on 429, and pause entirely on 401/403 (session dead) until
  // a canary call succeeds.
  const blockQueue = [];              // ordered jobs to run: { profileId, action }
  const blockQueueSet = new Set();    // 'action:profileId' keys currently queued/in-flight
  // Where a newly enqueued job belongs. Bulk (auto-drain) work appends;
  // interactive work goes to the very front, so the newest press is served next
  // and never waits behind a drain backlog. Pure so the rule can be pinned by a
  // test — the version that spliced interactive jobs merely ahead of the FIRST
  // bulk job still left them behind older interactive ones.
  function queueInsertIndex(queue, bulk) {
    return bulk ? queue.length : 0;
  }
  // Index of the first job that can run right now, or -1 when none can. A job is
  // runnable when its own retry backoff has elapsed AND the budget it draws on
  // still has room. Pure, and exported, because this is the exact rule whose
  // absence made blocking look broken: with one shared budget a spent drain
  // stopped the whole queue, so a hand-pressed block was told to wait 48 minutes.
  function nextRunnableIndex(queue, now, manualCapped, bulkCapped) {
    return queue.findIndex((j) =>
      (!j.notBefore || j.notBefore <= now) && !(j.bulk ? bulkCapped : manualCapped));
  }

  // Two independent rolling-hour windows. Interactive work (a block you pressed,
  // an album unlock, a manual reconcile) is charged to `recentManualCalls`; the
  // background hide-to-block drain is charged to `recentBulkCalls`. Keeping them
  // apart is what stops a saturated drain from delaying a block you just pressed.
  const recentManualCalls = [];      // ms timestamps of interactive API calls
  const recentBulkCalls = [];        // ms timestamps of auto-drain API calls
  // Record N API calls against the rolling-hour cap at once (a block job now makes
  // two writes — hide + block — and the verify makes two read-backs, so callers pass
  // the real count instead of assuming one). `bulk` selects the drain's window;
  // omitting it charges the call to the interactive budget, which is the safe
  // default — miscounting background work as interactive only makes us throttle
  // ourselves sooner, never the reverse.
  function noteApiCalls(n, bulk) {
    const t = Date.now();
    const arr = bulk ? recentBulkCalls : recentManualCalls;
    for (let i = 0; i < (n || 1); i++) arr.push(t);
  }
  // Minutes until a rolling-hour window frees its next slot — i.e. when its
  // OLDEST recorded call ages out. Pure so the arithmetic can be pinned: this is
  // the number shown on the HUD as "frees 1 in Nm", and an off-by-one here reads
  // as the cooldown being wrong rather than as a rounding choice. Rounds up,
  // because a window with 40s left has not reset yet and "0m" would say it had.
  function windowResetMinutes(oldestTs, now) {
    if (!oldestTs) return 0;
    return Math.max(0, Math.ceil((oldestTs + 3_600_000 - now) / 60_000));
  }
  // Drop entries older than the rolling hour from both windows.
  function pruneCallWindows(now) {
    const hourAgo = (now || Date.now()) - 3_600_000;
    while (recentManualCalls.length && recentManualCalls[0] < hourAgo) recentManualCalls.shift();
    while (recentBulkCalls.length && recentBulkCalls[0] < hourAgo) recentBulkCalls.shift();
  }
  let blockSessionDead = false;       // true after a 401/403 — pause until a canary call succeeds
  // When Grindr last rejected our auth, and how often. The queue going quiet
  // after a 401 was indistinguishable from it having nothing to do — that
  // ambiguity cost hours, so it is now on the HUD rather than only in the log.
  let lastAuthRejectAt = 0;
  let authRejectCount = 0;
  let lastAuthRejectStatus = 0;
  // Record a 401/403 from any of our calls.
  function noteAuthRejected(status) {
    lastAuthRejectAt = Date.now();
    lastAuthRejectStatus = Number(status) || 401;
    authRejectCount += 1;
    try { refreshHud(); } catch (_e) {}
  }
  let blockBackoffUntil = 0;
  // When the rolling-hour cap is expected to clear, so the HUD can show it rather
  // than leaving a queued block looking like a dead one.
  let capWaitUntil = 0;          // epoch ms to wait until (set by a 429 backoff)
  let queueProcessing = false;        // single-consumer guard so only one processQueue loop runs
  const cancelledBlocks = new Set();  // profileIds whose block was undone mid-flight — abort their retry
  let verifyInconclusiveWarned = false; // warn once if the verify read-back endpoint looks broken
  let queueGeneration = 0;            // bumped by __grindrBlock_clearQueue to abort in-flight blocks

  // The array+Set pair is deliberate: `blockQueue` preserves FIFO order while
  // `blockQueueSet` gives O(1) dedup so the same action for the same profile is
  // never queued twice. They are kept in sync everywhere a job is added or
  // removed — the Set key is `action + ':' + profileId` so a block and an
  // unblock of the same profile are tracked independently.

  // Returns a uniform result contract used by processQueue:
  //   { ok: boolean, status: number, sessionDead: boolean }
  //   • ok          — the action succeeded; dequeue it and apply the DOM change.
  //   • sessionDead — a 401/403; auth is dead, re-queue and pause until re-login.
  //   • status 429  — rate-limited; re-queue and back off (handled by caller).
  //   • status 0    — a network/exception failure (caught below).
  // Grindr's block endpoints, CONFIRMED from a HAR of the app's own native block:
  //   • WRITE: POST/DELETE https://web.grindr.com/api/v3/me/blocks/{profileId}
  //            (empty body, returns 200). This is the SAME path the script first
  //            used — the 501 was never the endpoint, it was missing required
  //            headers (country-code / l-locale), now captured in captureFromHeaders.
  //   • LIST:  GET https://web.grindr.com/api/v4/blocks?page=1 (paginated, v4 — a
  //            DIFFERENT path/version from the write; this is what the app refetches
  //            after a block, and what verifyBlock reads back).
  // The version mismatch (write v3, list v4) is Grindr's, not a typo. Each is
  // centralized so a future bump is a one-line change.
  // What the block hotkey actually sends.
  //   'block' — POST /api/v3/me/blocks/{id}. A real block. Confirmed reachable:
  //             DELETE on this same collection returned 200 in a live capture.
  //   'hide'  — the pre-0.45 behaviour: POST /api/v1/me/hides/{id} with the block
  //             collection as fallback. That is what Grindr's own card menu does,
  //             but a hide never removes anyone from the cascade.
  const BLOCK_MODE = 'block';
  const BLOCK_WRITE_BASE = 'https://web.grindr.com/api/v3/me/blocks';
  const BLOCK_LIST_URL = 'https://web.grindr.com/api/v4/blocks?page=1';
  // Grindr's "hide" and "block" are MUTUALLY-EXCLUSIVE relationship states. The app
  // sets ONE (hide for a profile you haven't chatted with, block for one you have) —
  // never both. CONFIRMED by diffing cURLs: a native hide is a lone
  // POST /api/v1/me/hides/{id} (200) and it sticks. When v0.10.0/.1 fired hide AND
  // then block back-to-back, the trailing block POST CLOBBERED the just-made hide
  // (the block can't persist for a no-dialogue profile, but posting it clears the
  // hide) and returned a hollow 200 — net result: neither applied. So we now mirror
  // the app exactly: HIDE FIRST, and only fall back to the BLOCK collection if the
  // hide itself did not take. WRITE is INFERRED as /api/v1/me/hides/{id} (same
  // /me/{id} shape as block, and the path the app uses); LIST is CONFIRMED
  // (GET /api/v1/hides, 200).
  const HIDE_WRITE_BASE = 'https://web.grindr.com/api/v1/me/hides';
  const HIDE_LIST_URL = 'https://web.grindr.com/api/v1/hides';

  // Apply (POST) or reverse (DELETE) the hide; fall back to the block collection
  // ONLY when the hide didn't take. Never fire both on success — a block after a
  // successful hide silently undoes it (see above). Returns { ok, status,
  // sessionDead, calls }. A 2xx = success (and proof auth is alive), so success is
  // checked before auth/rate classification.
  // A REAL block: the blocks collection only, no hide involved.
  //
  // Hide and block are different relationships, and until now Home did a HIDE
  // (with block only as a fallback) because that is what Grindr's own card menu
  // fires. But a hide does not remove anyone from the cascade — Grindr keeps
  // serving hidden profiles and its client filters them locally — so "block" was
  // only ever cosmetic on our side. Home now performs the real thing.
  async function attemptRealBlock(profileId, auth, method) {
    const headers = { 'Content-Type': 'application/json', ...auth };
    const label = method === 'DELETE' ? 'Unblock' : 'Block';
    try {
      const r = await origFetch(`${BLOCK_WRITE_BASE}/${profileId}`, { method, credentials: 'include', headers });
      if (r.ok) return { ok: true, status: r.status, sessionDead: false, calls: 1 };
      if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, sessionDead: true, calls: 1 };
      return { ok: false, status: r.status, sessionDead: false, calls: 1 };
    } catch (err) {
      logError(`${LOG} ${label} network error:`, err);
      return { ok: false, status: 0, sessionDead: false, calls: 1 };
    }
  }

  // Send a hide, falling back to the block collection only if the hide fails.
  // Returns {ok,status,sessionDead,calls}.
  async function attemptHideOrBlock(profileId, auth, method) {
    const headers = { 'Content-Type': 'application/json', ...auth };
    const label = method === 'DELETE' ? 'Unblock' : 'Block';
    const hit = async (url) => {
      try {
        const r = await origFetch(url, { method, credentials: 'include', headers });
        return { ok: r.ok, status: r.status };
      } catch (err) {
        logError(`${LOG} ${label} network error:`, err);
        return { ok: false, status: 0 };
      }
    };
    // 1) Hide — the app's primary action and the one that actually sticks alone.
    const hide = await hit(`${HIDE_WRITE_BASE}/${profileId}`);
    if (hide.ok) return { ok: true, status: hide.status, sessionDead: false, calls: 1 };
    if (hide.status === 401 || hide.status === 403) return { ok: false, status: hide.status, sessionDead: true, calls: 1 };
    // A 429 on the hide is rate-limiting, not "hide is invalid for this profile" — firing
    // the fallback block POST now would add a second call right on top of a throttle and
    // compound the very burst this script exists to avoid. Stop here (one call made).
    if (hide.status === 429) return { ok: false, status: 429, sessionDead: false, calls: 1 };
    // 2) Hide didn't take (and it wasn't an auth/rate failure) — try the block collection
    //    as a fallback (e.g. a profile you've chatted with, where hide isn't valid).
    const block = await hit(`${BLOCK_WRITE_BASE}/${profileId}`);
    if (block.ok) return { ok: true, status: block.status, sessionDead: false, calls: 2 };
    if (block.status === 401 || block.status === 403) return { ok: false, status: block.status, sessionDead: true, calls: 2 };
    if (block.status === 429) return { ok: false, status: 429, sessionDead: false, calls: 2 };
    // Surface a real status (prefer the block's, then the hide's) over a 0 network failure.
    return { ok: false, status: block.status || hide.status || 0, sessionDead: false, calls: 2 };
  }

  // Apply: POST the hide (falling back to block only if the hide fails — see above).
  async function attemptApiBlock(profileId, auth) {
    logTrace(`${LOG} attemptApiBlock(${profileId})`);
    return attemptHideOrBlock(profileId, auth, 'POST');
  }

  // ⚠️ PARTLY UNVERIFIED: the blocks/hides COLLECTIONS are confirmed (the app GETs
  // them), but these DELETE-to-reverse writes are INFERRED from REST convention —
  // confirm against Grindr's own "unblock"/"unhide" request (or __grindrBlock_seenActions
  // after a native one) before fully trusting them. Any 2xx on either counts as
  // success (a DELETE of an already-absent relationship may return 204), so the
  // "Unblocked" toast is optimistic, not proof the server reversed anything.
  async function attemptApiUnblock(profileId, auth) {
    logTrace(`${LOG} attemptApiUnblock(${profileId})`);
    return attemptHideOrBlock(profileId, auth, 'DELETE');
  }

  // Read BOTH lists back to confirm the profile is gone — it counts as applied if it
  // appears in EITHER the blocks list (GET /api/v4/blocks?page=1, paginated) OR the
  // hides list (GET /api/v1/hides), since one middle-click fires both and only the
  // dialogue-appropriate one may stick. If a just-actioned id is pushed past blocks
  // page 1 AND isn't in hides, the BLOCK_VERIFY_MAX_MISSES fallback trusts the POST.
  // ⚠️ COMPLETENESS ASSUMPTION: this treats "id not in the response body" as
  // "not blocked". That is only valid if the GET returns the COMPLETE list and
  // reflects a new block IMMEDIATELY. If the endpoint is paginated, filtered, or
  // recency-sorted, a just-blocked profile can be absent from the page and we'd
  // false-negative. processQueue guards against the resulting retry-forever with
  // BLOCK_VERIFY_MAX_MISSES (trust the POST after N misses), but you should still
  // verify the list is whole/fresh in the Network tab.
  // Return contract (consumed by processQueue):
  //   { confirmed: true }                      — profileId present in a list → block took.
  //   { confirmed: false }                     — fetched a list OK, profileId absent → didn't take.
  //   { confirmed: false, sessionDead: true }  — 401/403 while reading back.
  //   { confirmed: false, inconclusive: true } — never got a trustworthy list
  //                                              (network error / non-2xx / unparseable).
  // `inconclusive` is the critical escape hatch: if the verify endpoint is wrong
  // or down we must NOT retry forever, so the caller falls back to trusting the
  // POST (and warns once) rather than hammering Grindr into the very forced
  // logout this script exists to avoid.
  async function verifyBlock(profileId, auth) {
    logTrace(`${LOG} verifyBlock(${profileId})`);
    const headers = { 'Content-Type': 'application/json', ...auth };
    // Match the id as a whole number, never as a digit-substring of a larger id
    // (12345 must not match inside 123456). Grindr profile ids are numeric. We
    // use a `(?:^|[^0-9])` left boundary instead of a lookbehind so the pattern
    // parses on engines without lookbehind support (Safari <16.4, older Firefox);
    // a `(?<![0-9])` lookbehind throws at RegExp-construction time there. Only
    // .test() is used below, so consuming the boundary char is harmless.
    const idRe = new RegExp(`(?:^|[^0-9])${profileId}(?![0-9])`);
    const lists = [BLOCK_LIST_URL, HIDE_LIST_URL];
    let sawSessionDead = false;
    let sawTrustworthyList = false;
    for (const url of lists) {
      try {
        const res = await origFetch(url, { method: 'GET', credentials: 'include', headers });
        if (res.status === 401 || res.status === 403) { sawSessionDead = true; continue; }
        if (!res.ok) continue;                 // 404/5xx → inconclusive for this list, try the next
        const body = await res.text();
        sawTrustworthyList = true;
        if (idRe.test(body)) return { confirmed: true };
      } catch (err) {
        logTrace(`${LOG} verifyBlock fetch error for ${url}:`, err);
      }
    }
    if (sawSessionDead) return { confirmed: false, sessionDead: true };
    if (sawTrustworthyList) return { confirmed: false };          // got a real list, id wasn't in it
    return { confirmed: false, inconclusive: true };              // never got a trustworthy answer
  }

  // Re-queue a block that didn't stick for another attempt later, backing off
  // exponentially. We never give up: the job keeps its blockQueueSet entry (so
  // the UI still treats it as pending) and gets a `notBefore` timestamp the
  // queue's ready-picker honours, so a backing-off block doesn't stall other
  // profiles' jobs behind it (no head-of-line block).
  function scheduleBlockRetry(job, reason) {
    job.attempt = (job.attempt || 0) + 1;
    const delay = Math.min(BLOCK_RETRY_BASE_MS * 2 ** (job.attempt - 1), BLOCK_RETRY_MAX_MS);
    job.notBefore = Date.now() + delay;
    blockQueue.push(job);   // still in blockQueueSet; picked back up once notBefore passes
    const secs = Math.round(delay / 1000);
    logWarn(`${LOG} Block for ${job.profileId} not confirmed (${reason}); retry #${job.attempt} in ${secs}s`);
    showToast(`Block not confirmed for ${job.profileId} — retry #${job.attempt} in ${secs}s`, 'warn');
  }

  // 501 Not Implemented / 405 Method Not Allowed / 404 Not Found from a block call
  // means the ENDPOINT or write-shape is wrong (Grindr moved/renamed it, or the
  // POST wants a body instead of id-in-path), not a transient or auth/rate problem
  // — retrying can NEVER make it succeed. So we stop retrying that job and tell the
  // user how to recover: block one person via Grindr's own UI, then read the real
  // request from __grindrBlock_seenActions(). Loud once; subsequent hits log
  // quietly so a burst of dead-endpoint blocks doesn't spam. (404 is included
  // because the v3.1 collection is confirmed but the WRITE shape is still inferred
  // from the old extension — a wrong shape should fail fast to discovery, not loop.)
  const ENDPOINT_WRONG_STATUSES = new Set([501, 405, 404]);
  // Permanent client-side rejections: the REQUEST is bad (e.g. a malformed/invalid
  // profile id, or an unprocessable payload), not the transport. Replaying the
  // identical request will always fail the same way, so drop the job instead of
  // retrying a doomed POST forever. (400 was the symptom of a 20-digit DOM-scan id
  // that overflows int64; resolve-time validation now blocks most, this is the
  // belt-and-suspenders so a slipped-through bad id can't spin the queue.)
  const PERMANENT_REJECT_STATUSES = new Set([400, 422]);
  let endpointWrongWarned = false;
  // Warn once that an endpoint answered 404/405/501, and stop retrying that
  // route.
  function warnEndpointWrong(status) {
    if (endpointWrongWarned) { logWarn(`${LOG} Block endpoint still ${status} — skipping (run __grindrBlock_seenActions() to find the real one).`); return; }
    endpointWrongWarned = true;
    logError(`${LOG} Block endpoint returned ${status} (Not Implemented / Method Not Allowed / Not Found) for ${BLOCK_WRITE_BASE}/{id}. If this is 501, the required request headers (country-code / l-locale) probably weren't captured yet — scroll the cascade or open a profile so the app issues an authed call, then try again. Otherwise the write path moved: block ONE person via Grindr's normal UI, run __grindrBlock_captureWrites() + __grindrBlock_seenActions(), and share the request. Blocks are NOT being retried against the dead route.`);
    showToast(`Block endpoint is dead (${status}). Block someone via Grindr’s own UI, then run __grindrBlock_seenActions(). See console.`, 'err');
  }

  // A successful call proves auth is alive again — clear any session-dead pause.
  // Shared by the unblock and block success paths (each acts as a canary).
  function clearSessionDeadIfSet() {
    if (blockSessionDead) {
      logInfo(`${LOG} Canary succeeded — clearing session-dead flag.`);
      blockSessionDead = false;
      blockBackoffUntil = 0;
    }
  }

  // Warn (once) that the block read-back can't be trusted, so we're falling back
  // to trusting the POST. Fires when the verify endpoint is unreachable, OR when
  // the POST keeps succeeding yet the read-back never lists the profile (a sign
  // the list is paginated/filtered and structurally can't confirm a new block).
  function warnVerifyUntrusted(reason) {
    if (verifyInconclusiveWarned) return;
    verifyInconclusiveWarned = true;
    logWarn(`${LOG} Block verify unreliable (${reason}) — trusting the POST instead. Confirm the read-back URLs AND that they return the complete, immediately-updated hide/block list (a paginated or filtered list can hide a just-blocked profile) against Grindr's Network tab.`);
    showToast('Block verify unreliable — trusting Grindr’s OK (see console).', 'warn');
  }

  // The single consumer that drains blockQueue. At most one instance runs at a
  // time (the queueProcessing guard); enqueueAction just kicks it and returns.
  // Each iteration: honour any active 429 backoff → enforce the rolling-hour cap
  // → pick the next READY job (one whose per-job retry backoff has elapsed;
  // sleep if none ready) → ensure we have auth (else poll up to 60s) → run it.
  //
  // UNBLOCK path is fire-and-forget — a 2xx is trusted, no read-back:
  //   • ok          → drop from dedup set, restore the card, clear session-dead.
  //   • sessionDead → re-queue + pause the whole loop until reset/re-login.
  //   • 429         → re-queue + 30s global backoff.
  //   • other fail  → drop (an unblock that fails isn't worth retrying forever).
  //
  // BLOCK path verifies and retries until it sticks (the whole point of this
  // feature). After the POST:
  //   • sessionDead / 429 → same transport handling as above (NOT a "didn't
  //                         take" — re-queue and let the loop resume).
  //   • otherwise → read the block back (verifyBlock), even when the POST itself
  //                 returned non-2xx (a 4xx can mean "already blocked", which the
  //                 read-back confirms idempotently):
  //       – confirmed         → success: drop from set, remove the card, canary-clear.
  //       – not blocked       → scheduleBlockRetry (exponential backoff, forever)
  //                             … UNLESS the POST kept succeeding while the
  //                             read-back kept not listing it: after
  //                             BLOCK_VERIFY_MAX_MISSES the read-back is deemed
  //                             blind (paginated/filtered) and we trust the POST.
  //       – inconclusive      → can't trust the read-back; if the POST said ok,
  //                             trust it + warn once (don't loop on a broken
  //                             verify endpoint); else retry.
  //       – cancelled/cleared → user hit Undo or __grindrBlock_clearQueue during
  //                             flight: drop without retrying.
  // The verify GET counts against MAX_PER_HOUR (it's a real call). MIN_INTERVAL_MS
  // is applied after every block attempt (success OR retry) to keep calls spaced.
  // Re-queued (transport-failed) jobs use unshift() to keep their front place;
  // retried (unconfirmed) jobs use push()+notBefore so they don't head-of-line block.
  // One unblock job. Returns a loop directive: 'continue' re-enters the loop,
  // 'break' stops the queue, 'next' falls through to the inter-job delay.
  // Extracted verbatim from processQueue's while-body; the only change is that
  // the loop keywords became return values, so the scheduling logic stays in
  // one place and each arm can be read on its own.
  async function runUnblockJob(job, auth, jobKey) {
    const { profileId, action } = job;
        // ── UNBLOCK: fire once, trust a 2xx, no read-back ────────────────
        if (action === 'unblock') {
          const ugen = queueGeneration;
          const result = await (BLOCK_MODE === 'block'
            ? attemptRealBlock(profileId, auth, 'DELETE')
            : attemptApiUnblock(profileId, auth));
          noteApiCalls(result.calls, job.bulk);
          // If __grindrBlock_clearQueue fired during the DELETE await, drop this
          // job instead of re-queuing it below — re-queuing would leave a job in
          // blockQueue with no blockQueueSet key (desync) and defeat clearQueue's
          // drop-pending contract. (Only the generation signal applies here;
          // cancelledBlocks is the block-abort signal, not relevant to an unblock.)
          if (ugen !== queueGeneration) {
            blockQueueSet.delete(jobKey);
            logInfo(`${LOG} Unblock for ${profileId} dropped (clearQueue during send).`);
            return 'continue';
          }
          if (result.ok) {
            blockQueueSet.delete(jobKey);
            logInfo(`${LOG} Unblock ok for ${profileId}`);
            showToast(`Unblocked profile ${profileId}`, 'ok');
            restoreBlockedCardInDom(profileId);
            clearSessionDeadIfSet();
            await new Promise(r => setTimeout(r, MIN_INTERVAL_MS));
          } else if (result.sessionDead) {
            blockSessionDead = true;
            noteAuthRejected(result.status);
            blockQueue.unshift(job);
            logWarn(`${LOG} Session dead (${result.status}). ${blockQueue.length} paused.`);
            showToast(`Grindr forced a re-login (${result.status}). ${blockQueue.length} pending until you sign back in.`, 'err');
            return 'break';
          } else if (result.status === 429) {
            blockQueue.unshift(job);
            blockBackoffUntil = Date.now() + 30_000;
            logWarn(`${LOG} 429 rate-limited — backing off 30s`);
            showToast('Grindr rate-limited. Backing off 30s…', 'warn');
          } else {
            blockQueueSet.delete(jobKey);
            logWarn(`${LOG} Unblock failed (${result.status}) for ${profileId} — dropping`);
            showToast(`Unblock failed (${result.status}) for ${profileId}`, 'err');
          }
          return 'continue';
        }


    return 'next';
  }

  // One block job: POST, transport triage, optional read-back, then either
  // confirm-and-collapse or schedule a retry. Same directive protocol as
  // runUnblockJob, and likewise a verbatim extraction.
  async function runBlockJob(job, auth, jobKey) {
    const { profileId, action } = job;
        // ── BLOCK: POST, then read it back to confirm it actually applied ─
        const myGen = queueGeneration;
        const result = await (BLOCK_MODE === 'block'
          ? attemptRealBlock(profileId, auth, 'POST')
          : attemptApiBlock(profileId, auth));
        noteApiCalls(result.calls, job.bulk);

        // Undo / __grindrBlock_clearQueue may have fired during the POST await.
        // Check BEFORE the transport-retry branches below: a cancelled/cleared
        // block must be dropped, never re-queued — re-queuing here would also
        // desync blockQueueSet from blockQueue and defeat clearQueue's contract.
        if (cancelledBlocks.has(profileId) || myGen !== queueGeneration) {
          cancelledBlocks.delete(profileId);
          blockQueueSet.delete(jobKey);
          logInfo(`${LOG} Block for ${profileId} aborted mid-flight (undo/clearQueue) — not retrying.`);
          return 'continue';
        }

        // Transport problems mean "couldn't talk to Grindr", not "block didn't
        // take" — handle them exactly like the unblock path and loop on.
        if (result.sessionDead) {
          blockSessionDead = true;
          noteAuthRejected(result.status);
          blockQueue.unshift(job);
          logWarn(`${LOG} Session dead (${result.status}). ${blockQueue.length} paused.`);
          showToast(`Grindr forced a re-login (${result.status}). ${blockQueue.length} pending until you sign back in.`, 'err');
          return 'break';
        }
        if (result.status === 429) {
          blockQueue.unshift(job);
          blockBackoffUntil = Date.now() + 30_000;
          logWarn(`${LOG} 429 rate-limited — backing off 30s`);
          showToast('Grindr rate-limited. Backing off 30s…', 'warn');
          return 'continue';
        }
        // Dead endpoint (501/405): the path is wrong, not the request — retrying
        // is futile and just spams Grindr. Drop the job (its dedupe-set entry too,
        // so a later click can re-try once the endpoint is fixed) and warn.
        if (ENDPOINT_WRONG_STATUSES.has(result.status)) {
          blockQueueSet.delete(jobKey);
          warnEndpointWrong(result.status);
          return 'continue';
        }
        // Permanent rejection (400/422): Grindr refused the request itself — almost
        // always a bad/invalid profile id. Retrying is futile (it will 400 every
        // time), so drop the job and its dedupe entry instead of looping forever.
        if (PERMANENT_REJECT_STATUSES.has(result.status)) {
          blockQueueSet.delete(jobKey);
          logWarn(`${LOG} Block rejected (${result.status}) for ${profileId} — invalid request (bad id?); dropping, no retry.`);
          showToast(`Block rejected (${result.status}) for ${profileId} — dropping`, 'err');
          return 'continue';
        }

        // Decide whether the block actually stuck.
        let stuck;          // true = confirmed applied; false = needs a retry
        if (!VERIFY_BLOCKS) {
          stuck = result.ok;                    // verification disabled → trust the POST
        } else {
          if (BLOCK_VERIFY_SETTLE_MS > 0) await new Promise(r => setTimeout(r, BLOCK_VERIFY_SETTLE_MS));
          const v = await verifyBlock(profileId, auth);
          noteApiCalls(2, job.bulk);   // the read-back hits both lists (blocks + hides)
          // Same abort check after the settle + read-back awaits, again BEFORE the
          // sessionDead re-queue just below.
          if (cancelledBlocks.has(profileId) || myGen !== queueGeneration) {
            cancelledBlocks.delete(profileId);
            blockQueueSet.delete(jobKey);
            logInfo(`${LOG} Block for ${profileId} aborted mid-flight (undo/clearQueue) — not retrying.`);
            return 'continue';
          }
          if (v.sessionDead) {
            blockSessionDead = true;
            noteAuthRejected(result.status);
            blockQueue.unshift(job);
            logWarn(`${LOG} Session dead during verify for ${profileId}. ${blockQueue.length} paused.`);
            showToast(`Grindr forced a re-login. ${blockQueue.length} pending until you sign back in.`, 'err');
            return 'break';
          }
          if (v.confirmed) {
            stuck = true;
          } else if (v.inconclusive) {
            // Couldn't get a trustworthy read-back (endpoint unreachable or
            // unparseable). Don't loop forever on a broken verify endpoint:
            // trust an OK POST, else treat as a real miss and retry.
            if (result.ok) { warnVerifyUntrusted('read-back unreachable/unparseable'); stuck = true; }
            else stuck = false;
          } else if (result.ok) {
            // POST said ok but the profile isn't in the fetched list. Usually
            // just propagation lag → retry. But if the POST keeps succeeding
            // while the read-back keeps not showing it, the list probably can't
            // see new blocks (paginated/filtered); after BLOCK_VERIFY_MAX_MISSES
            // trust the POST rather than retry an applied block forever.
            job.verifyMisses = (job.verifyMisses || 0) + 1;
            if (job.verifyMisses >= BLOCK_VERIFY_MAX_MISSES) {
              warnVerifyUntrusted(`read-back never listed the block after ${job.verifyMisses} tries`);
              stuck = true;
            } else {
              stuck = false;
            }
          } else {
            stuck = false;                      // POST failed AND not in list → genuinely not blocked
          }
        }

        // (In-flight abort is now checked right after the POST and right after the
        // verify awaits above, before any re-queue — there are no further awaits
        // between those checks and here, so no additional check is needed.)
        if (stuck) {
          blockQueueSet.delete(jobKey);
          // Optimistically record it as a REAL block. reconcile self-throttles to
          // once per 30 minutes, so without this the upgrade backlog would sit
          // unchanged for half an hour while the drain worked — indistinguishable
          // from nothing happening. The next reconcile corrects it either way.
          if (BLOCK_MODE === 'block') {
            try { serverBlockedIds.add(String(profileId)); saveServerBlocks(); refreshHud(); } catch (_e) {}
          }
          // A drain upgrade only counts as done when the authoritative walk agrees.
          if (job.bulk) awaitingUpgradeCheck.add(String(profileId));
          const tries = job.attempt || 0;
          logInfo(`${LOG} Block confirmed for ${profileId}${tries ? ` after ${tries} retr${tries === 1 ? 'y' : 'ies'}` : ''}`);
          showToast(`Blocked profile ${profileId}`, 'ok');
          // Collapse the exact card the user clicked (stored when the block was
          // started), then the photo-hash sweep as a backstop for recycled tiles.
          const entry = recentlyBlocked.get(profileId);
          // DIAGNOSTIC (v0.10.11): the API hide is confirmed server-side, so if the
          // card still shows, the failure is purely DOM. This line discriminates the
          // three causes in one click: connected=false → the clicked node was
          // recycled out of the virtualised grid (collapse hits an orphan);
          // hashCards=0 → the photo-hash backstop has no index entry for this
          // profile (removeBlockedCardFromDom is a no-op too); both healthy → the
          // collapse runs but React re-renders the inline style away.
          logInfo(`${LOG} confirm-DOM ${profileId}: entry=${!!entry} profileEl=${!!(entry && entry.profileEl)} connected=${!!(entry && entry.profileEl && entry.profileEl.isConnected)} hashCards=${findCardsForProfile(profileId).length}`);
          if (entry && entry.profileEl) collapseClickedCard(entry.profileEl);
          removeBlockedCardFromDom(profileId);
          clearSessionDeadIfSet();
        } else {
          scheduleBlockRetry(job, result.ok ? 'read-back says not blocked' : `POST ${result.status}`);
        }

    return 'next';
  }

  // Drain the rate-limited block/unblock queue. Honours backoff, the hourly cap,
  // the session-dead pause and in-flight aborts.
  async function processQueue() {
    logTrace(`${LOG} processQueue`);
    if (queueProcessing) return;
    queueProcessing = true;
    try {
      while (blockQueue.length) {
        // The 401/403 pause was documented but never enforced: blockSessionDead
        // was written in three places and read in none of them, so the next
        // unrelated enqueueAction (a re-block sweep, the text filter) restarted
        // this loop and fired another authed call into known-dead auth before
        // breaking again — the exact burst the queue exists to prevent.
        if (blockSessionDead) {
          logWarn(`${LOG} queue paused: session is dead (waiting for re-login).`);
          break;
        }
        const waitMs = Math.max(0, blockBackoffUntil - Date.now());
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

        // Rolling-hour caps, one per budget. A full drain window must NOT stop an
        // interactive job, so this no longer pauses the whole queue on a single
        // shared count — it only marks which buckets are spent, and the job picker
        // below skips jobs drawn on a spent bucket. The queue therefore keeps
        // running on interactive work while the drain waits out its own hour.
        pruneCallWindows();
        const manualCapped = HOURLY_CAPS_ENABLED && recentManualCalls.length >= MANUAL_HOURLY_CAP;
        const bulkCapped = HOURLY_CAPS_ENABLED && recentBulkCalls.length >= DRAIN_HOURLY_CAP;
        capWaitUntil = manualCapped ? recentManualCalls[0] + 3_600_000 : 0;
        if (manualCapped && bulkCapped) {
          // Both spent: nothing can run, so sleep until the earlier window rolls.
          const waitUntil = Math.min(recentManualCalls[0], recentBulkCalls[0]) + 3_600_000;
          const w = waitUntil - Date.now();
          logWarn(`${LOG} Both hourly budgets spent (manual ${MANUAL_HOURLY_CAP}, drain ${DRAIN_HOURLY_CAP}), waiting ${Math.round(w / 60000)}m`);
          showToast(`Block cap reached — pausing ${Math.round(w / 60000)}m.${autoDrain ? ' Turn the drain off to free the budget for manual blocks.' : ''}`, 'warn');
          refreshHud();
          await new Promise(r => setTimeout(r, Math.min(w, 60_000)));
          continue;
        }
        if (manualCapped) {
          // Only reachable by pressing block ~250 times in an hour, which is far
          // above any human rate — so this is a runaway guard, not a normal pause.
          logWarn(`${LOG} Interactive budget (${MANUAL_HOURLY_CAP}/hr) spent — manual blocks pause until the window rolls.`);
          showToast(`Manual block cap reached — pausing ${Math.round((capWaitUntil - Date.now()) / 60000)}m.`, 'warn');
          refreshHud();
        }

        // Pick the first job whose per-job retry backoff (notBefore) has
        // elapsed. Fresh jobs have no notBefore and are always ready; retried
        // blocks carry one. If every job is still backing off, sleep until the
        // soonest is ready (capped at 60s so we re-check caps/backoff/auth
        // periodically) and re-loop — this is what stops one backing-off block
        // from stalling unrelated jobs behind it.
        const now = Date.now();
        // A job is runnable when its own retry backoff has elapsed AND its budget
        // still has room. `capSpent` is what lets an interactive block overtake a
        // drain backlog that has exhausted its hour.
        const capSpent = (j) => (j.bulk ? bulkCapped : manualCapped);
        const readyIdx = nextRunnableIndex(blockQueue, now, manualCapped, bulkCapped);
        if (readyIdx < 0) {
          // Fold, don't spread: `Math.min(...arr)` throws RangeError once the queue
          // is large enough (a big drain backlog with everything backing off), which
          // would stall the queue until the next enqueue.
          //
          // A job held by a spent budget is ready when that window rolls, not when
          // its notBefore elapses — taking the later of the two keeps us from
          // spinning on a job the cap will refuse anyway.
          let soonest = Infinity;
          for (const j of blockQueue) {
            const w = j.bulk ? recentBulkCalls : recentManualCalls;
            const capReady = capSpent(j) ? (w.length ? w[0] : now) + 3_600_000 : 0;
            const t = Math.max(j.notBefore || 0, capReady);
            if (t < soonest) soonest = t;
          }
          await new Promise(r => setTimeout(r, Math.max(0, Math.min(soonest - now, 60_000))));
          continue;
        }
        const job = blockQueue.splice(readyIdx, 1)[0];   // { profileId, action, attempt?, notBefore? }
        const { profileId, action } = job;
        const jobKey = action + ':' + profileId;

        // Undo may have fired while this block sat in the queue waiting to
        // retry — if so, drop it before spending an API call.
        if (action === 'block' && cancelledBlocks.has(profileId)) {
          cancelledBlocks.delete(profileId);
          blockQueueSet.delete(jobKey);
          logInfo(`${LOG} Block for ${profileId} cancelled before send — skipping.`);
          continue;
        }

        const auth = getCapturedAuth();
        if (!auth) {
          // Keep the job — wait for the page to issue an API call so we
          // can capture fresh auth, then retry. Poll for up to 60s.
          blockQueue.unshift(job);
          logWarn(`${LOG} No captured auth yet — scroll the cascade or open a profile to refresh.`);
          showToast('Capturing Grindr auth… (scroll the cascade)', 'warn');
          let waited = 0;
          while (waited < 60_000 && !getCapturedAuth()) {
            await new Promise(r => setTimeout(r, 1000));
            waited += 1000;
          }
          if (!getCapturedAuth()) {
            logWarn(`${LOG} Gave up after 60s; queue retained for next attempt.`);
            break;
          }
          continue;
        }

        const directive = (action === 'unblock')
          ? await runUnblockJob(job, auth, jobKey)
          : await runBlockJob(job, auth, jobKey);
        if (directive === 'continue') continue;
        if (directive === 'break') break;
        await new Promise(r => setTimeout(r, MIN_INTERVAL_MS));
      }
    } finally {
      queueProcessing = false;
    }
  }

  // Add a block/unblock job for a profile and make sure the queue is running.
  // `action` is 'block' or 'unblock'. In LOCAL_ONLY mode no API call is ever
  // made — a block just hides the card and an unblock just acknowledges (the
  // caller does the visual restore). Otherwise the job is deduped via the Set
  // key, appended, and processQueue() is poked (fire-and-forget — it no-ops if
  // already running). Returns nothing; results surface via toasts/console.
  // `opts.bulk` marks a job the auto-drain created. Bulk work always queues BEHIND
  // anything you did by hand, so a block you just pressed is not stuck behind a
  // thousand migrations.
  function enqueueAction(profileId, action, opts) {
    const bulk = !!(opts && opts.bulk);
    logTrace(`${LOG} enqueueAction(${action} ${profileId}${bulk ? ' [bulk]' : ''})`);
    if (LOCAL_ONLY) {
      if (action === 'unblock') {
        logInfo(`${LOG} Local-only restore for ${profileId}`);
        showToast(`Restored ${profileId} (local-only)`, 'ok');
      } else {
        logInfo(`${LOG} Local-only hide for ${profileId}`);
        showToast(`Hidden ${profileId} (local-only)`, 'ok');
        removeBlockedCardFromDom(profileId);
      }
      return;
    }
    // Do not spend a write on a block that provably cannot land. Two cases, both
    // of which used to POST and leave the card sitting there — which is what
    // "middle-click blocking isn't working" actually was: a capture shows three
    // POSTs to the same id, all 200, against a profile already BLOCKED and HIDDEN,
    // so nothing changed and the tile stayed put.
    //
    //   * already in Grindr's own blocks list — it IS blocked; re-POSTing changes
    //     nothing (what the CONFIRMED tier is for);
    //   * retired as unconvertible — hidden server-side (hide and block are
    //     mutually exclusive) or a deleted account.
    //
    // This lives HERE, not in startBlock, because every gesture funnels through
    // enqueueAction — middle-click, shift+click, the hotkey, the text filter, the
    // drain and __grindrBlock_block. Putting it in one gesture's wrapper is the
    // mistake that made Home and middle-click behave differently once before.
    // The local hide is the useful part and is the half you can actually see.
    if (action === 'block' && !LOCAL_ONLY) {
      if (serverBlockedIds.has(profileId)) {
        logInfo(`${LOG} ${profileId} is already blocked on Grindr — hiding the card, not re-POSTing.`);
        removeBlockedCardFromDom(profileId);
        return;
      }
      if (isUnupgradeable(profileId)) {
        logInfo(`${LOG} ${profileId} will not accept a block (200 but never listed) — hiding it locally instead.`);
        addToHiddenList(profileId);
        removeBlockedCardFromDom(profileId);
        showToast(`${profileId} won't accept a block — hidden locally`, 'warn');
        return;
      }
    }
    const key = action + ':' + profileId;
    // Last-explicit-action-wins reconciliation, done BEFORE the dedup return so it
    // also applies while the OPPOSITE action for this profile is still in flight:
    //   • A fresh block clears any pending in-flight-abort flag (so an in-flight
    //     block that was about to abort instead proceeds) AND drops any queued
    //     unblock (so a prior undo can't later reverse this block). Without this,
    //     undo-then-re-block of a mid-flight profile silently dropped the re-block
    //     (deduped away) and left the profile unblocked while the UI said "Blocked".
    //   • Unblock needs no symmetric cleanup here: cancelQueuedBlock already drops
    //     or flags the block before the caller enqueues the unblock.
    if (action === 'block') {
      cancelledBlocks.delete(profileId);
      const ui = blockQueue.findIndex(j => j.action === 'unblock' && j.profileId === profileId);
      if (ui >= 0) { blockQueue.splice(ui, 1); blockQueueSet.delete('unblock:' + profileId); }
    }
    if (blockQueueSet.has(key)) return;
    blockQueueSet.add(key);
    const job = { profileId, action, bulk };
    // Bulk (auto-drain) work appends; interactive work goes to the very front, so
    // the newest press is served next and never waits behind a drain backlog. When
    // you press block the card is in front of you and you expect it gone now; an
    // interactive job enqueued a moment earlier has already left your attention.
    // Starvation is not a concern: interactive volume is human-paced and spaced
    // only by MIN_INTERVAL_MS, so that run of the queue drains in milliseconds
    // rather than accumulating the way the drain backlog does.
    blockQueue.splice(queueInsertIndex(blockQueue, bulk), 0, job);
    // Fire-and-forget, but surface a crash as a log line, not an unhandled rejection.
    processQueue().catch(err => logError(`${LOG} processQueue crashed:`, err));
  }

  // Reverse a block the user just undid, as cheaply as is safe. Returns true
  // only when it can guarantee no block ever reached Grindr (caller can skip the
  // unblock); returns false when a block may have landed (caller sends a real
  // unblock). Cases:
  //   • queued, never POSTed (attempt 0)  → splice it out, return true.
  //   • queued but already retried (>0)   → splice it out, return false (an
  //                                          earlier POST may have stuck).
  //   • in-flight (tracked but not queued)→ flag cancelledBlocks so processQueue
  //                                          aborts the retry loop, return false.
  //   • nothing tracked (already done)    → return false.
  function cancelQueuedBlock(profileId) {
    logTrace(`${LOG} cancelQueuedBlock(${profileId})`);
    const idx = blockQueue.findIndex(j => j.action === 'block' && j.profileId === profileId);
    if (idx >= 0) {
      const job = blockQueue[idx];
      blockQueue.splice(idx, 1);
      blockQueueSet.delete('block:' + profileId);
      cancelledBlocks.delete(profileId);
      return !(job.attempt > 0);   // true = never sent (skip unblock); false = maybe sent
    }
    // Not in the queue but still tracked → in-flight (mid POST/verify). Flag it
    // to abort the retry loop; the caller still sends an unblock to undo any
    // block that already landed (a DELETE no-ops harmlessly if it didn't).
    if (blockQueueSet.has('block:' + profileId)) {
      cancelledBlocks.add(profileId);
      logInfo(`${LOG} Block for ${profileId} is in-flight — flagged to abort; caller also sends an unblock.`);
    }
    return false;
  }

  // ── Multi-strategy profile-id resolution ─────────────────────────────────
  // The whole point of this section: turn a click event into a profileId. Every
  // helper returns a 7+ digit numeric string (Grindr profile IDs) or '' on miss.

  // Last-resort strategy: read the profileId straight out of React's internals.
  // React attaches a hidden fiber node to each host DOM element under a key like
  // `__reactFiber$<random>` (React 17+) or `__reactInternalInstance$<random>`
  // (older) — the suffix is per-build, so we match by prefix. From that fiber we
  // walk UP the tree via `fiber.return` (the parent fiber), because the clicked
  // leaf (an <img> or <div>) rarely holds the id but an ancestor component does.
  // At each level we inspect the usual prop/state bags (memoizedProps =
  // committed, pendingProps = in-progress, plus the component instance's
  // props/state) for a profileId under any of the common shapes. The 7+ digit
  // regex is the filter that distinguishes a real id from incidental numbers.
  // Both walks are bounded (depth < 30) so a deep tree can't spin. Fragile by
  // nature — it breaks if React renames these internals — hence it's the final
  // fallback, tried only after the DOM-based strategies miss.
  function findProfileIdInFiber(startEl) {
    logTrace(`${LOG} findProfileIdInFiber`);
    const keys = Object.keys(startEl).filter(
      k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (!keys.length) return '';
    let fiber = startEl[keys[0]];
    let depth = 0;
    while (fiber && depth < 30) {
      const sources = [fiber.memoizedProps, fiber.pendingProps, fiber.stateNode?.props, fiber.stateNode?.state];
      for (const props of sources) {
        if (!props || typeof props !== 'object') continue;
        const checks = [
          props.profileId,
          props.profile?.profileId,
          props.profile?.id,
          props.item?.profileId,
          props.item?.id,
          props.data?.profileId,
          props.data?.id,
          props.user?.profileId,
          props.user?.id,
          props.id,
        ];
        for (const v of checks) {
          const s = String(v || '');
          if (isPlausibleProfileId(s)) return s;
        }
      }
      fiber = fiber.return;
      depth++;
    }
    return '';
  }

  // A real Grindr profile id is a positive integer. OBSERVED ids (the signed-in
  // user + every working hide captured in HARs) are all 9 digits and well under
  // 1 billion: 500000000, 600000007, 600000008, 600000009. The previous 15-digit
  // ceiling was ~5× too loose: it waved through 12-digit NON-profile tokens that
  // the DOM attr-scan (strategy 5) surfaces — media ids, analytics/composite
  // tracking ids — e.g. 453789221432, which produced a doomed POST
  // /api/v1/me/hides/453789221432 that silently failed (the "hide only sometimes
  // works" bug). Capping at 10 digits rejects those so resolution falls through
  // to the authoritative React-fiber profileId instead of locking onto garbage.
  // (Headroom to 10 covers ids crossing 1 billion; raise only with evidence of a
  // real ≥11-digit id, not a scraped tracking token.)
  const MIN_PROFILE_ID_LEN = 5;
  const MAX_PROFILE_ID_LEN = 10;
  // True for a 5-10 digit numeric string. The gate every profile id must pass
  // before it reaches the API.
  function isPlausibleProfileId(id) {
    return typeof id === 'string'
      && /^\d+$/.test(id)
      && id.length >= MIN_PROFILE_ID_LEN
      && id.length <= MAX_PROFILE_ID_LEN;
  }

  // Resolve a click into { profileId, profileEl }, where profileEl is the
  // enclosing profile cell/card (used later to dim + remove it). Strategies run
  // in descending order of reliability and stop at the first that yields a valid
  // numeric id; profileId is '' (and profileEl may still be set) if all miss.
  // Strategies 0–1 also establish profileEl; 2–6 extract the id from within it:
  //   0 URL          — on a /chat/<id> route or ?profileId=, the id is explicit.
  //   1 container     — find the cell via data-testid/class/role selectors, with
  //                     a walk-up fallback keyed on a Grindr CDN photo URL.
  //   2 data attrs    — data-profile-id / data-conversation-id on the cell.
  //   3 /chat/ href   — an <a href="/chat/<id>"> inside or around the cell.
  //   4 photo hash    — map the cell's <img> hash back via the sniffed index.
  //   5 attr scan     — any attribute in the subtree holding a 7+ digit id.
  //   6 React fiber   — findProfileIdInFiber (last resort, see above).
  function resolveProfileIdFromClick(e) {
    logTrace(`${LOG} resolveProfileIdFromClick`);
    const target = e.target;
    if (!target || !(target instanceof Element)) return { profileId: '', profileEl: null };

    // Strategy 0: URL (we're on the profile page / chat for this person)
    // A /chat/<a>:<b> id is SORTED, so half[0] is the signed-in user roughly half
    // the time — this used to block or greet YOURSELF on a coin flip.
    // chatPeerIdFromPath already resolves the peer correctly for both shapes.
    const peerFromChat = chatPeerIdFromPath();
    if (isPlausibleProfileId(peerFromChat)) return { profileId: peerFromChat, source: 'chat-url' };
    const urlMatch = location.href.match(/\/chat\/(\d{6,})(?!:)/);
    const profileParam = new URLSearchParams(location.search).get('profileId');
    if (urlMatch || profileParam) {
      const pid = urlMatch?.[1] || profileParam || '';
      if (isPlausibleProfileId(pid)) return { profileId: pid, profileEl: target };
    }

    // Strategy 1: nearest profile container by data attrs / link / role
    let profileEl = target.closest(
      '[data-testid="cascadeCellContainer"], [data-profile-id], [data-conversation-id], ' +
      'a[href*="/chat/"], [class*="profile-card"], [class*="cascade-item"], ' +
      '[class*="profile-detail"], [class*="ProfileView"], [data-testid*="profile"], ' +
      '[class*="cascade-cell" i], [class*="cascade-grid" i] > div, ' +
      '[class*="cascade" i] [class*="cell" i], [class*="profile-tile" i], ' +
      '[role="article"][class*="profile" i], [data-testid*="cascade" i], ' +
      '[data-testid*="cell" i], [data-testid*="profileTile" i]'
    );

    // Walk-up fallback — any clicked element whose subtree contains a Grindr
    // CDN profile photo URL is almost certainly inside a profile card.
    if (!profileEl) {
      let node = target;
      for (let i = 0; node && i < 8; i++, node = node.parentElement) {
        // querySelector, not node.outerHTML: serializing the whole subtree to a
        // string is costly near the cascade root and this runs on the click path.
        // The substring matches both cdn. and cdns. grindr hosts.
        const hasProfilePhoto = node.querySelector && node.querySelector(
          'img[src*="grindr.com/images/profile"], img[src*=".cloudfront.net/profile"]'
        );
        if (hasProfilePhoto) {
          // ≥80px in both dimensions: big enough to be an actual profile cell,
          // not a tiny avatar thumbnail in a chat list row or notification.
          const r = node.getBoundingClientRect();
          if (r.width >= 80 && r.height >= 80) { profileEl = node; break; }
        }
      }
    }

    if (!profileEl) return { profileId: '', profileEl: null };

    // Strategy 2: data attrs
    let profileId = profileEl.getAttribute('data-profile-id')
      || profileEl.getAttribute('data-conversation-id')
      || '';

    // Strategy 3: /chat/ href
    if (!isPlausibleProfileId(profileId)) {
      const link = profileEl.querySelector('a[href*="/chat/"]') || profileEl.closest('a[href*="/chat/"]');
      const href = link?.getAttribute('href') || '';
      const m = href.match(/\/chat\/([^/?#]+)/);
      if (m) profileId = m[1];
    }

    // Strategy 4: photo hash → profileId map (built from sniffed API responses)
    if (!isPlausibleProfileId(profileId)) {
      const img = profileEl.querySelector('img[src*="cdns.grindr.com"]') || target.closest('img');
      const src = img?.getAttribute('src') || '';
      const hashMatch = src.match(/\/([a-f0-9]{32,})/i);
      if (hashMatch) {
        const mapped = photoHashToProfileId.get(hashMatch[1]);
        if (mapped) profileId = mapped;
      }
    }

    // Strategy 5: scan every attr in the cell subtree for a long numeric id.
    // `(?:^|[^0-9])([0-9]{7,})(?![0-9])` isolates a run of 7+ digits that is NOT
    // part of a longer number — so a real profile id is matched (group 1) but a
    // 13-digit timestamp or a longer media id embedded in some attribute is
    // rejected rather than truncated. A left-boundary group (not a lookbehind) is
    // used so the literal parses on engines lacking lookbehind (Safari <16.4).
    if (!isPlausibleProfileId(profileId)) {
      const candidates = [profileEl, ...profileEl.querySelectorAll('*')];
      for (const el of candidates) {
        const attrs = el.attributes;   // live NamedNodeMap — index it, no Array copy
        if (attrs) {
          for (let ai = 0; ai < attrs.length; ai++) {
            const m = String(attrs[ai].value || '').match(/(?:^|[^0-9])([0-9]{7,})(?![0-9])/);
            // Only accept a plausible id — keep scanning past a 20-digit tracking/
            // composite token instead of locking onto it.
            if (m && isPlausibleProfileId(m[1])) { profileId = m[1]; break; }
          }
        }
        if (isPlausibleProfileId(profileId)) break;
      }
    }

    // Strategy 6 (last resort): React fiber walk
    if (!isPlausibleProfileId(profileId)) profileId = findProfileIdInFiber(profileEl);

    if (!isPlausibleProfileId(profileId)) return { profileId: '', profileEl };
    return { profileId, profileEl };
  }

  // ── Block now, with a 30s un-block window ─────────────────────────────────
  // A middle-click blocks IMMEDIATELY (the card dims for instant feedback, then
  // the queue's success handler removes it). For UNDO_WINDOW_MS afterwards a
  // toast offers "Unblock": clicking it reverses the block and restores the
  // card. If the block is still queued unsent we just drop it (no API calls);
  // otherwise we enqueue a real DELETE un-hide/un-block. Either way the unblock
  // rides the SAME rate-limited queue, so a flurry of unblocks can't trip
  // Grindr's forced-logout any more than a flurry of blocks can.
  const recentlyBlocked = new Map(); // profileId -> { profileEl, prevStyle, toast, expireTimer }
  // The last profile blocked, kept beyond the 30-second Undo toast so the HUD can
  // still reverse it. The toast is deliberately short-lived; this is not.
  const LAST_BLOCK_STORAGE_KEY = 'grindrMiddleClickLastBlock_v1';
  let lastBlockedProfileId = '';
  let lastBlockedAt = 0;
  // Restore the most recently blocked id so the HUD can still undo it after a
  // reload.
  function loadLastBlocked() {
    const o = readJson(LAST_BLOCK_STORAGE_KEY, null, 'last block');
    if (o && isPlausibleProfileId(String(o.id || ''))) { lastBlockedProfileId = String(o.id); lastBlockedAt = Number(o.at) || 0; }
  }
  // Remember and persist the most recently blocked id.
  function noteLastBlocked(id) {
    lastBlockedProfileId = String(id || '');
    lastBlockedAt = Date.now();
    writeJson(LAST_BLOCK_STORAGE_KEY, { id: lastBlockedProfileId, at: lastBlockedAt }, 'last block');
  }
  // Forget the most recently blocked id.
  function clearLastBlocked() {
    lastBlockedProfileId = '';
    lastBlockedAt = 0;
    writeJson(LAST_BLOCK_STORAGE_KEY, {}, 'last block');
  }
  loadLastBlocked();

  // Dim a card to 25% as instant "blocking…" feedback on click — NOT removal. The
  // card only collapses once the hide is confirmed by its 200 (collapseClickedCard,
  // called from the success handler). The pre-click inline styles
  // (opacity/transition/display) are snapshotted and returned so undimCard can
  // restore the card exactly if the block is undone — display is captured too so a
  // restore works even after collapseClickedCard has set display:none.
  function dimCard(profileEl) {
    logTrace(`${LOG} dimCard`);
    if (!profileEl) return null;
    const prev = {
      opacity: profileEl.style.opacity,
      transition: profileEl.style.transition,
      display: profileEl.style.display,
    };
    profileEl.style.transition = 'opacity 0.2s';
    profileEl.style.opacity = '0.25';
    return prev;
  }

  // Collapse the exact element the user clicked once the block/hide is CONFIRMED:
  // fade opacity to 0 (0.2s) then set display:none so the grid closes the gap.
  // Acting on the clicked element (not the photo-hash lookup that can miss) makes
  // removal reliable. The collapse timer is stashed on the element so undimCard can
  // cancel it if undo fires mid-fade.
  function collapseClickedCard(el) {
    logTrace(`${LOG} collapseClickedCard`);
    if (!el) return;
    // Outermost wrapper, or the grid keeps a card-shaped hole where the profile was.
    const profileEl = outermostCardWrapper(el.closest ? (el.closest(CASCADE_CARD_SELECTOR) || el) : el);
    if (!profileEl) return;
    profileEl.style.transition = 'opacity 0.2s';
    profileEl.style.opacity = '0';
    try { clearTimeout(profileEl.__gbHideTimer); } catch (e) {}
    profileEl.__gbHideTimer = setTimeout(() => {
      try { profileEl.style.display = 'none'; } catch (e) {}
    }, 220);
  }

  // Reverse dim/collapse: cancel any pending collapse, restore display so the card
  // is back in layout, then restore opacity (animating the fade-back). The
  // transition override is cleared only after 220ms — a hair past the 0.2s fade —
  // so we don't cancel the animation mid-flight and leave the card stuck.
  function undimCard(profileEl, prev) {
    logTrace(`${LOG} undimCard`);
    if (!profileEl || !prev) return;
    try { clearTimeout(profileEl.__gbHideTimer); } catch (e) {}
    profileEl.style.display = prev.display || '';
    profileEl.style.opacity = prev.opacity || '';
    setTimeout(() => { profileEl.style.transition = prev.transition || ''; }, 220);
  }

  // Reverse of removeBlockedCardFromDom: bring any hidden card(s) back into view.
  function restoreBlockedCardInDom(profileId) {
    logTrace(`${LOG} restoreBlockedCardInDom(${profileId})`);
    try {
      for (const card of findCardsForProfile(profileId)) {
        card.style.display = '';
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '';
      }
    } catch (e) { logTrace(`${LOG} restoreBlockedCardInDom error:`, e); }
  }

  // Unblock toasts stack upward from the bottom-left (offset above the generic
  // status toast at bottom:20px) so several recent blocks are each undoable.
  function ensureUndoStack() {
    logTrace(`${LOG} ensureUndoStack`);
    const ID = 'grindr-block-undo-stack';
    let stack = document.getElementById(ID);
    if (!stack) {
      stack = document.createElement('div');
      stack.id = ID;
      stack.style.cssText =
        'position:fixed;bottom:72px;left:20px;z-index:1000000;' +
        'display:flex;flex-direction:column-reverse;gap:8px;align-items:flex-start;';
      (document.body || document.documentElement).appendChild(stack);
    }
    return stack;
  }

  // Build one interactive "Blocked X · Ns to undo" toast with an Undo button,
  // append it to the stack, and run a 1s countdown ticker. The button's click is
  // stopPropagation'd so it can't bubble into the page. Returns a handle whose
  // remove() clears the ticker, detaches the toast, and tears down the stack
  // container once it's empty. The caller (offerUnblock) owns the 30s lifetime;
  // this function only renders and reports the live countdown. Optional `meta`
  // ({name, photoUrl, text}, passed by auto-block) renders a richer card with the
  // profile's thumbnail, name, and a snippet of the matched text; a manual block
  // passes no meta and gets the original compact "Blocked <id>" toast.
  function makeUnblockToast(profileId, onUnblock, meta) {
    logTrace(`${LOG} makeUnblockToast(${profileId})`);
    const stack = ensureUndoStack();
    const toast = document.createElement('div');
    toast.style.cssText =
      'background:rgba(30,41,59,0.97);color:#fff;padding:10px 12px;border-radius:8px;' +
      'font-family:system-ui,sans-serif;font-size:12px;line-height:1.4;display:flex;' +
      'align-items:center;gap:10px;box-shadow:0 4px 12px rgba(0,0,0,0.4);' +
      'pointer-events:auto;max-width:340px;';

    // Thumbnail (auto-block only). no-referrer keeps Grindr's CDN from seeing the
    // page as referrer; an onerror just drops the broken <img> so the toast still
    // renders if the photo URL 404s or is blocked.
    if (meta && meta.photoUrl && isTrustedPhotoUrl(meta.photoUrl)) {
      const img = document.createElement('img');
      img.src = meta.photoUrl;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.style.cssText =
        'width:44px;height:44px;border-radius:6px;object-fit:cover;flex:none;background:#0f172a;';
      img.addEventListener('error', () => { img.remove(); });
      toast.appendChild(img);
    }

    // Info column: name (if known) + matched text snippet + live countdown.
    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;';

    if (meta && meta.name) {
      const nameEl = document.createElement('div');
      nameEl.textContent = meta.name;
      nameEl.style.cssText =
        'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      info.appendChild(nameEl);
    }

    if (meta && meta.text) {
      const textEl = document.createElement('div');
      textEl.textContent = meta.text;
      textEl.style.cssText =
        'opacity:0.8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
      info.appendChild(textEl);
    }

    const label = document.createElement('span');
    label.style.cssText = 'opacity:0.7;';
    let remaining = Math.round(UNDO_WINDOW_MS / 1000);
    // With a name shown above, the countdown line omits the id; the compact
    // (manual) toast keeps the original "Blocked <id>" wording verbatim.
    const who = (meta && meta.name) ? '' : ` ${profileId}`;
    const render = () => { label.textContent = `Blocked${who} · ${remaining}s to undo`; };
    render();
    info.appendChild(label);
    toast.appendChild(info);

    const btn = document.createElement('button');
    btn.textContent = meta ? 'Undo' : 'Unblock';
    btn.style.cssText =
      'background:#fff;color:#1e293b;border:none;border-radius:6px;padding:5px 12px;' +
      'font:600 12px system-ui,sans-serif;cursor:pointer;flex:none;';
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); onUnblock(); });

    toast.appendChild(btn);
    stack.appendChild(toast);

    const ticker = setInterval(() => { remaining = Math.max(0, remaining - 1); render(); }, 1000);

    return {
      remove() {
        clearInterval(ticker);
        toast.remove();
        if (!stack.children.length) stack.remove();
      },
    };
  }

  // Show the 30-second Undo toast for a block, with the profile's name and photo
  // when known.
  function offerUnblock(profileId, profileEl, prevStyle, meta, hiddenNodes) {
    logTrace(`${LOG} offerUnblock(${profileId})`);
    // One live offer per profile — replace any existing toast/timer.
    const existing = recentlyBlocked.get(profileId);
    if (existing) { clearTimeout(existing.expireTimer); existing.toast.remove(); }

    const dismiss = () => {
      const entry = recentlyBlocked.get(profileId);
      if (!entry) return;
      clearTimeout(entry.expireTimer);
      entry.toast.remove();
      recentlyBlocked.delete(profileId);
      return entry;
    };

    const onUnblock = () => {
      const entry = dismiss();
      if (!entry) return;
      // Explicit user undo: drop it from the persistent local block list so the
      // enforcement sweep stops re-hiding / re-blocking it.
      removeFromLocalBlockList(profileId);
      if (cancelQueuedBlock(profileId)) {
        logInfo(`${LOG} unblock — block for ${profileId} was still queued; cancelled before sending.`);
        showToast(`Block cancelled for ${profileId}`, 'ok');
      } else {
        logInfo(`${LOG} unblock requested for ${profileId}`);
        enqueueAction(profileId, 'unblock');
      }
      // Bring the card back now: restore the exact nodes we collapsed (covers the
      // hashCards=0 case), then the profileEl style, then any hash-indexed cards.
      for (const n of (entry.hiddenNodes || [])) { try { n.style.display = ''; n.style.opacity = ''; } catch (_e) {} }
      undimCard(entry.profileEl, entry.prevStyle);
      restoreBlockedCardInDom(profileId);
    };

    const toast = makeUnblockToast(profileId, onUnblock, meta);
    const expireTimer = setTimeout(() => {
      const entry = recentlyBlocked.get(profileId);
      if (!entry) return;
      entry.toast.remove();
      recentlyBlocked.delete(profileId);
    }, UNDO_WINDOW_MS);

    recentlyBlocked.set(profileId, { profileEl, prevStyle, toast, expireTimer, hiddenNodes });
  }

  // The shared entry point for every block gesture: dim, record locally, index
  // hashes, queue the block, hide the card, offer Undo.
  function startBlock(profileId, profileEl) {
    logTrace(`${LOG} startBlock(${profileId})`);
    // If this profile is already inside its undo window it's already dimmed and
    // tracked; re-dimming would snapshot the DIMMED style as "previous" and leave
    // the card stuck at 25% opacity after Undo. Reuse the original snapshot.
    const existing = recentlyBlocked.get(profileId);
    const prevStyle = existing ? existing.prevStyle : dimCard(profileEl);
    // App-faithful: one queued hide (block-fallback only if the hide fails), via
    // the rate-limited verify/retry queue. The v0.10.7–0.10.9 forced
    // hide→block→hide→block chain was removed in 0.10.10: a trailing block undoes
    // the hide (the app fires a LONE hide), and the real "sometimes fails" cause
    // was a malformed resolved id, now gated by the tightened isPlausibleProfileId.
    addToLocalBlockList(profileId);
    // Teach the photo-hash index about this profile from the very card that was
    // clicked. Without it a profile blocked via the fiber/attribute resolver has
    // no hash entry, and the enforcement sweep can never find its tile again.
    try {
      if (profileEl) {
        for (const img of profileEl.querySelectorAll(PROFILE_PHOTO_SELECTOR)) {
          const mm = String(img.getAttribute('src') || '').split(/[?#]/)[0].match(/\/([A-Za-z0-9._-]{10,})$/);
          if (mm && isUsableHash(mm[1])) cappedHashSet(mm[1], profileId);
        }
      }
    } catch (_e) {}
    enqueueAction(profileId, 'block');
    // Hide the card NOW, from the shared entry point. v0.44 put this in the
    // hotkey wrapper only, so Home hid the card and MIDDLE-CLICK — which calls
    // startBlock directly, as does shift+left-click and the text filter — did
    // not. Doing it here covers every gesture, which is what "block" should mean
    // regardless of how it was triggered.
    //
    // It is also the only thing that makes a block visible: Grindr keeps serving
    // profiles you have blocked until its own cascade refreshes, so nothing
    // disappears unless we remove it.
    const hiddenNodes = settings.hideCardOnBlock ? hideCardsForProfile(profileId, profileEl) : [];
    offerUnblock(profileId, profileEl, prevStyle, undefined, hiddenNodes);
  }

  // Collapse every card we can find for a profile — the element that was clicked
  // plus anything the photo-hash index knows about, since the virtualised grid
  // can render the same profile more than once. Always hides the OUTERMOST
  // layout wrapper (see outermostCardWrapper) or the space stays behind.
  function hideCardsForProfile(profileId, clickedEl) {
    const seen = new Set();
    // Last-resort element source. findCardsForProfile only knows profiles whose
    // photo hash has been indexed from a cascade payload, and a capture shows
    // blocks landing with hashCards=0 — nothing indexed, so nothing to hide. When
    // the caller also had no element, fall back to the tile under the pointer or
    // the one the keyboard cursor is on, but ONLY if it really is this profile:
    // an unverified fallback here is how the wrong card gets hidden.
    if (!clickedEl) {
      for (const cand of [lastHoverEl, hotkeyCursorEl]) {
        try {
          const cell = cand && cand.closest ? cand.closest(CASCADE_CARD_SELECTOR) : null;
          if (cell && cardBelongsToProfile(cell, profileId)) { clickedEl = cell; break; }
        } catch (_e) {}
      }
    }
    const hide = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const target = outermostCardWrapper(el);
      if (!target || seen.has(target)) return;
      seen.add(target);
      try {
        target.style.transition = 'opacity 0.2s';
        target.style.opacity = '0';
        target.style.display = 'none';
      } catch (_e) {}
    };
    try { for (const c of findCardsForProfile(profileId)) hide(c); } catch (_e) {}
    if (clickedEl) {
      // The clicked node may be an <img> or an inner wrapper rather than the cell.
      let cell = null;
      try { cell = clickedEl.closest ? clickedEl.closest(CASCADE_CARD_SELECTOR) : null; } catch (_e) {}
      hide(cell || clickedEl);
    }
    // Return the exact nodes we set display:none on (inner + outermost wrapper).
    // Undo must restore THESE — restoreBlockedCardInDom only knows hash-indexed
    // cards, and a block with hashCards=0 would otherwise stay invisible forever.
    return [...seen];
  }

  // ── Persistent block-list enforcement ──────────────────────────────────────
  // Keeps profiles on the local block list (see top of file) hidden as the
  // virtualised cascade re-renders them, and re-submits the block when one
  // genuinely reappears. blockedProfileIds / lastReblockAt and the interval
  // knobs are declared up top with the rest of the block-list state.
  let blockListEnforceTimer = 0;

  // Re-submit a block for a reappearing profile, guarded twice: skip if a block
  // for it is already queued/in-flight, and rate-limit to one re-block per
  // REBLOCK_MIN_INTERVAL_MS per profile so the sweep can't burst the API.
  function maybeReblock(profileId) {
    if (blockQueueSet.has('block:' + profileId)) return;
    // This is what the CONFIRMED tier is actually good for: Grindr's own list
    // says the block is applied, so re-POSTing it spends rate limit to change
    // nothing. We keep hiding the tile either way (see enforceAllBlocked).
    if (blockConfirmedIds.has(profileId)) { logTrace(`${LOG} ${profileId} reappeared but is confirmed blocked — hiding it, not re-POSTing.`); return; }
    // Same for one that has proven it will not take a block: re-POSTing on every
    // reappearance is exactly the doomed traffic the retirement exists to stop.
    if (isUnupgradeable(profileId)) { logTrace(`${LOG} ${profileId} reappeared but will not accept a block — hiding it only.`); return; }
    const now = Date.now();
    if (now - (lastReblockAt.get(profileId) || 0) < REBLOCK_MIN_INTERVAL_MS) return;
    lastReblockAt.set(profileId, now);
    logInfo(`${LOG} ${profileId} reappeared while on the local block list — re-submitting block.`);
    noteBlockLanded(profileId);   // demote out of CONFIRMED and restart its clock
    enqueueAction(profileId, 'block');
  }

  // One sweep over rendered tiles, collapsing any that belong to a blocked or
  // hidden profile. O(images), not O(list).
  function enforceAllBlocked() {
    if (SCRIPT_DISABLED) return;
    // Age out expired hides before enforcing, so a hide that just passed its
    // deadline isn't re-collapsed one last time on the way out.
    try { pruneHiddenList(); } catch (e) { logTrace(`${LOG} pruneHiddenList error:`, e); }
    if (!blockedProfileIds.size && !autoTextHiddenIds.size && !hiddenProfileIds.size) return;
    // Don't hide anything out from under an open modal/picker — see
    // grindrOverlayOpen(). The sweep is idempotent and runs again on the next
    // mutation, so skipping one pass costs nothing.
    if (grindrOverlayOpen()) return;
    try { promoteQuietBlocks(); } catch (e) { logTrace(`${LOG} promoteQuietBlocks error:`, e); }

    // INVERTED. This used to run per id: for each blocked/hidden profile, for each
    // of its 2-10 photo hashes, a document-wide querySelectorAll('img[src*=…]') —
    // an attribute-SUBSTRING match, which no selector index can serve, so the
    // engine visits every <img> on the page and scans its src. With a few hundred
    // ids that is thousands of full-document scans every 3 seconds, and nearly all
    // of them find nothing, because the virtualised grid only renders a few dozen
    // tiles at a time.
    //
    // Now it runs per RENDERED TILE: one querySelectorAll for the images actually
    // on screen, then an O(1) photoHashToProfileId lookup per image and a Set
    // membership test. O(ids x hashes x imgs) becomes O(imgs), and the block list
    // can grow without the sweep getting slower.
    // ENFORCE EVERY BLOCK, not just the pending ones. v0.31 skipped CONFIRMED ids
    // here on the premise that once Grindr's hide propagates it stops sending
    // that profile at all. A capture disproves it: a block reported "confirmed"
    // and the profile was still in the feed, before AND after a refresh. So a
    // server-side hide does NOT reliably remove a profile from the cascade, and
    // trusting it to meant we stopped hiding the tile ourselves — turning a
    // working block into one that "says it worked" and visibly didn't.
    //
    // The tiers are still worth keeping, but only for what they can actually
    // prove: CONFIRMED means "don't bother re-POSTing this block" (see
    // maybeReblock), never "stop enforcing it". And it costs nothing to enforce
    // all of them now, because the sweep below is one pass over rendered tiles
    // whose per-id work is a Set lookup — the whole reason the inversion was
    // worth doing.
    const blockedSet = blockedProfileIds;
    if (!blockedSet.size && !autoTextHiddenIds.size && !hiddenProfileIds.size) return;

    let imgs = [];
    try { imgs = document.querySelectorAll(PROFILE_PHOTO_SELECTOR); } catch (_e) { return; }
    const reappeared = new Set();
    let swept = 0;
    let collapsed = 0;
    let noCard = 0;
    for (const img of imgs) {
      const src = String(img.getAttribute('src') || '');
      if (!src) continue;
      const m = src.split(/[?#]/)[0].match(/\/([A-Za-z0-9._-]{10,})$/);
      if (!m) continue;
      // Hash lookup ONLY. v0.36 added a fallback here that ran
      // resolveProfileIdFromClick against the tile when the hash was unknown —
      // and that resolver is deliberately generous: when a tile yields nothing
      // it falls back to context (the open profile, the last profile fetched).
      // In a sweep that is catastrophic, because the answer is the SAME id for
      // every unresolved tile. A capture caught it exactly: the instant one
      // profile was blocked, `matched` jumped from 0 to 49 — one real tile plus
      // ~48 unrelated photos all "resolving" to the id just blocked — and the
      // fallback then CACHED each of those wrong pairings into the photo-hash
      // index via cappedHashSet, corrupting the one structure the whole
      // resolver chain trusts.
      //
      // The problem it was added for (hashCards=0) turned out to be the dead
      // cascade selector, fixed properly in cardForImage. The hash index is
      // populated from every cascade payload, so a tile Grindr rendered is a
      // tile we have a hash for; one we do not is not worth guessing at.
      const pid = photoHashToProfileId.get(m[1]);
      if (!pid) continue;
      const isBlocked = blockedSet.has(pid);
      const isHidden = autoTextHiddenIds.has(pid) || hiddenProfileIds.has(pid);
      if (!isBlocked && !isHidden) continue;
      swept += 1;
      // Profiles inside their 30s Undo window are already dimmed and undoable;
      // stomping display:none here would fight that UI.
      if (recentlyBlocked.has(pid)) continue;
      const card = cardForImage(img);
      if (!card) { noCard += 1; continue; }
      if (card.style.display !== 'none') {
        card.style.transition = 'opacity 0.2s';
        card.style.opacity = '0';
        card.style.display = 'none';
        collapsed += 1;
        // Only a BLOCK that rendered visibly again is evidence the server-side
        // block hasn't stuck; a local-only hide is expected to keep arriving.
        if (isBlocked) reappeared.add(pid);
      }
    }
    // ── Second pass: tiles the image-driven pass cannot see ──────────────────
    // The loop above starts from profile PHOTOS and walks up to the card, so a
    // tile whose photo is not a photo is invisible to it. Grindr renders the grey
    // silhouette for a profile with no public picture as an inline
    // `data:image/svg+xml` <img>, which matches none of PROFILE_PHOTO_SELECTOR's
    // host patterns and carries no hash to index. A live inspection of the grid
    // found 13 of 30 tiles in that state, 7 of them identifiable — so roughly
    // FOUR IN TEN tiles could never be hidden, and a blocked profile with no
    // picture stayed on screen forever. That is what made "already blocked" the
    // answer to pressing End on a visible card.
    //
    // So walk the cards themselves and resolve each id from the React fiber, the
    // authoritative source. This is safe where the geometry fallback was not: a
    // cascade card is a grid tile by definition, so there is no way to wander
    // into the chat sidebar the way v0.38 did. Cards already handled above are
    // skipped by the display check, and a card we cannot identify is left alone.
    let cardSwept = 0;
    let cardCollapsed = 0;
    try {
      for (const card of document.querySelectorAll(CASCADE_CARD_SELECTOR)) {
        if (card.style.display === 'none') continue;          // already gone
        if (card.querySelectorAll(PROFILE_PHOTO_SELECTOR).length) continue;   // the pass above owns it
        let pid = '';
        try { pid = findProfileIdInFiber(card) || ''; } catch (_e) { continue; }
        if (!isPlausibleProfileId(pid)) continue;
        const isBlocked = blockedSet.has(pid);
        const isHidden = autoTextHiddenIds.has(pid) || hiddenProfileIds.has(pid);
        if (!isBlocked && !isHidden) continue;
        cardSwept += 1;
        if (recentlyBlocked.has(pid)) continue;               // inside its Undo window
        const target = outermostCardWrapper(card);
        if (!target || target.style.display === 'none') continue;
        target.style.transition = 'opacity 0.2s';
        target.style.opacity = '0';
        target.style.display = 'none';
        cardCollapsed += 1;
        if (isBlocked) reappeared.add(pid);
      }
    } catch (e) { logTrace(`${LOG} cascade-card sweep error:`, e); }

    for (const pid of reappeared) {
      try { maybeReblock(pid); } catch (e) { logTrace(`${LOG} maybeReblock error:`, e); }
    }
    // Report what the sweep actually did. A 50-second capture in which blocks
    // "worked" but profiles stayed on screen contained NO sweep output at all,
    // so there was no way to tell whether it was running, finding no tiles, or
    // finding them and failing to collapse them.
    diagEvent('sweep', { imgs: imgs.length, matched: swept, hidden: collapsed, noCard,
      cardMatched: cardSwept, cardHidden: cardCollapsed,
      blocked: blockedSet.size, hidden_list: hiddenProfileIds.size });
  }

  // Coalesce bursts of mutations/payloads into a single sweep per quiet window.
  function scheduleEnforce() {
    clearTimeout(blockListEnforceTimer);
    blockListEnforceTimer = setTimeout(enforceAllBlocked, ENFORCE_DEBOUNCE_MS);
  }

  // Wire the enforcement up at boot: a debounced MutationObserver (the cascade
  // re-inserts tiles on scroll), a periodic backstop, and one initial sweep.
  function installBlockListEnforcement() {
    try {
      const obs = new MutationObserver(() => { if (!SCRIPT_DISABLED) scheduleEnforce(); });
      installedObservers.push(obs);
      // documentElement always exists at document-start; subtree covers <body>
      // and the cascade once the SPA mounts.
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { logWarn(`${LOG} block-list observer install failed:`, e); }
    installedIntervals.push(setInterval(enforceAllBlocked, BLOCKLIST_SWEEP_MS));
    scheduleEnforce();
  }

  // Panic button from DevTools: unblock every profile still inside its undo window.
  function unblockAllRecent() {
    logTrace(`${LOG} unblockAllRecent`);
    const ids = [...recentlyBlocked.keys()];
    for (const id of ids) {
      const entry = recentlyBlocked.get(id);
      if (!entry) continue;
      clearTimeout(entry.expireTimer);
      entry.toast.remove();
      recentlyBlocked.delete(id);
      // Mirror the single-toast Undo (offerUnblock's onUnblock): drop it from the
      // persistent local block list too, or the enforcement backstop would re-hide and
      // re-submit the block within BLOCKLIST_SWEEP_MS — silently reversing this undo.
      removeFromLocalBlockList(id);
      if (!cancelQueuedBlock(id)) enqueueAction(id, 'unblock');
      for (const n of (entry.hiddenNodes || [])) { try { n.style.display = ''; n.style.opacity = ''; } catch (_e) {} }
      undimCard(entry.profileEl, entry.prevStyle);
      restoreBlockedCardInDom(id);
    }
    logInfo(`${LOG} undoAll — reversed ${ids.length} recent block(s).`);
    return ids.length;
  }
  window.__grindrBlock_undoAll = unblockAllRecent;

  // The bridge from a raw click event to a block. Resolves the profileId; if
  // nothing matched, logs a diagnostic (target tag/class + URL, handy for adding
  // selectors later) and bails WITHOUT preventDefault so the click behaves
  // normally. On a hit it calls preventDefault — suppressing the middle-click
  // autoscroll (and, for a shift+left-click, the text selection) — then starts the
  // block. Returns true when it acted (blocked or sent a greeting) and false when
  // it bailed, so the caller can decide whether to swallow the follow-up click.
  function attemptBlock(e) {
    logTrace(`${LOG} attemptBlock`);
    // Chat greeting: a block gesture inside a chat composer sends a random canned
    // greeting instead of blocking. On the cascade grid there's no composer, so
    // this is false and we fall through to blocking. Find the composer ONCE and
    // reuse it for both the gate and the send, instead of scanning the DOM twice.
    const composer = findChatComposer();
    if (composer && isInChatComposerArea(e.target, composer)) {
      e.preventDefault();
      e.stopPropagation();
      sendGreetingInChat(composer);
      return true;
    }
    const { profileId, profileEl } = resolveProfileIdFromClick(e);
    if (!profileId) {
      const t = e.target;
      logWarn(`${LOG} no profile container matched. target=${t?.tagName}.${(t?.className?.toString() || '').slice(0, 60)} url=${location.href}`);
      return false;
    }
    e.preventDefault();
    logInfo(`${LOG} block on ${profileId} — 30s unblock window`);
    startBlock(profileId, profileEl);
    return true;
  }

  // ── Chat greeting send (ported from the Sniffies soft-filter userscript) ───
  // Self-contained: no Grindr API, no auth, no network. It fills the page's
  // visible chat composer and submits it, the same way the Sniffies script does.
  //
  // ⚠️ UNVERIFIED DOM: built WITHOUT a web.grindr.com chat snapshot, so composer
  // and Send-button detection are heuristic (placeholder/aria text + element type
  // + viewport position). If it ever grabs the wrong field on a real chat, tighten
  // findChatComposer()/clickSendButton() with an observed selector.
  let lastGreetAt = 0;
  let lastGreeting = '';

  // The script's own toasts both use the `grindr-block-` id prefix; skip them so
  // composer/button scans never pick our own UI.
  function isOwnGreetUi(el) {
    return !!(el && el.closest && el.closest('[id^="grindr-block-"]'));
  }

  // In-DOM, not disabled, not display:none/hidden/~transparent, larger than 1x1.
  function isVisibleEl(el) {
    if (!el || !(el instanceof Element)) return false;
    if (!document.body || !document.body.contains(el)) return false;
    if (el.hasAttribute('disabled')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.01) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  // Find the page's chat composer: score visible textareas / text inputs /
  // contenteditables by message/chat placeholder+aria, element type, and being in
  // the lower part of the viewport. Returns the best match or null.
  // The floating chat drawer, identified by controls only it has. Bounded to a few
  // ancestors so this cannot match a container common to the whole page.
  const CHAT_DRAWER_MARKERS = '[aria-label="close drawer" i], [aria-label="Open chat list" i], [data-testid^="chat-button"]';
  // True when an element sits inside the floating chat drawer, identified by
  // controls only it has.
  function isInsideChatDrawer(el) {
    try {
      let node = el && el.parentElement;
      for (let i = 0; i < 5 && node && node !== document.body; i += 1, node = node.parentElement) {
        if (node.querySelector(CHAT_DRAWER_MARKERS)) return true;
      }
    } catch (_e) {}
    return false;
  }

  // Pick the message box. Scores candidates, refuses search fields, and skips
  // the chat drawer when it holds someone else.
  function findChatComposer() {
    const candidates = Array.from(
      document.querySelectorAll("textarea, input[type='text'], [contenteditable='true'], [contenteditable='']")
    ).filter(isVisibleEl).filter((el) => !isOwnGreetUi(el));
    if (!candidates.length) return null;
    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      const ph = String(el.getAttribute('placeholder') || '').toLowerCase();
      const aria = String(el.getAttribute('aria-label') || '').toLowerCase();
      const name = `${ph} ${aria} ${String(el.getAttribute('name') || '')} ${String(el.getAttribute('type') || '')}`.toLowerCase();
      // A search box is the one field that must never be mistaken for a
      // composer: it sits on the same screens, takes text the same way, and
      // typing a greeting into it would look like the greet silently failing.
      if (/(search|filter|find|url|email|password|phone|zip|postal)/.test(name)) continue;
      // The floating chat DRAWER needs care rather than a blanket refusal. Both
      // composers can be on screen at once — the profile's own "Say something..."
      // (input, ~1152px) and the drawer's (textarea, ~296px) — and the scorer
      // preferred the drawer purely because TEXTAREA earns +2, which would have
      // typed into whatever conversation the drawer had open.
      //
      // But the drawer is ALSO the normal way to start a conversation with
      // someone new, so refusing it outright (v0.42) would break the main use
      // case. Refuse it only when it is demonstrably showing a DIFFERENT
      // conversation than the profile we have open; otherwise it is the right
      // box and the profile's composer simply wins on being the more specific one.
      let score = 0;
      if (isInsideChatDrawer(el)) {
        const peer = openProfilePeerId();
        if (isProfileOverlayOpenFromUrl() && peer && greetTargetId && peer !== String(greetTargetId)) {
          logTrace(`${LOG} findChatComposer: chat drawer holds ${peer}, not ${greetTargetId} — skipping it`);
          continue;
        }
        score -= 2;   // cancel the textarea bonus so the profile's own box wins a tie
      }
      if (ph.includes('message') || ph.includes('chat') || ph.includes('say')) score += 4;
      if (aria.includes('message') || aria.includes('chat')) score += 4;
      if (el.tagName === 'TEXTAREA' || el.isContentEditable) score += 2;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight * 0.45) score += 1;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    // FLOOR. Before v0.28 this returned the highest scorer even at score 0, so
    // any visible text input anywhere would do — the function could not say "no
    // composer here", only "here is the least-bad field". 3 is the lowest score a
    // real composer can earn: a message/chat name is 4 on its own, and an unnamed
    // textarea or contenteditable in the lower half of the viewport is 2 + 1.
    // A bare input with no naming and no position scores 0 and is now rejected.
    if (bestScore < 3) {
      logTrace(`${LOG} findChatComposer: best candidate scored ${bestScore} (<3) — treating as "no composer".`);
      return null;
    }
    return best;
  }

  // Chat-scope ancestors used to decide "is this click inside the chat window?"
  const CHAT_SCOPE_SELECTOR = [
    "[data-testid*='message']", "[class*='message']", "[class*='chat']",
    "[class*='conversation']", "[class*='thread']", 'form'
  ].join(', ');

  // True when a composer exists AND the click target shares a chat-scope ancestor
  // with it (or is the composer). This is the gate that preserves the cascade
  // grid's block behaviour: no composer on the grid → false → attemptBlock blocks.
  function isInChatComposerArea(target, composer) {
    if (!target || !(target instanceof Element)) return false;
    if (isOwnGreetUi(target)) return false;
    if (!composer) composer = findChatComposer();   // fallback if called without one
    if (!composer) return false;
    const roots = [composer];
    let node = composer;
    for (let depth = 0; node && node instanceof Element && depth <= 8; depth += 1) {
      if (node.matches && node.matches(CHAT_SCOPE_SELECTOR) && !roots.includes(node)) roots.push(node);
      node = node.parentElement;
    }
    return roots.some((root) => root === target || root.contains(target));
  }

  // Pick a random greeting, avoiding an immediate repeat when more than one exists.
  // The greeting list, editable from the HUD. An empty override means "use the
  // built-in list", so clearing your edits restores the defaults rather than
  // leaving you with nothing to send.
  const GREETINGS_STORAGE_KEY = 'grindrMiddleClickGreetings_v1';
  let greetingsOverride = null;
  // Restore a user-edited greeting list, if any.
  function loadGreetings() {
    const a = readJson(GREETINGS_STORAGE_KEY, null, 'greetings');
    greetingsOverride = (Array.isArray(a) && a.length) ? a.map(String) : null;
  }
  // The greeting list in force: the user's if set, otherwise the built-in one.
  function activeGreetings() { return greetingsOverride || GREETINGS; }
  // Replace the greeting list. An empty list restores the built-in one.
  function setGreetings(list) {
    const clean = (Array.isArray(list) ? list : String(list || '').split('\n'))
      .map((x) => String(x || '').trim()).filter(Boolean);
    greetingsOverride = clean.length ? clean : null;
    writeJson(GREETINGS_STORAGE_KEY, greetingsOverride || [], 'greetings');
    logInfo(`${LOG} greeting list set to ${clean.length} phrase(s)${clean.length ? '' : ' — back to the built-in list'}`);
    refreshHud();
    return activeGreetings();
  }
  loadGreetings();

  // Choose a greeting at random, avoiding an immediate repeat, with time tokens
  // resolved.
  function pickGreeting() {
    const pool = activeGreetings().map((s) => String(s || '').trim()).filter(Boolean);
    if (!pool.length) return '';
    let choices = pool;
    if (pool.length > 1 && lastGreeting) {
      const filtered = pool.filter((p) => p.toLowerCase() !== lastGreeting.toLowerCase());
      if (filtered.length) choices = filtered;
    }
    const raw = choices[Math.floor(Math.random() * choices.length)] || '';
    // Remember the RAW phrase (with its tokens) so the no-immediate-repeat check
    // compares like with like across a time-of-day boundary.
    lastGreeting = raw;
    return resolveGreetingTokens(raw);
  }

  // Type text into the composer (contenteditable or value-based) and fire the
  // input/change events frameworks listen for. For value-based inputs it goes
  // through the NATIVE value setter, because Grindr is React and React tracks an
  // overridden setter — assigning el.value directly would not trip onChange.
  function fillComposer(el, text) {
    if (!el) return false;
    const value = String(text || '');
    try {
      if (el.isContentEditable) {
        el.focus();
        el.textContent = value;
        try { el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' })); }
        catch (_e) { el.dispatchEvent(new Event('input', { bubbles: true })); }
        return true;
      }
      if ('value' in el) {
        el.focus();
        try {
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(el, value); else el.value = value;
        } catch (_e) { el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (_e) {}
    return false;
  }

  // Click a visible Send button scoped near the composer (text/aria/title 'send').
  // What the composer currently holds, for both input and contenteditable forms.
  // The single most useful signal in this whole flow: Grindr clears the box when
  // a message actually goes out, and leaves it alone when one doesn't.
  function composerText(el) {
    if (!el) return '';
    try { return String(el.isContentEditable ? (el.textContent || '') : (el.value || '')).trim(); }
    catch (_e) { return ''; }
  }

  // Controls that sit in the composer row and are NOT the send button. Grindr's
  // location button is the trap: a HAR of a failed greet shows the typing POST
  // (our fill working) and then, 68ms later — exactly the setTimeout in
  // typeAndSendGreeting — a fetch of assets/MapWithDot-*.js, the location
  // picker's map chunk. The old matcher used aria.includes('send'), and the
  // location control's accessible name contains the word "Send" ("Send
  // Location", as the panel's own button is labelled in the screenshot). Being
  // left of the input, it also came FIRST in DOM order, so it won every time.
  const NOT_SEND_BUTTON_RE = /(location|photo|image|camera|album|gif|sticker|emoji|attach|file|voice|audio|video|tap|gift|boost|profile|block|report)/i;
  // The real button's accessible name is the whole word, not a fragment of a
  // longer phrase. Anchored alternatives only — this is what stops "Send
  // Location" from matching while "Send message" still does.
  const SEND_BUTTON_TEXT_RE = /^(send|send message|send chat|submit)$/i;
  // How far up from the composer to look when it has no chat-ish ancestor.
  // Six levels reaches the chat panel on the current build without reaching the
  // page chrome.
  const SEND_SCOPE_MAX_ANCESTORS = 6;

  // Find and click the composer's send button. Three rules, in order of how much
  // each one saved us: reject anything whose name names an attachment type,
  // require an exact send-ish name rather than a substring, and prefer the
  // candidate that comes AFTER the input in document order (the send button sits
  // to the right of the box; the attachment row sits to its left).
  function findSendButton(inputEl) {
    // Scope, with a bounded fallback. Live inspection of the chat view settles
    // why every greet has been sending via Enter instead of the button: the
    // composer is <input type="text" placeholder="Say something..."> and it has
    // NO ancestor matching form / [class*=chat] / [class*=message] /
    // [class*=conversation] — Grindr's classes are styled-components hashes — so
    // this returned null every single time and the caller fell through to the
    // Enter fallback.
    //
    // A page-wide search is still refused (that is how "Send Location" was
    // clicked in v0.26). Instead, walk a BOUNDED number of ancestors and search
    // there. Measured on the live page that scope yields exactly ONE candidate,
    // "Send" — the location, gif, saved-phrases and tap buttons are all rejected
    // by the anchored name test — and clicking it sends and clears the composer.
    let scope = inputEl && inputEl.closest("form, [class*='chat'], [class*='message'], [class*='conversation']");
    if (!scope && inputEl) {
      let node = inputEl.parentElement;
      for (let i = 0; i < SEND_SCOPE_MAX_ANCESTORS && node && node !== document.body; i += 1, node = node.parentElement) scope = node;
      if (scope) logTrace(`${LOG} findSendButton: no chat-scope ancestor — using a bounded ${SEND_SCOPE_MAX_ANCESTORS}-level scope`);
    }
    if (!scope) { logTrace(`${LOG} findSendButton: no usable scope — refusing a page-wide search`); return null; }
    let buttons = [];
    try { buttons = Array.from(scope.querySelectorAll("button, [role='button']")); } catch (_e) { return null; }
    const named = (btn) => [
      String(btn.getAttribute('aria-label') || ''),
      String(btn.getAttribute('title') || ''),
      String(btn.getAttribute('data-testid') || ''),
      String(btn.textContent || ''),
    ].map((x) => x.trim()).filter(Boolean);

    // NOTE: a disabled Send button is not disqualifying. Grindr disables it
    // while the composer is empty and enables it on the first input event, and
    // we always fill before we look — confirmed live: disabled:true with an
    // empty box, disabled:false once the text is in.
    const candidates = buttons.filter(isVisibleEl).filter((b) => !isOwnGreetUi(b)).filter((b) => !isAppChrome(b)).filter((btn) => {
      const names = named(btn);
      if (names.some((n) => NOT_SEND_BUTTON_RE.test(n))) return false;
      return names.some((n) => SEND_BUTTON_TEXT_RE.test(n));
    });
    if (!candidates.length) return null;
    if (!inputEl || candidates.length === 1) return candidates[0];
    // DOCUMENT_POSITION_FOLLOWING (4) === "btn comes after the input".
    const after = candidates.filter((btn) => {
      try { return !!(inputEl.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING); }
      catch (_e) { return false; }
    });
    return (after[0] || candidates[0]);
  }

  // Click the composer's send button. Returns whether one was found and clicked,
  // NOT whether anything sent.
  function clickSendButton(inputEl) {
    const btn = findSendButton(inputEl);
    if (!btn) return false;
    try { btn.click(); } catch (_e) { return false; }
    return true;
  }

  // Fallback: simulate Enter to submit, when no Send button is found.
  function pressEnter(inputEl) {
    if (!inputEl) return false;
    try {
      inputEl.focus();
      for (const type of ['keydown', 'keypress', 'keyup']) {
        inputEl.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
      return true;
    } catch (_e) { return false; }
  }

  // Orchestrator: pick a greeting, fill the composer, send it (Send button → Enter
  // fallback), and toast the result. Cooldown-guarded so the dual mousedown+auxclick
  // firing of one physical middle-click sends only once.
  function sendGreetingInChat(composer) {
    const tnow = Date.now();
    if (tnow - lastGreetAt < GREETING_COOLDOWN_MS) return;
    lastGreetAt = tnow;
    if (!composer) composer = findChatComposer();   // fallback if called without one
    if (!composer) { showToast('No chat composer found', 'warn'); return; }
    const phrase = pickGreeting();
    if (!phrase) { showToast('No greetings configured', 'warn'); return; }
    if (!fillComposer(composer, phrase)) { showToast('Could not fill the chat box', 'err'); return; }
    // Let the app register the input before submitting.
    setTimeout(() => {
      watchForGreetFrame(phrase, 'inline');
      submitComposer(composer, phrase, (sent, how) => {
        if (sent) { logInfo(`${LOG} greeting sent via ${how}: "${phrase}"`); showToast(`Sent: ${phrase}`, 'ok'); }
        else { logWarn(`${LOG} greeting typed but NOT sent — the composer still holds the text.`); showToast(`Typed "${phrase}" — press Enter to send`, 'warn'); }
      });
    }, 60);
  }

  // ── Shift+right-click → greet a profile (ported from the Sniffies model) ────
  // A LOCAL-only pending-greeting map (this script is @grant none, so no GM
  // storage): profileId -> { phrase, ts }. Stale entries (older than
  // GREET_PENDING_MAX_AGE_MS) are pruned on load so a greeting queued in a long-
  // closed session never fires later.
  const pendingGreets = Object.create(null);   // profileId -> { phrase, ts }
  // Restore queued greetings, discarding any older than
  // GREET_PENDING_MAX_AGE_MS.
  function loadPendingGreets() {
    try {
      const raw = localStorage.getItem(PENDING_GREET_STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        const cutoff = Date.now() - GREET_PENDING_MAX_AGE_MS;
        for (const id of Object.keys(obj)) {
          const row = obj[id];
          if (row && typeof row.phrase === 'string' && typeof row.ts === 'number' && row.ts >= cutoff) {
            pendingGreets[id] = { phrase: row.phrase, ts: row.ts };
          }
        }
      }
    } catch (e) { logWarn(`${LOG} loadPendingGreets failed:`, e); }
  }
  // Persist the queued-greeting map.
  function savePendingGreets() {
    try { localStorage.setItem(PENDING_GREET_STORAGE_KEY, JSON.stringify(pendingGreets)); }
    catch (e) { logWarn(`${LOG} savePendingGreets failed:`, e); }
  }
  // Queue a greeting for a profile whose chat is about to open.
  function queuePendingGreet(profileId, phrase) {
    const id = String(profileId || '');
    const text = String(phrase || '').trim();
    if (!isPlausibleProfileId(id) || !text) return null;
    const row = { phrase: text, ts: Date.now() };
    pendingGreets[id] = row;
    savePendingGreets();
    return row;
  }
  // Read a queued greeting without consuming it.
  function readPendingGreet(profileId) {
    const row = pendingGreets[String(profileId || '')];
    return (row && typeof row.phrase === 'string') ? row : null;
  }
  // Read and remove a queued greeting.
  function consumePendingGreet(profileId) {
    const id = String(profileId || '');
    const row = readPendingGreet(id);
    if (!row) return null;
    delete pendingGreets[id];
    savePendingGreets();
    return row;
  }
  // A stray /chat/<id>?grindrGreet=1 link (bookmarked or shared) must not auto-send
  // a greeting queued for a DIFFERENT visit. This lightweight, non-crypto token
  // binds the request to the exact queued entry (id + queue timestamp); it is a
  // mismatch guard, not a security boundary.
  function makeGreetToken(id, ts) { return `${id}.${ts}`; }
  loadPendingGreets();

  // Self-close a tab we opened for an auto-greet, mirroring the Sniffies tab-closer:
  // window.close() only works on script-opened windows, so the about:blank + close
  // retry covers browsers that ignore the first call.
  function maybeCloseGreetTab() {
    setTimeout(() => {
      try { window.close(); } catch (_e) {}
      setTimeout(() => {
        try { if (!window.closed) { window.open('about:blank', '_self'); window.close(); } }
        catch (_e) {}
      }, 250);
    }, GREET_TAB_CLOSE_DELAY_MS);
  }

  // Queue a random greeting for `profileId` and open its chat so the arriving tab
  // auto-sends it. Prefers a new tab (you stay on the grid); falls back to same-tab
  // navigation when the popup is blocked. Cooldown-guarded so an accidental double
  // shift+right-click can't open two tabs.
  let lastGreetOpenAt = 0;
  // GREET_MODE='newtab' only: open the chat in a new tab. Documented logout
  // risk; boots a second app instance.
  function openGreetChat(profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id)) return false;
    const tnow = Date.now();
    if (tnow - lastGreetOpenAt < GREETING_COOLDOWN_MS) return false;
    lastGreetOpenAt = tnow;
    const phrase = pickGreeting();
    if (!phrase) { showToast('No greetings configured', 'warn'); return false; }
    const pending = queuePendingGreet(id, phrase);
    if (!pending) { showToast('Could not queue greeting', 'err'); return false; }
    const route = chatRouteFor(id);
    if (!route) { showToast('Open any chat once so I learn your profile id', 'warn'); return false; }
    let url;
    try { url = new URL(route, location.origin); }
    catch (_e) { showToast('Could not build chat URL', 'err'); return false; }
    url.searchParams.set(GREET_URL_PARAM, '1');
    url.searchParams.set(GREET_TS_PARAM, String(pending.ts));
    url.searchParams.set(GREET_TOKEN_PARAM, makeGreetToken(id, pending.ts));
    url.searchParams.set(GREET_AUTOCLOSE_PARAM, '1');
    let opened = null;
    try { opened = window.open(url.toString(), '_blank'); } catch (_e) {}
    if (opened) {
      logInfo(`${LOG} greeting queued for ${id} → opened chat tab: "${phrase}"`);
      showToast(`Greeting queued → ${id}`, 'ok');
      return true;
    }
    // Popup blocked → navigate this tab instead (don't self-close the user's tab).
    url.searchParams.set(GREET_AUTOCLOSE_PARAM, '0');
    logInfo(`${LOG} greeting queued for ${id} → navigating (popup blocked): "${phrase}"`);
    showToast(`Opening chat → ${id}`, 'ok');
    try { location.href = url.toString(); } catch (_e) {}
    return true;
  }

  // ── Conversation ids, the open conversation, and Grindr's real URL shapes ──
  // Corrected in v0.23.0 from a HAR of a greet that actually SENT. Three of this
  // script's load-bearing assumptions about Grindr's URLs were wrong:
  //
  //  1. A conversation id is SORTED, not "<me>:<them>". The same account shows up
  //     as "500000000:600000000" (me first) and "400000000:500000000" (me second);
  //     both are ascending numerically. So the id names a PAIR and, on its own,
  //     identifies neither party — which is why noteMyProfileIdFromUrl now learns
  //     your id by intersecting two different conversations instead.
  //  2. An open profile is "/?profile=true" — a boolean flag with NO id in it —
  //     and the photo lightbox adds "&lightbox=true". The old parser only knew
  //     /profile/<id>, /profiles/<id>, /p/<id> and ?profileId=<id>, so it matched
  //     nothing and isProfileViewOpen() fell through to a geometry guess.
  //  3. The chat route is BARE "/chat". The app selects the conversation in its
  //     own state; it never deep-links /chat/<id>, which is why every attempt to
  //     synthesise one 500'd at /api/v1/inbox/conversation.
  //
  // Grindr's conversation id, built the way the app builds it: the two profile
  // ids sorted ascending and joined with a colon. Numeric sort, not lexicographic
  // — the two agree only while every id has the same digit count.
  function conversationIdFor(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    if (!isPlausibleProfileId(x) || !isPlausibleProfileId(y)) return '';
    return (Number(x) <= Number(y)) ? `${x}:${y}` : `${y}:${x}`;
  }

  // The conversation the app currently has open, learned from its own traffic:
  //   GET  /api/v4/chat/conversation/<a>:<b>/message
  //   POST /api/v4/chatstatus/typing   {"conversationId":"<a>:<b>","status":"Typing"}
  // Both are plain HTTP, so the existing fetch observer sees them. This is the
  // only reliable answer to "whose chat is on screen?", because the URL never
  // carries it (see #3 above).
  let openConversation = { id: '', a: '', b: '', at: 0 };
  // Long enough to cover reading a profile before acting. The old 60s window
  // silently expired while a profile sat open, which is how chatPeerIdFromPath
  // came back null with a perfectly good conversation observed.
  const OPEN_CONVERSATION_MAX_AGE_MS = 10 * 60_000;
  // Record which conversation Grindr currently has open, learned from its own
  // traffic.
  function noteOpenConversation(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    if (!isPlausibleProfileId(x) || !isPlausibleProfileId(y)) return;
    const id = conversationIdFor(x, y);
    if (openConversation.id !== id) logTrace(`${LOG} open conversation: ${id}`);
    openConversation = { id, a: x, b: y, at: Date.now() };
  }
  // Extract a conversationId from a request body (the typing indicator carries
  // one).
  function noteOpenConversationFromBody(body) {
    try {
      if (typeof body !== 'string' || !body.includes('conversationId')) return;
      const m = body.match(/"conversationId"\s*:\s*"(\d{5,10}):(\d{5,10})"/);
      if (m) noteOpenConversation(m[1], m[2]);
    } catch (_e) {}
  }
  // Is `profileId` one of the two people in the conversation currently on screen?
  // A stale observation is treated as "don't know" (false) rather than as proof.
  function openConversationInvolves(profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id) || !openConversation.id) return false;
    if (Date.now() - openConversation.at > OPEN_CONVERSATION_MAX_AGE_MS) return false;
    return openConversation.a === id || openConversation.b === id;
  }

  // Grindr renders an open profile and its photo lightbox as query flags on the
  // grid route rather than as routes of their own.
  function isProfileOverlayOpenFromUrl() {
    try { return new URLSearchParams(location.search).get('profile') === 'true'; }
    catch (_e) { return false; }
  }
  // True when the photo lightbox is open (?lightbox=true).
  function isLightboxOpenFromUrl() {
    try { return new URLSearchParams(location.search).get('lightbox') === 'true'; }
    catch (_e) { return false; }
  }

  // Kept for GREET_MODE='spa' only, and now built with the sorted id. The default
  // 'ui' mode never calls this: deep-linking a conversation that does not exist
  // yet is what produced the 500s, and driving the app's own Chat button is the
  // only path that creates a new one.
  function chatRouteFor(profileId) {
    const me = String(albumState.myProfileId || '');
    const them = String(profileId || '');
    if (!isPlausibleProfileId(them)) return '';
    if (!isPlausibleProfileId(me)) return '';
    return `/chat/${conversationIdFor(me, them)}`;
  }

  // Who you're talking to. The URL is checked first for the older /chat/<a>:<b>
  // and /chat/<them> forms, then the observed open conversation — which is the
  // only source that works on the current build, where the route is bare /chat.
  // With a sorted id the peer is "whichever half isn't me", so this needs
  // myProfileId; without it a pair id cannot be resolved and we say so.
  function chatPeerIdFromPath() {
    try {
      const me = String(albumState.myProfileId || '');
      const peerOf = (x, y) => {
        if (!me) return '';
        if (x === me) return y;
        if (y === me) return x;
        return '';
      };
      const m = location.pathname.match(/\/chat\/(\d{5,10})(?::(\d{5,10}))?/);
      if (m && m[2]) {
        const peer = peerOf(m[1], m[2]);
        if (peer) return peer;
      } else if (m) {
        return m[1];
      }
      if (openConversation.id && Date.now() - openConversation.at <= OPEN_CONVERSATION_MAX_AGE_MS) {
        return peerOf(openConversation.a, openConversation.b);
      }
      return '';
    } catch (_e) { return ''; }
  }

  // ── Greeting navigation: same-tab SPA route change, never a page load ──────
  // WHY THIS EXISTS: v0.16–0.19 opened the target chat in a NEW TAB (falling back
  // to location.href when the popup was blocked). Both boot a SECOND instance of
  // Grindr's app, and that second instance refreshes the session token —
  // POST /v2/api-tokens. Grindr rotates the refresh token, so the new instance's
  // refresh INVALIDATES the token the original tab is holding; the original tab's
  // next call 401s and the app logs you out. That is the "pressed f and it
  // immediately logged me out" bug, and the same mechanism explains the earlier
  // "the chat screen closed and threw me back to the grid" reloads.
  //
  // The fix is to never boot a second app instance: change the ROUTE inside the
  // running SPA instead. history.pushState + a synthetic popstate is what React
  // Router listens to, so the chat view mounts with no document load, no token
  // refresh, and no logout. Clicking an existing <a href="/chat/id"> is preferred
  // when one is on screen, because that runs the app's own router directly.
  function spaNavigate(path) {
    try {
      const a = Array.from(document.querySelectorAll(`a[href="${path}"]`)).find(isVisibleEl);
      if (a) { a.click(); logTrace(`${LOG} spaNavigate: clicked in-app link ${path}`); return true; }
    } catch (_e) {}
    try {
      history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      logTrace(`${LOG} spaNavigate: pushState ${path}`);
      return true;
    } catch (e) { logWarn(`${LOG} spaNavigate failed:`, e); return false; }
  }

  // Greet by routing to the chat in THIS tab, sending, and (optionally) routing
  // back to where you were. Everything is best-effort and always returns you to
  // the previous route on failure — a half-navigated app is worse than no greet.
  function greetViaSpaRoute(profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id)) return false;
    const now = Date.now();
    if (now - lastGreetOpenAt < GREETING_COOLDOWN_MS) return false;
    lastGreetOpenAt = now;
    const phrase = pickGreeting();
    if (!phrase) { showToast('No greetings configured', 'warn'); return false; }
    const route = chatRouteFor(id);
    if (!route) {
      // Refusing to navigate is deliberate: /chat/<bare profileId> is what made
      // the app POST a non-conversation-id and 500 (see chatRouteFor).
      logWarn(`${LOG} greet: don't know your own profileId yet, so a conversation id can't be built. Open TWO DIFFERENT existing chats once (your id is the one they have in common) or set it with __grindrBlock_setMyProfileId(id), then try again.`);
      showToast('Open two different chats once so I learn your profile id', 'warn');
      return false;
    }
    const from = location.pathname + location.search;
    if (!spaNavigate(route)) { showToast('Could not open that chat', 'err'); return false; }
    let attempts = 0;
    const goBack = () => {
      if (!GREET_RETURN_AFTER_SEND) return;
      setTimeout(() => { if (location.pathname !== from) spaNavigate(from); }, GREET_RETURN_DELAY_MS);
    };
    const timer = setInterval(() => {
      attempts += 1;
      const composer = findChatComposer();
      if (!composer || !fillComposer(composer, phrase)) {
        if (attempts >= GREET_AUTOSEND_ATTEMPTS) {
          clearInterval(timer);
          logWarn(`${LOG} greet: chat composer never appeared for ${id}`);
          showToast(`Greet failed: chat box not ready (${id})`, 'warn');
          goBack();
        }
        return;
      }
      clearInterval(timer);
      // Let the app register the typed input before submitting (matches
      // sendGreetingInChat) — React's controlled input needs its state update.
      setTimeout(() => {
        watchForGreetFrame(phrase, id);
        submitComposer(composer, phrase, (sent, how) => {
          if (sent) { logInfo(`${LOG} greeted ${id} via ${how}: "${phrase}"`); showToast(`Sent: ${phrase}`, 'ok'); goBack(); }
          else { logWarn(`${LOG} greet typed but NOT sent for ${id} — the composer still holds the text.`); showToast(`Typed "${phrase}" — press Enter to send`, 'warn'); }
        });
      }, 60);
    }, GREET_AUTOSEND_INTERVAL_MS);
    return true;
  }

  // ── Greeting by driving the app's own UI ───────────────────────────────────
  // Two failed approaches got us here, and both failures are informative:
  //   v0.16–0.19  opened /chat/<id> in a NEW TAB → second app instance → token
  //               refresh → rotation → the original tab is logged out.
  //   v0.20–0.21  changed the route in-app to /chat/<id>, then /chat/<me>:<them>.
  //               Both made the app POST that id to /api/v1/inbox/conversation and
  //               get 500 — even with a correctly-formed conversation id
  //               (["600000011:400000002"] in the capture). The deep link resolves
  //               an EXISTING conversation; for someone you've never messaged
  //               there is no conversation to ensure, so the server errors and the
  //               app falls back to the chat list.
  // So we stop trying to deep-link and drive the flow the way a person does:
  // open the profile, press its Chat/Message button, type, send. That is the only
  // path guaranteed to create a brand-new conversation, because it is the path
  // the app itself uses. Every step is polled with a timeout and falls back to
  // routing you home — no page loads anywhere in it.
  const PROFILE_CHAT_BUTTON_SELECTOR = [
    '[aria-label*="chat" i]', '[aria-label*="message" i]', '[aria-label*="send message" i]',
    '[data-testid*="chat" i]', '[data-testid*="message" i]',
    'button[class*="chat" i]', 'button[class*="message" i]',
  ].join(', ');
  const PROFILE_CHAT_BUTTON_TEXT = /^(chat|message|send message|say hi)$/i;

  // Chrome that must NEVER be mistaken for a profile's Chat button. The v0.22 bug
  // was exactly this: findProfileChatButton fell back to scope=document when
  // findOpenProfileView() returned null, and '[aria-label*="chat" i]' then matched
  // Grindr's global "Chats" nav item. Clicking it opened the INBOX and loaded the
  // most recent conversation — a HAR of the failure shows the app fetching
  // 500000000:600000000, a thread full of history, while the greet target was
  // someone else entirely. A greeting typed there would have gone to the wrong
  // person, so this list is a safety boundary, not a tidiness one.
  const APP_CHROME_SELECTOR = [
    'nav', 'header', 'footer', '[role="navigation"]', '[role="banner"]',
    '[role="tablist"]', '[class*="sidebar" i]', '[class*="navbar" i]',
    '[class*="nav-" i]', '[data-testid*="nav" i]', '[data-testid*="sidebar" i]',
    '[data-testid*="tabbar" i]', '[class*="lightbox" i]',
  ].join(', ');
  // True when an element is nav/header/sidebar/lightbox chrome, which must never
  // be mistaken for content.
  function isAppChrome(el) {
    try { return !!(el && el.closest && el.closest(APP_CHROME_SELECTOR)); }
    catch (_e) { return false; }
  }

  // The button that starts a conversation from an open profile. Accessible name
  // first, visible label second — both, because Grindr's markup uses either
  // depending on the build, and neither alone has been stable across versions.
  //
  // v0.23.0: NO document fallback. If we cannot identify the open profile view we
  // return null and the caller unwinds, because searching the whole page is what
  // produced the wrong-conversation click above. A missed greet is recoverable; a
  // greeting sent to the wrong person is not.
  function findProfileChatButton(root) {
    const scope = root || findOpenProfileView();
    if (!scope) { logTrace(`${LOG} findProfileChatButton: no open profile view to search`); return null; }
    let candidates = [];
    try { candidates = Array.from(scope.querySelectorAll(PROFILE_CHAT_BUTTON_SELECTOR)); } catch (_e) {}
    try {
      for (const b of scope.querySelectorAll('button, [role="button"], a')) {
        const t = String(b.innerText || '').trim();
        if (PROFILE_CHAT_BUTTON_TEXT.test(t)) candidates.push(b);
      }
    } catch (_e) {}
    // RANK, don't take the first. Until v0.28 this returned candidates[0], and
    // the loose selector matches were collected BEFORE the exact text matches —
    // so a control merely CONTAINING "chat" or "message" in its label always beat
    // a button actually labelled "Chat". That is the same ordering flaw that let
    // "Send Location" beat "Send" in the composer (see findSendButton): a loose
    // match that happens to come first in the DOM wins over an exact one.
    return candidates
      .filter(isVisibleEl)
      .filter((el) => !isOwnGreetUi(el))
      .filter((el) => !isAppChrome(el))
      .filter((el) => !elementNames(el).some((n) => NOT_CHAT_BUTTON_RE.test(n)))
      .sort((a, b) => chatButtonRank(b) - chatButtonRank(a))[0] || null;
  }

  // Controls that live on a profile and are NOT its Chat button, but whose names
  // contain "chat" or "message" and so match the loose selector above.
  const NOT_CHAT_BUTTON_RE = /(unread|request|settings|mute|notification|video|voice|call|group|delete|archiv|report|block|album|photo|location|gift|tap)/i;
  // Every string that could carry an element's accessible name.
  function elementNames(el) {
    try {
      return [
        String(el.getAttribute('aria-label') || ''),
        String(el.getAttribute('title') || ''),
        String(el.getAttribute('data-testid') || ''),
        String(el.innerText || ''),
      ].map((x) => x.trim()).filter(Boolean);
    } catch (_e) { return []; }
  }
  // 2 = a name that IS a chat verb, 1 = a name that merely contains one. Exact
  // beats loose regardless of DOM order.
  function chatButtonRank(el) {
    const names = elementNames(el);
    if (names.some((n) => PROFILE_CHAT_BUTTON_TEXT.test(n))) return 2;
    return 1;
  }

  // Poll for `check()` to return something truthy, then run `then` with it.
  // Bounded by the same attempt budget the composer poll uses, and every caller
  // supplies an onGiveUp so a half-finished flow always unwinds.
  function pollFor(check, then, onGiveUp, attempts = GREET_AUTOSEND_ATTEMPTS) {
    let n = 0;
    const timer = setInterval(() => {
      // A cancelled flow must stop polling immediately — otherwise this fires
      // against whatever screen replaced the one that started it.
      if (greetFlow && greetFlow.done) { clearInterval(timer); return; }
      n += 1;
      let got = null;
      try { got = check(); } catch (_e) { got = null; }
      if (got) { clearInterval(timer); then(got); return; }
      if (n >= attempts) { clearInterval(timer); if (onGiveUp) onGiveUp(); }
    }, GREET_AUTOSEND_INTERVAL_MS);
    return trackGreetTimer(timer);
  }

  // Refuse to type into a chat that demonstrably belongs to someone else.
  //
  // The rule is deliberately asymmetric. If we have recently observed an open
  // conversation and the target is NOT in it, that is positive evidence we are
  // looking at the wrong chat, and we stop. If we have observed nothing, we
  // proceed: a brand-new conversation is exactly the case with no prior traffic
  // to observe, and blocking it would break the one flow that 'ui' mode exists
  // to support. So this can only ever veto a provably-wrong target, never a
  // merely-unknown one.
  function greetTargetMismatch(profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id)) return false;
    if (!openConversation.id) return false;
    if (Date.now() - openConversation.at > OPEN_CONVERSATION_MAX_AGE_MS) return false;
    return !openConversationInvolves(id);
  }

  // ── Did it actually send? ──────────────────────────────────────────────────
  // Neither send path proves anything on its own. clickSendButton() returns true
  // when it clicked SOMETHING — which is how a greet reported "Sent: How's it
  // going?" while the text sat untouched in the box and the location picker sat
  // open over the chat. pressEnter() is worse: it returns true whenever
  // dispatching the event didn't throw, which is always.
  //
  // The honest signal is the composer itself. Grindr clears the box when a
  // message goes out and leaves it alone when one doesn't, so "did the text
  // disappear?" answers the question that no HTTP request can (chat travels over
  // the WebSocket — see watchForGreetFrame). We poll for that briefly, and only
  // a cleared box is allowed to say "Sent".
  const SEND_CONFIRM_ATTEMPTS = 8;
  const SEND_CONFIRM_INTERVAL_MS = 150;
  // Poll until the composer is genuinely empty. An empty box is the only
  // trustworthy proof a message sent.
  function confirmComposerCleared(composer, phrase, then) {
    let n = 0;
    const needle = String(phrase || '').trim();
    const timer = setInterval(() => {
      n += 1;
      const now = composerText(composer);
      // ONLY an empty box counts. The earlier rule also accepted "the text
      // changed", which reports a false success two ways: React re-normalises a
      // contenteditable (a trailing <br>, a zero-width char) so the very first
      // tick can differ from `needle` while the text is still visibly sitting
      // there, and a second greet flow overwriting the box looks identical to a
      // send. A false success here is worse than a missed one — the auto-greet
      // path closes its tab on it.
      if (!now) { clearInterval(timer); then(true); return; }
      if (n >= SEND_CONFIRM_ATTEMPTS) { clearInterval(timer); then(false); }
    }, SEND_CONFIRM_INTERVAL_MS);
  }

  // Close a panel our own click may have opened over the chat (the location
  // picker being the one we've actually hit). Escape is what the app's own close
  // button maps to, and it is harmless when nothing is open.
  function dismissAccidentalPanel() { pressEscape(); }
  // One definition of "close whatever overlay is up". Was inlined at three sites.
  function pressEscape() {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true })); } catch (_e) {}
  }

  // Submit the composer and report only what we can show. Tries the send button,
  // waits for the box to clear, and falls back to Enter if it didn't — closing
  // whatever the button click may have opened first, so the retry isn't typed
  // into a panel. `then(sent)` gets the verified answer, never a hopeful one.
  function submitComposer(composer, phrase, then) {
    const clicked = clickSendButton(composer);
    confirmComposerCleared(composer, phrase, (cleared) => {
      if (cleared) { then(true, clicked ? 'send button' : 'cleared on its own'); return; }
      // The click either missed or hit the wrong control. Undo any panel it
      // opened, then let the app's own Enter handler try.
      if (clicked) dismissAccidentalPanel();
      pressEnter(composer);
      confirmComposerCleared(composer, phrase, (cleared2) => {
        then(cleared2, cleared2 ? 'Enter' : 'neither');
      });
    });
  }

  // Type the phrase into the open composer and submit it.
  function typeAndSendGreeting(phrase, profileId) {
    if (greetTargetMismatch(profileId)) {
      logWarn(`${LOG} greet ABORTED for ${profileId}: the open chat is ${openConversation.id}, which is someone else.`);
      showToast('Greet aborted: wrong chat is open', 'err');
      return false;
    }
    const composer = findChatComposer();
    if (!composer || !fillComposer(composer, phrase)) return false;
    setTimeout(() => {
      // Re-check after the fill: filling fires the app's typing indicator, whose
      // POST body names the conversation (noteOpenConversationFromBody). So by
      // now we may know the peer even for a chat that was silent before we typed
      // — and if it turns out to be the wrong one, clear the box instead of
      // sending. This is the only check that covers a brand-new conversation.
      if (greetTargetMismatch(profileId)) {
        logWarn(`${LOG} greet ABORTED after fill for ${profileId}: open chat is ${openConversation.id}.`);
        try { fillComposer(composer, ''); } catch (_e) {}
        showToast('Greet aborted: wrong chat is open', 'err');
        return;
      }
      // The message itself goes over the WebSocket, not HTTP — a HAR of a
      // SUCCESSFUL greet contains no send request at all, only the typing POST.
      // So the composer clearing is the evidence, and watchForGreetFrame adds a
      // second confirmation from the outbound frames when they're readable.
      watchForGreetFrame(phrase, profileId);
      submitComposer(composer, phrase, (sent, how) => {
        if (sent) {
          logInfo(`${LOG} greeted ${profileId}: "${phrase}" (sent via ${how})`);
          showToast(`Sent: ${phrase}`, 'ok');
        } else {
          logWarn(`${LOG} greet typed but NOT sent for ${profileId} — the composer still holds the text.`);
          showToast(`Typed "${phrase}" — press Enter to send`, 'warn');
        }
      });
    }, 60);
    return true;
  }

  // ── Greet flow token ──────────────────────────────────────────────────────
  // One greet at a time, across every entry point. `pollFor` hands back its timer
  // id but callers discarded it, so an abandoned flow kept polling for up to 12s
  // and could click a button or type into a composer belonging to whatever ended
  // up on screen. Registering the timers against the active flow makes a flow
  // cancellable, and cancelling on route change bounds every poll to the screen
  // that started it.
  let greetFlow = null;
  // Who the in-flight greet is for, so findChatComposer can reject a drawer
  // showing someone else.
  let greetTargetId = '';
  // True while a greet flow is in progress.
  function greetFlowActive() { return !!(greetFlow && !greetFlow.done); }
  // Longest a greet flow can legitimately take: lightbox close, then the chat
  // button poll, then the composer poll, then the send confirmation, plus slack.
  const GREET_FLOW_MAX_MS = 45_000;
  // Claim the single greet slot, cancelling any predecessor, and arm a watchdog
  // so a throwing path cannot wedge it.
  function beginGreetFlow(id) {
    cancelGreetFlow('superseded');
    greetFlow = { id: String(id || ''), timers: [], done: false, at: Date.now() };
    greetTargetId = String(id || '');
    const mine = greetFlow;
    // Watchdog. Every terminal path is supposed to release the token, but a path
    // that throws — or one added later that forgets — would wedge the flag and
    // make every subsequent greet report "already in progress" forever. A stuck
    // token is far worse than a duplicate greet, so time it out.
    setTimeout(() => {
      if (greetFlow === mine && !mine.done) {
        logWarn(`${LOG} greet flow for ${mine.id} exceeded ${GREET_FLOW_MAX_MS / 1000}s — releasing the lock.`);
        endGreetFlow(mine);
      }
    }, GREET_FLOW_MAX_MS);
    return greetFlow;
  }
  // Register a timer against the active flow so cancelling the flow stops it.
  function trackGreetTimer(timer) {
    if (greetFlow && !greetFlow.done && timer) greetFlow.timers.push(timer);
    return timer;
  }
  // Release the greet slot and clear its timers.
  function endGreetFlow(flow) {
    const f = flow || greetFlow;
    if (!f || f.done) return;
    f.done = true;
    for (const t of f.timers) { try { clearInterval(t); } catch (_e) {} }
    f.timers.length = 0;
    if (greetFlow === f) { greetFlow = null; greetTargetId = ''; }
  }
  // Abandon the in-flight greet, e.g. on a route change.
  function cancelGreetFlow(why) {
    if (!greetFlowActive()) return false;
    logWarn(`${LOG} greet flow for ${greetFlow.id} cancelled (${why}).`);
    endGreetFlow(greetFlow);
    return true;
  }

  // Full UI-driven greet: (profile open? → chat button → composer → send → home).
  // `openIfNeeded` clicks the grid tile first when the profile isn't open yet.
  // Who does the app itself say is on screen? '' when it has not told us.
  function openProfilePeerId() {
    const me = String(albumState.myProfileId || '');
    if (!me || !openConversation.id) return '';
    if (openConversation.a === me) return openConversation.b;
    if (openConversation.b === me) return openConversation.a;
    return '';
  }
  // Refuse any action whose target the open overlay contradicts. This is the
  // guard that would have stopped the greet delivered to 600000003 while
  // 600000002 was open: a mismatch means our target came from somewhere stale,
  // and acting on it means acting on the wrong person.
  function contradictedByOpenProfile(id) {
    if (!isProfileOverlayOpenFromUrl()) return false;
    const peer = openProfilePeerId();
    if (!peer || !isPlausibleProfileId(id)) return false;
    return peer !== String(id);
  }

  // Greet by driving the app's own UI: refuse a contradicted target, use the
  // profile's composer, submit, then the chosen after-action.
  function greetViaUi(profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id)) return false;
    if (contradictedByOpenProfile(id)) {
      const peer = openProfilePeerId();
      logWarn(`${LOG} greet REFUSED: target ${id} but the open profile is ${peer}. Refusing rather than messaging the wrong person.`);
      showToast(`Greet aborted — ${peer} is open, not ${id}`, 'err');
      return false;
    }
    const now = Date.now();
    if (now - lastGreetOpenAt < GREETING_COOLDOWN_MS) return false;
    // A 1.2s cooldown cannot guard a 12-SECOND state machine. greetViaUi is
    // closeLightbox (<=3s) -> poll for the Chat button (<=12s) -> poll for the
    // composer (<=12s) -> submit (<=2.4s). Two Insert presses 1.5s apart both
    // clear the cooldown, so flow B opened a second profile while flow A was
    // still polling, and A's poll then resolved on B's composer and typed A's
    // phrase into B's chat. greetTargetMismatch cannot veto that: a brand-new
    // conversation has no observed openConversation, so the check deliberately
    // proceeds on "unknown". The cooldown stays as a debounce; this token is what
    // actually makes the flow single-threaded.
    if (greetFlowActive()) {
      logWarn(`${LOG} greet: a greet is already in flight (${greetFlow.id}) — ignoring this one.`);
      showToast('Greet already in progress', 'warn');
      return false;
    }
    // A greet against someone you have hidden or blocked cannot work — Grindr
    // withholds the Chat button and 403s the conversation. Fail fast and say why,
    // instead of opening their profile and polling for 12 seconds.
    if (blockedProfileIds.has(id) || hiddenProfileIds.has(id)) {
      const which = blockedProfileIds.has(id) ? 'blocked' : 'hidden';
      logWarn(`${LOG} greet refused: ${id} is ${which}. Grindr won't let you message them — unblock/unhide first.`);
      showToast(`Can't greet ${id} — you ${which} them`, 'warn');
      return false;
    }
    const flow = beginGreetFlow(id);
    lastGreetOpenAt = now;
    const phrase = pickGreeting();
    if (!phrase) { endGreetFlow(flow); showToast('No greetings configured', 'warn'); return false; }
    const from = location.pathname + location.search;

    const goHome = () => {
      endGreetFlow(flow);
      if (!GREET_RETURN_AFTER_SEND) return;
      // Never push the captured `from` back. On an open profile that value is
      // "/?profile=true" — a flag with no profile state behind it — and restoring
      // it produced the blank screen seen after a successful send. What happens
      // instead is the user's choice (HUD → settings → after greet).
      setTimeout(() => applyAfterAction(settings.afterGreet, id, false), GREET_RETURN_DELAY_MS);
    };

    const sendWhenComposerReady = () => pollFor(
      () => (findChatComposer() ? true : null),
      () => { if (!typeAndSendGreeting(phrase, id)) { showToast('Chat box not ready', 'warn'); } goHome(); },
      () => { logWarn(`${LOG} greet: composer never appeared for ${id}`); showToast('Greet failed: chat box not ready', 'warn'); goHome(); }
    );

    // Already chatting with them → just send. Note that on the current build the
    // route is bare /chat and chatPeerIdFromPath() answers from the observed open
    // conversation, so this now fires where it silently never could before.
    if ((isOnChatPage() || openConversation.id) && chatPeerIdFromPath() === id) {
      // Sends inline and never routes anywhere, so goHome() (which is what
      // releases the token on every other path) is never reached here.
      typeAndSendGreeting(phrase, id);
      endGreetFlow(flow);
      return true;
    }

    // Close the photo lightbox if it is up. Clicking a profile's photo opens it
    // ("&lightbox=true" on the URL), it covers the profile including its Chat
    // button, and it contains no composer — so polling from underneath it just
    // burns the whole 12s budget. A HAR of the failed greet shows exactly that:
    // the URL gained &lightbox=true, nothing else happened for five seconds, and
    // the run ended on a timeout.
    const closeLightbox = (after) => {
      if (!isLightboxOpenFromUrl()) { after(); return; }
      logTrace(`${LOG} greet: lightbox is open, closing it before looking for the Chat button`);
      pressEscape();
      pollFor(
        () => (!isLightboxOpenFromUrl() ? true : null),
        () => after(),
        () => { logWarn(`${LOG} greet: lightbox would not close for ${id}`); showToast('Greet failed: photo viewer stuck open', 'warn'); goHome(); },
        6
      );
    };

    const pressChatButton = () => closeLightbox(() => pollFor(
      () => findProfileChatButton(),
      (btn) => {
        try { btn.click(); } catch (_e) {}
        // If that click opened the lightbox, we hit a photo, not the Chat button.
        // Unwind rather than type into whatever surfaces next.
        setTimeout(() => {
          if (isLightboxOpenFromUrl()) {
            logWarn(`${LOG} greet: that click opened the photo lightbox, not a chat — aborting for ${id}`);
            showToast('Greet failed: clicked a photo, not Chat', 'warn');
            closeLightbox(goHome);
            return;
          }
          sendWhenComposerReady();
        }, 150);
      },
      () => {
        // Before blaming the matcher, check the far likelier cause. Grindr does
        // not render a Chat button on a profile you have hidden or blocked, and
        // its conversation endpoint 403s
        // (urn:gr:err:unauthorized_action) for one — confirmed in a capture where
        // a greet was attempted against an already-hidden profile. No selector
        // change can fix that, so say what actually happened.
        if (blockedProfileIds.has(id) || hiddenProfileIds.has(id)) {
          logWarn(`${LOG} greet: ${id} is on your ${blockedProfileIds.has(id) ? 'block' : 'hide'} list — Grindr does not offer a Chat button for them, so a greet cannot succeed. Unblock/unhide first.`);
          showToast(`Can't greet ${id} — you blocked/hid them`, 'warn');
        } else {
          logWarn(`${LOG} greet: no Chat button on the open profile for ${id}`);
          showToast('Greet failed: no Chat button', 'warn');
        }
        goHome();
      }
    ));

    // Profile already open. On the current build the overlay carries its OWN
    // composer — the "Say something..." box along the bottom of the detail pane —
    // so there is no Chat button to press and none exists to find. Live
    // inspection confirms it: with a profile open, the only element named "Chat"
    // anywhere on the page belongs to the floating chat drawer, while a usable
    // composer is already sitting in the overlay. Use it directly and skip the
    // button step; fall back to hunting a Chat button only if no composer is
    // there (an older build, or a layout that still gates chat behind a button).
    if (isProfileViewOpen()) {
      if (findChatComposer()) {
        logTrace(`${LOG} greet: profile overlay has its own composer — typing directly, no Chat button needed`);
        sendWhenComposerReady();
      } else {
        pressChatButton();
      }
      return true;
    }

    // On the grid → open the profile the way a click does, then continue.
    // The hover fallback MUST be verified. findCardsForProfile(id) is
    // authoritative, but it returns [] whenever id came from a source that never
    // populated the photo-hash index (the attribute scan or the React fiber). The
    // fallback then hands back whatever tile the mouse happens to be over — a
    // DIFFERENT profile — and we would open it, press its Chat button and type
    // the greeting there. Verifying the card resolves back to id is what keeps a
    // missed greet from becoming a greeting sent to the wrong person.
    let card = findCardsForProfile(id).find(isVisibleEl) || null;
    if (!card && lastHoverEl && lastHoverEl.closest) {
      const hovered = lastHoverEl.closest(CASCADE_CARD_SELECTOR);
      if (hovered && cardBelongsToProfile(hovered, id)) card = hovered;
      else if (hovered) logWarn(`${LOG} greet: hovered tile does not resolve to ${id} — refusing it.`);
    }
    if (!card) { endGreetFlow(flow); logWarn(`${LOG} greet: no visible tile for ${id} to open`); showToast('Greet failed: tile not on screen', 'warn'); return false; }
    try { card.click(); } catch (_e) {}
    pollFor(
      () => (isProfileViewOpen() ? true : null),
      () => pressChatButton(),
      () => { logWarn(`${LOG} greet: profile never opened for ${id}`); showToast('Greet failed: profile did not open', 'warn'); goHome(); }
    );
    return true;
  }

  // Shift+right-click entry point. If you're already on this profile's chat, send
  // into the open composer inline (the pre-0.16 behaviour); otherwise queue the
  // greeting and open the chat so the arriving page sends it.
  function triggerShiftRightGreetForProfile(profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id)) return false;
    if (isOnChatPage() && chatPeerIdFromPath() === id) {
      sendGreetingInChat(findChatComposer());
      return true;
    }
    if (GREET_MODE === 'newtab') return openGreetChat(id);
    if (GREET_MODE === 'inline') { showToast('Open that chat first (GREET_MODE=inline)', 'warn'); return false; }
    if (GREET_MODE === 'spa') return greetViaSpaRoute(id);
    return greetViaUi(id);
  }

  // Runs on every fresh load: if the URL carries grindrGreet=1 for /chat/<id> and a
  // matching, fresh greeting is still queued, poll for the chat composer, fill +
  // send the queued phrase, drop it from the pending map, strip the params, and
  // self-close the tab when it was opened by openGreetChat (autoclose=1).
  function maybeAutoSendPendingGreetFromUrl() {
    let url;
    try { url = new URL(location.href); } catch (_e) { return; }
    if (url.searchParams.get(GREET_URL_PARAM) !== '1') return;
    const cleanUrl = () => {
      try {
        url.searchParams.delete(GREET_URL_PARAM);
        url.searchParams.delete(GREET_TS_PARAM);
        url.searchParams.delete(GREET_TOKEN_PARAM);
        url.searchParams.delete(GREET_AUTOCLOSE_PARAM);
        history.replaceState({}, '', url.toString());
      } catch (_e) {}
    };
    const profileId = chatPeerIdFromPath();
    const token = String(url.searchParams.get(GREET_TOKEN_PARAM) || '');
    const shouldAutoClose = url.searchParams.get(GREET_AUTOCLOSE_PARAM) === '1';
    if (!isPlausibleProfileId(profileId)) { cleanUrl(); return; }
    const pending = readPendingGreet(profileId);
    if (!pending) { cleanUrl(); return; }
    if (token && token !== makeGreetToken(profileId, pending.ts)) { cleanUrl(); return; }
    if (Date.now() - (pending.ts || 0) > GREET_PENDING_MAX_AGE_MS) { consumePendingGreet(profileId); cleanUrl(); return; }
    const phrase = pending.phrase;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const composer = findChatComposer();
      if (!composer || !fillComposer(composer, phrase)) {
        if (attempts >= GREET_AUTOSEND_ATTEMPTS) {
          clearInterval(timer);
          consumePendingGreet(profileId);
          cleanUrl();
          showToast(`Auto-greet failed: chat box not ready (${profileId})`, 'warn');
        }
        return;
      }
      clearInterval(timer);
      consumePendingGreet(profileId);
      // Let the app register the typed input before submitting (matches sendGreetingInChat).
      setTimeout(() => {
        watchForGreetFrame(phrase, profileId);
        submitComposer(composer, phrase, (sent, how) => {
          if (sent) { logInfo(`${LOG} auto-greet sent to ${profileId} via ${how}: "${phrase}"`); showToast(`Sent: ${phrase}`, 'ok'); }
          else { logWarn(`${LOG} auto-greet typed but NOT sent for ${profileId} — the composer still holds the text.`); showToast(`Typed "${phrase}" — press Enter to send`, 'warn'); }
          cleanUrl();
          // Only close the tab once the send is CONFIRMED — closing on a hopeful
          // "true" is how a greet could vanish with the text still in the box.
          if (shouldAutoClose && sent) maybeCloseGreetTab();
        });
      }, 60);
    }, GREET_AUTOSEND_INTERVAL_MS);
  }

  // ── Cascade keyboard cursor (ArrowLeft / ArrowRight / f) ───────────────────
  // See the HOTKEYS_ENABLED knobs near the top of the file. The cursor is a
  // remembered TILE plus (when it resolves) its profileId. The grid is
  // virtualised, so a remembered element can be unmounted out from under us at
  // any scroll — every read goes through currentCursorCard(), which re-derives
  // the tile from the remembered profileId (via the photo-hash index) before
  // giving up. Nothing here clicks, opens or blocks: moving the cursor only
  // paints an outline and scrolls.

  let hotkeyCursorEl = null;      // the tile currently under the cursor
  let hotkeyCursorId = '';        // its profileId, when one resolved
  let hotkeyCursorPrevStyle = null;
  let hotkeyEdgeRetryPending = false;

  // True while focus is in something that eats keystrokes, so Home/End still move
  // the caret and PageUp/PageDown still scroll the field
  // instead of firing a greeting.
  // Is this one of the six hotkeys? Used only to decide whether an early return
  // is worth recording — no point logging every keystroke on the page.
  function isSixKey(k) {
    return [HOTKEY_GREET_KEY(), HOTKEY_ALBUM_KEY(), HOTKEY_BLOCK_KEY(), HOTKEY_HIDE_KEY(), HOTKEY_PREV_KEY(), HOTKEY_NEXT_KEY()]
      .some((b) => keyMatches(b, k));
  }
  // Compact description of an element, for diagnostics.
  function describeEl(el) {
    try {
      if (!el || !el.tagName) return String(el);
      const id = el.id ? `#${el.id}` : '';
      const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      const aria = el.getAttribute && el.getAttribute('aria-label');
      return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}${aria ? `[${aria.slice(0, 30)}]` : ''}`;
    } catch (_e) { return '?'; }
  }

  // True when focus is in something that eats keystrokes, so hotkeys stand down.
  function isTypingTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    const role = String(el.getAttribute('role') || '').toLowerCase();
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
  }

  // Every profile tile currently rendered, in visual (DOM) order.
  //
  // Two passes, because Grindr's markup for a cell is not stable across builds:
  //   1. The known cell selector (CASCADE_CARD_SELECTOR, shared with the block
  //      path) — cheap and exact when it matches.
  //   2. Fallback: every profile photo on the page, walked up to the first
  //      ancestor big enough to be a cell. This is the same heuristic
  //      resolveProfileIdFromClick uses when the selector misses, so the cursor
  //      and a middle-click always agree on what a "tile" is.
  // Tiles this script has hidden (block list / text filter) fail isVisibleEl and
  // drop out, so the cursor never lands on a card that isn't on screen.
  function listCascadeCards() {
    const out = [];
    // Set, not out.includes(): this runs on the navigation hot path and the
    // linear scan made it O(n^2) over ~600 tiles, each candidate also paying a
    // getComputedStyle inside isVisibleEl.
    const seenCards = new Set();
    const push = (el) => {
      if (el && !seenCards.has(el) && isVisibleEl(el) && !isOwnGreetUi(el)) {
        const r = el.getBoundingClientRect();
        if (r.width >= HOTKEY_MIN_TILE_PX && r.height >= HOTKEY_MIN_TILE_PX) { seenCards.add(el); out.push(el); }
      }
    };
    document.querySelectorAll(CASCADE_CARD_SELECTOR).forEach(push);
    if (out.length > 1) return out;
    document.querySelectorAll(
      PROFILE_PHOTO_SELECTOR
    ).forEach((img) => {
      let node = img.parentElement;
      for (let i = 0; node && i < 8; i += 1, node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (r.width >= HOTKEY_MIN_TILE_PX && r.height >= HOTKEY_MIN_TILE_PX) { push(node); return; }
      }
    });
    return out;
  }

  // Paint / unpaint the cursor. The tile's pre-cursor inline outline styles are
  // snapshotted so moving away restores it exactly (the same contract dimCard
  // keeps for the block path).
  function clearHotkeyCursor() {
    if (hotkeyCursorEl && hotkeyCursorPrevStyle) {
      try {
        hotkeyCursorEl.style.outline = hotkeyCursorPrevStyle.outline;
        hotkeyCursorEl.style.outlineOffset = hotkeyCursorPrevStyle.outlineOffset;
        hotkeyCursorEl.style.borderRadius = hotkeyCursorPrevStyle.borderRadius;
      } catch (_e) {}
    }
    hotkeyCursorEl = null;
    hotkeyCursorId = '';
    hotkeyCursorPrevStyle = null;
  }

  // Move the visual tile cursor to an element, optionally scrolling it into
  // view.
  function setHotkeyCursor(el, { scroll = true } = {}) {
    if (!el) return false;
    if (el === hotkeyCursorEl) { if (scroll) scrollCursorIntoView(el); return true; }
    clearHotkeyCursor();
    hotkeyCursorEl = el;
    hotkeyCursorPrevStyle = {
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      borderRadius: el.style.borderRadius,
    };
    try {
      el.style.outline = HOTKEY_CURSOR_OUTLINE;
      el.style.outlineOffset = '-3px';
      el.style.borderRadius = HOTKEY_CURSOR_RADIUS;
    } catch (_e) {}
    const { profileId } = resolveProfileIdFromClick({ target: el });
    hotkeyCursorId = profileId || '';
    if (scroll) scrollCursorIntoView(el);
    logTrace(`${LOG} hotkey cursor → ${hotkeyCursorId || '(unresolved)'}`);
    return true;
  }

  // Centre the cursor's tile in the viewport.
  function scrollCursorIntoView(el) {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); }
    catch (_e) { try { el.scrollIntoView(); } catch (_e2) {} }
  }

  // The live tile for the cursor, healing the two ways a virtualised grid breaks
  // the remembered reference: the element was unmounted (re-derive it from the
  // remembered profileId through the photo-hash index), or it was never resolved
  // (give up and let the caller start fresh). Returns null when the cursor is gone.
  function currentCursorCard() {
    if (hotkeyCursorEl && isVisibleEl(hotkeyCursorEl)) return hotkeyCursorEl;
    if (hotkeyCursorId) {
      const again = findCardsForProfile(hotkeyCursorId).find(isVisibleEl);
      if (again) {
        const id = hotkeyCursorId;
        clearHotkeyCursor();
        setHotkeyCursor(again, { scroll: false });
        hotkeyCursorId = id;
        return again;
      }
    }
    clearHotkeyCursor();
    return null;
  }

  // With no cursor yet, start at the first tile that's actually on screen (not
  // tile #0 far above the current scroll position) so the first ArrowRight lands
  // where you're already looking.
  function firstOnscreenCard(cards) {
    const vh = window.innerHeight || 0;
    return cards.find((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < vh;
    }) || cards[0] || null;
  }

  // Move the cursor by `delta` tiles (+1 next, -1 previous). At either end of the
  // rendered grid we scroll the page that way once and retry after
  // HOTKEY_EDGE_SCROLL_WAIT_MS, giving the virtualised list time to mount more
  // tiles; hotkeyEdgeRetryPending keeps that to a single retry per keypress so a
  // held-down nav key at the true end of the grid can't spin.
  function moveHotkeyCursor(delta) {
    const cards = listCascadeCards();
    if (!cards.length) return false;
    const cur = currentCursorCard();
    if (!cur) return setHotkeyCursor(firstOnscreenCard(cards));
    const idx = cards.indexOf(cur);
    if (idx === -1) return setHotkeyCursor(firstOnscreenCard(cards));
    const next = idx + delta;
    if (next >= 0 && next < cards.length) return setHotkeyCursor(cards[next]);
    if (hotkeyEdgeRetryPending) return false;
    hotkeyEdgeRetryPending = true;
    const by = Math.round((window.innerHeight || 600) * HOTKEY_EDGE_SCROLL_FRACTION) * (delta > 0 ? 1 : -1);
    try { window.scrollBy({ top: by, behavior: 'smooth' }); } catch (_e) { try { window.scrollBy(0, by); } catch (_e2) {} }
    setTimeout(() => {
      hotkeyEdgeRetryPending = false;
      const grown = listCascadeCards();
      const stillCur = currentCursorCard();
      const i = stillCur ? grown.indexOf(stillCur) : -1;
      const target = i === -1 ? firstOnscreenCard(grown) : grown[i + delta];
      if (target) setHotkeyCursor(target);
    }, HOTKEY_EDGE_SCROLL_WAIT_MS);
    return true;
  }

  // The action-key greeting. Target is resolveTargetProfileId() — on the grid the
  // profile under the MOUSE POINTER (pointing beats arrowing), on an open profile
  // or chat the one you're looking at. The send itself is
  // triggerShiftRightGreetForProfile, i.e. byte-for-byte the shift+right-click
  // path: random phrase (time tokens already resolved), then dispatched by
  // GREET_MODE — by default greetViaUi opens the profile, clicks its Chat button,
  // fills the composer, submits, and routes you back. On the grid we also move
  // the tile cursor onto whatever was greeted, so a following Insert continues
  // from there.
  function hotkeyGreetTarget() {
    const id = resolveTargetProfileId();
    if (!isPlausibleProfileId(id)) {
      logWarn(`${LOG} hotkey greet: could not resolve a profile id (hover a tile, or open the profile/chat)`);
      showToast('No profile id resolved — hover the profile', 'warn');
      return false;
    }
    const onGrid = !isProfileViewOpen() && !isOnChatPage();
    if (onGrid) {
      const card = findCardsForProfile(id).find(isVisibleEl)
        || (lastHoverEl && lastHoverEl.closest ? lastHoverEl.closest(CASCADE_CARD_SELECTOR) : null);
      if (card) setHotkeyCursor(card, { scroll: false });
    }
    const fired = triggerShiftRightGreetForProfile(id);
    // Do NOT overwrite the toast the failure already showed. greetViaUi returns
    // false for several distinct reasons — cooldown, a flow already in flight, no
    // greetings configured, no visible tile, target already blocked — and each
    // one has already said something specific. showToast reuses a single fixed
    // element, so a blanket "throttled" here replaced the accurate message with a
    // wrong one: a greet that failed because the profile was blocked reported a
    // throttle instead. Just don't advance the cursor.
    if (!fired) { logWarn(`${LOG} greet did not fire for ${id} — see the message above for why.`); return false; }
    if (HOTKEY_GREET_ADVANCES && onGrid) moveHotkeyCursor(1);
    return true;
  }

  // Resolve the target for an action key and, on the grid, the card element that
  // represents it — startBlock needs the element to dim it and to snapshot the
  // style its Undo restores. Mirrors hotkeyGreetTarget's resolution so all four
  // action keys agree on what "the target" means.
  function resolveHotkeyTargetAndCard() {
    const id = resolveTargetProfileId();
    if (!isPlausibleProfileId(id)) return { id: '', card: null, onGrid: false };
    const onGrid = !isProfileViewOpen() && !isOnChatPage();
    // Same verification the greet path needs, and for a related reason: startBlock
    // dims this element and snapshots its style into the Undo entry, so an
    // unverified hover fallback collapses an innocent tile and Undo restores the
    // wrong one. Off-grid we never want a stale grid tile at all.
    let card = findCardsForProfile(id).find(isVisibleEl) || null;
    if (!card && onGrid && lastHoverEl && lastHoverEl.closest) {
      const hovered = lastHoverEl.closest(CASCADE_CARD_SELECTOR);
      if (hovered && cardBelongsToProfile(hovered, id)) card = hovered;
    }
    return { id, card, onGrid };
  }

  // Does this card actually represent `profileId`? Resolved the same way a real
  // click resolves it, so the answer agrees with what clicking would do.
  function cardBelongsToProfile(card, profileId) {
    const id = String(profileId || '');
    if (!card || !isPlausibleProfileId(id)) return false;
    try {
      const r = resolveProfileIdFromClick({ target: card });
      return !!(r && String(r.profileId || '') === id);
    } catch (_e) { return false; }
  }

  // Home — block the target through the full middle-click path: local block
  // list, rate-limited hide/block queue, 30-second Undo. Identical to the mouse
  // gesture, so everything that already guards a click (dedupe, verify, retry,
  // backoff, undo) guards this too; the key is only a second way in.
  function hotkeyBlockTarget() {
    const { id, card, onGrid } = resolveHotkeyTargetAndCard();
    if (!id) {
      logWarn(`${LOG} hotkey block: could not resolve a profile id (hover a tile, or open the profile)`);
      showToast('No profile id resolved — hover the profile', 'warn');
      return false;
    }
    if (contradictedByOpenProfile(id)) {
      const peer = openProfilePeerId();
      logWarn(`${LOG} block REFUSED: target ${id} but the open profile is ${peer}.`);
      showToast(`Block aborted — ${peer} is open, not ${id}`, 'err');
      return false;
    }
    if (onGrid && card) setHotkeyCursor(card, { scroll: false });
    logInfo(`${LOG} hotkey BLOCK ${id}`);
    noteLastBlocked(id);
    // A block supersedes a hide: leaving the id on the hide list would let a
    // later message from them "unhide" someone you have since blocked outright.
    removeFromHiddenList(id);
    startBlock(id, card);
    // Collapse the card NOW rather than waiting for the sweep. Grindr's cascade
    // keeps serving profiles you have hidden — confirmed: our POSTs land, the
    // ids show up in Grindr's own /api/v1/hides, and the profile is still in the
    // feed — so removing it locally is the only thing that makes a block look
    // like it worked.
    // startBlock hides the card for every gesture now, so nothing to do here.
    applyAfterAction(settings.afterBlock, id, onGrid);
    if (HOTKEY_BLOCK_ADVANCES && onGrid && settings.afterBlock !== 'advance') moveHotkeyCursor(1);
    return true;
  }

  // End — hide the target LOCAL-ONLY. No API call and nothing sent to Grindr, but
  // the id IS persisted (addToHiddenList → HIDELIST_STORAGE_KEY), so the hide
  // survives reloads; the enforcement sweep collapses the card on every re-render,
  // the entry expires after HIDE_MAX_AGE_MS, and any message or reaction from them
  // reverses it. Home is the one Grindr is actually told about.
  function hotkeyHideTarget() {
    const { id, card, onGrid } = resolveHotkeyTargetAndCard();
    if (!id) {
      logWarn(`${LOG} hotkey hide: could not resolve a profile id (hover a tile, or open the profile)`);
      showToast('No profile id resolved — hover the profile', 'warn');
      diagEvent('hide-refused', { reason: 'no-profile-id' });
      return false;
    }
    if (blockedProfileIds.has(id)) {
      // Already blocked — but you are looking at the card, so it is on screen
      // anyway, and getting rid of it is the whole reason you pressed the key.
      //
      // This used to refuse. That was wrong in the one case it actually fires:
      // when the enforcement sweep cannot resolve a card element for the tile
      // (a capture shows `matched:4, hidden:0, noCard:2` on every sweep) a
      // blocked profile stays visible, End is pressed on it, and the script
      // answers "already blocked" and leaves it sitting there. Refusing is only
      // right when there is nothing left to do, and there plainly is.
      const persistedBlocked = addToHiddenList(id);
      hideCardsForProfile(id, card);
      scheduleEnforce();
      logInfo(`${LOG} hotkey HIDE ${id}: already blocked, but its card was still showing — hiding it locally too.`);
      if (persistedBlocked) showToast(`${id} was already blocked — card hidden`, 'ok');
      else showToast(`${id} hidden, but it will NOT survive a reload (storage write failed)`, 'warn');
      if (HOTKEY_BLOCK_ADVANCES && onGrid) moveHotkeyCursor(1);
      return true;
    }
    // Same wrong-target guard the block hotkey has: a stale hover/cursor id with a
    // different profile open full-screen would otherwise hide the wrong person.
    if (contradictedByOpenProfile(id)) {
      const peer = openProfilePeerId();
      logWarn(`${LOG} hide REFUSED: target ${id} but the open profile is ${peer}.`);
      showToast(`Hide aborted — ${peer} is open, not ${id}`, 'err');
      diagEvent('hide-refused', { reason: 'contradicted-by-open-profile' });
      return false;
    }
    if (onGrid && card) setHotkeyCursor(card, { scroll: false });
    logInfo(`${LOG} hotkey HIDE ${id} (local-only, no API call, persisted)`);
    const persisted = addToHiddenList(id);
    // Hide the card NOW. Until v0.50 this only called scheduleEnforce(), which is
    // debounced AND stands down while any Grindr overlay is open — so pressing
    // End on an open profile did nothing visible until some later sweep happened
    // to run with the overlay closed. Blocking has hidden the card immediately
    // since v0.49; hiding should behave the same, and it is the whole point of a
    // local hide that the card goes away.
    hideCardsForProfile(id, card);
    scheduleEnforce();
    if (!persisted) showToast(`Hidden ${id} — but it will NOT survive a reload (storage write failed)`, 'warn');
    else showToast(UNHIDE_ON_MESSAGE ? `Hidden ${id} (until they message you)` : `Hidden ${id}`, 'ok');
    if (HOTKEY_BLOCK_ADVANCES && onGrid) moveHotkeyCursor(1);
    return true;
  }

  // ── Where am I? (profile view vs grid) ─────────────────────────────────────
  // Navigation behaves differently on an open profile than on the grid, so we
  // need a reliable "is a profile open full-screen" test. Grindr's class names
  // churn between builds, so this is deliberately three-layered: the URL (most
  // reliable when the route carries the id), then known container selectors, then
  // a geometry heuristic (one profile photo inside an element covering a large
  // share of the viewport — what a full-screen profile looks like regardless of
  // what it's called).
  const PROFILE_VIEW_SELECTOR = [
    '[class*="profile-detail" i]', '[class*="profileDetail" i]', '[class*="ProfileView" i]',
    '[class*="profile-view" i]', '[data-testid*="profileView" i]', '[data-testid*="profile-detail" i]',
    '[data-testid*="profileDetail" i]',
  ].join(', ');
  // A route that names the profile: /profile/<id>, /profiles/<id>, /p/<id>, or
  // ?profileId=<id>. NOT /chat/<id> — that's the chat page, handled separately.
  function openProfileIdFromUrl() {
    try {
      const m = location.pathname.match(/\/(?:profiles?|p)\/(\d{5,10})(?:\/|$)/);
      if (m) return m[1];
      const q = new URLSearchParams(location.search).get('profileId') || '';
      if (isPlausibleProfileId(q)) return q;
    } catch (_e) {}
    return '';
  }

  // The element hosting an open full-screen profile, or null. The geometry
  // fallback requires ≥35% of the viewport AND at most 6 profile photos inside
  // (a profile's photo carousel), which is what separates it from the cascade
  // grid — the grid also covers the viewport but holds dozens of photos.
  function findOpenProfileView() {
    const direct = Array.from(document.querySelectorAll(PROFILE_VIEW_SELECTOR))
      .filter(isVisibleEl)
      .filter((el) => !isOwnGreetUi(el));
    if (direct.length) {
      return direct.reduce((best, el) => {
        const r = el.getBoundingClientRect();
        const br = best ? best.getBoundingClientRect() : null;
        return (!br || r.width * r.height > br.width * br.height) ? el : best;
      }, null);
    }
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    if (!vw || !vh) return null;
    const minArea = vw * vh * 0.35;
    const photoSel = PROFILE_PHOTO_SELECTOR;
    const firstPhoto = Array.from(document.querySelectorAll(photoSel)).find(isVisibleEl);
    if (!firstPhoto) return null;
    // The <=6-photo cap exists to tell a profile apart from the cascade grid,
    // which also fills the viewport. When the URL already says a profile overlay
    // is open (?profile=true) that ambiguity is gone, so the cap only gets in the
    // way — a diagnostic capture shows profileViewFound:false while
    // profileOverlayFromUrl:true, which made findProfileChatButton refuse to
    // search and every greet on an open profile fail with "no Chat button".
    const urlSaysProfile = isProfileOverlayOpenFromUrl();
    const photoCap = urlSaysProfile ? Infinity : 6;
    let node = firstPhoto.parentElement;
    for (let i = 0; node && i < 10; i += 1, node = node.parentElement) {
      const r = node.getBoundingClientRect();
      if (r.width * r.height < minArea) continue;
      const photos = node.querySelectorAll(photoSel).length;
      if (photos > 0 && photos <= photoCap) return node;
      if (!urlSaysProfile) return null;
    }
    // Last resort, and only when the URL vouches for it: the largest visible
    // container that is not app chrome. Bounded this way it is still far
    // narrower than the document-wide fallback v0.28 removed.
    if (urlSaysProfile) {
      let best = null;
      let bestArea = minArea;
      try {
        for (const el of document.querySelectorAll('div, section, main, article')) {
          if (isAppChrome(el) || isOwnGreetUi(el) || !isVisibleEl(el)) continue;
          const r = el.getBoundingClientRect();
          const area = r.width * r.height;
          if (area <= bestArea) continue;
          if (!el.querySelector(photoSel)) continue;
          best = el; bestArea = area;
        }
      } catch (_e) {}
      if (best) { logTrace(`${LOG} findOpenProfileView: geometry fallback via ?profile=true`); return best; }
    }
    return null;
  }
  // v0.23.0: "?profile=true" is how the current build says a profile overlay is
  // open (no id in it — see the URL-shapes note above), so it is now the first
  // and cheapest answer here instead of the geometry guess in findOpenProfileView.
  // The lightbox sits ON TOP of the profile, so it counts as open too; callers
  // that care about the difference ask isLightboxOpenFromUrl().
  function isProfileViewOpen() {
    return isProfileOverlayOpenFromUrl() || !!openProfileIdFromUrl() || !!findOpenProfileView();
  }

  // A cheap fingerprint of "which profile is on screen", used to tell whether a
  // navigation attempt actually moved. Prefers the id in the URL; falls back to
  // the src of the first profile photo, which changes when the pager advances.
  function openProfileSignature() {
    const id = openProfileIdFromUrl();
    if (id) return `id:${id}`;
    const view = findOpenProfileView();
    const img = view && view.querySelector('img[src*="cdns.grindr.com"], img[src*="grindr.com/images/profile"]');
    return `img:${(img && img.getAttribute('src')) || ''}`;
  }

  // ── Profile-pager navigation (Insert / Delete on an open profile) ──────────
  // Grindr's profile view listens for ArrowLeft/ArrowRight, but only reaches them
  // while focus is on the view itself — click the chat box or any button and the
  // arrows go dead until you click back out. So: blur whatever stole focus, focus
  // the view, and re-dispatch the arrow key the app is listening for. The
  // synthetic event bubbles from the view up to document/window, so it reaches a
  // handler at any of those levels; we dispatch ONCE (not on several nodes) so a
  // document-level handler can't fire twice and skip a profile.
  //
  // `keyCode`/`which` are set as well as `key`: they're deprecated but plenty of
  // React keyboard code still switches on them, and an event carrying only `key`
  // silently does nothing there.
  let synthesizingKey = false;
  // Synthesise the arrow key Grindr's own profile pager listens for.
  function dispatchArrowKey(delta, host) {
    const key = delta > 0 ? 'ArrowRight' : 'ArrowLeft';
    const code = delta > 0 ? 39 : 37;
    const target = host || document.body || document.documentElement;
    synthesizingKey = true;
    try {
      for (const type of ['keydown', 'keyup']) {
        const ev = new KeyboardEvent(type, {
          key, code: key, keyCode: code, which: code,
          bubbles: true, cancelable: true, composed: true,
        });
        // Chrome honours keyCode/which from the init dict; other engines don't,
        // so pin them explicitly and ignore the failure if they're already set.
        try {
          Object.defineProperty(ev, 'keyCode', { get: () => code });
          Object.defineProperty(ev, 'which', { get: () => code });
        } catch (_e) {}
        target.dispatchEvent(ev);
      }
    } catch (e) { logTrace(`${LOG} dispatchArrowKey failed:`, e); }
    finally { synthesizingKey = false; }
  }

  // Fallback when the synthetic arrow doesn't move the view: click the pager
  // control. Matched on accessible name / testid / class rather than position, and
  // required to be visible so an off-screen control from another route isn't hit.
  // Controls that are emphatically not the profile pager, however their class or
  // label reads. "Back" is the dangerous one: a nav Back button leaves the
  // profile entirely instead of advancing it.
  const NOT_PAGER_RE = /(back to|go back|close|dismiss|cancel|menu|filter|settings|report|block|album|photo|upload|send|location|tap|gift|search|logout|sign out)/i;
  // Word-boundary, not bare substring. The old matcher included
  // button[class*="left" i] / [class*="right" i], and a class attribute is a
  // SPACE-SEPARATED BAG of utility names — align-left, pl-2, right-panel,
  // chevron-left-icon all contain those letters, so on a utility-class build that
  // selector matched a large share of the buttons on screen and the first one in
  // DOM order got clicked. Class matching is now anchored to a whole word within
  // the attribute, and the naked directions are dropped from the class pass
  // entirely — they only earn a match via an accessible name.
  // `right`/`left` ARE included, matching the selector and the note above — but
  // only ever reached from an authored accessible name, because the class/testid
  // test below runs against a space-separated utility-class bag where they are
  // meaningless. Omitting them here made a pager labelled exactly "Right" fail
  // the filter, so the fallback silently never fired on such a build.
  const PAGER_NAME_RE = {
    next: /(^|[^a-z])(next|forward|right)([^a-z]|$)/i,
    prev: /(^|[^a-z])(prev|previous|back|left)([^a-z]|$)/i,
  };
  // Class/testid matching must NOT accept bare directions — see v0.28.
  const PAGER_ID_RE = {
    next: /(^|[^a-z])(next|forward)([^a-z]|$)/i,
    prev: /(^|[^a-z])(prev|previous)([^a-z]|$)/i,
  };
  // Fallback when the synthetic arrow does not move the view: click the pager
  // control, matched on whole words only.
  function clickProfilePagerButton(delta) {
    const dir = delta > 0 ? 'next' : 'prev';
    // Names may say next/forward/right; classes and testids only the unambiguous
    // words. Bare "left"/"right" are accepted from an accessible name, which is
    // authored prose, but never from a class bag.
    const nameWords = delta > 0 ? ['next', 'forward', 'right'] : ['prev', 'previous', 'back', 'left'];
    const idWords = delta > 0 ? ['next', 'forward'] : ['prev', 'previous'];
    const sel = [
      ...nameWords.flatMap((w) => [`[aria-label*="${w}" i]`, `[title*="${w}" i]`]),
      ...idWords.flatMap((w) => [`[data-testid*="${w}" i]`, `button[class*="${w}" i]`]),
    ].join(', ');
    const view = findOpenProfileView() || document;
    let found = [];
    try { found = Array.from(view.querySelectorAll(sel)); } catch (_e) { return false; }
    const btn = found
      .filter(isVisibleEl)
      .filter((el) => !isOwnGreetUi(el))
      .filter((el) => !isAppChrome(el))
      .filter((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'A')
      .filter((el) => {
        const names = elementNames(el);
        if (names.some((n) => NOT_PAGER_RE.test(n))) return false;
        // A class-only match must still carry the direction as a whole word, so
        // "pl-2" and "align-left" can't stand in for a pager control.
        if (names.some((n) => PAGER_NAME_RE[dir].test(n))) return true;
        const cls = String(el.className || '');
        const testid = String(el.getAttribute('data-testid') || '');
        return PAGER_ID_RE[dir].test(cls) || PAGER_ID_RE[dir].test(testid);
      })[0];
    if (!btn) return false;
    try { btn.click(); logTrace(`${LOG} profile pager: clicked ${btn.getAttribute('aria-label') || btn.className}`); return true; }
    catch (_e) { return false; }
  }

  // Advance the open profile view by one. Blur → synthetic arrow → (if the view
  // didn't change within PROFILE_NAV_VERIFY_MS) click the pager button. Returns
  // true if we handled the key at all, so the caller knows to preventDefault.
  function navigateOpenProfile(delta) {
    const view = findOpenProfileView();
    const before = openProfileSignature();
    try {
      const ae = document.activeElement;
      if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();
    } catch (_e) {}
    if (view) { try { view.focus({ preventScroll: true }); } catch (_e) {} }
    dispatchArrowKey(delta, view || document.body);
    setTimeout(() => {
      if (openProfileSignature() === before) {
        logTrace(`${LOG} profile pager: arrow didn't move the view — trying the pager button`);
        clickProfilePagerButton(delta);
      }
    }, PROFILE_NAV_VERIFY_MS);
    return true;
  }

  // The single entry point for PageUp/PageDown: profile view → app pager; grid →
  // our tile cursor; neither → false, and the keypress is left alone (so Delete
  // still forward-deletes text on a page we have no business touching).
  function navigateProfiles(delta) {
    if (isProfileViewOpen()) return navigateOpenProfile(delta);
    if (listCascadeCards().length) return moveHotkeyCursor(delta);
    return false;
  }

  // ── Hover tracking (for "greet whoever I'm pointing at") ───────────────────
  // The grid's greet target is the profile under the MOUSE, not under the keyboard
  // cursor — pointing is faster than arrowing. Sampled at most every
  // HOVER_SAMPLE_MS so this costs nothing on a fast mouse. Capture phase so it
  // still sees moves over elements that stop propagation.
  let lastHoverEl = null;
  let lastHoverAt = 0;
  document.addEventListener('mousemove', (e) => {
    if (SCRIPT_DISABLED) return;
    const t = Date.now();
    if (t - lastHoverAt < HOVER_SAMPLE_MS) return;
    lastHoverAt = t;
    if (e.target instanceof Element) lastHoverEl = e.target;
  }, true);

  // ── Target resolution for the action keys ──────────────────────────────────
  // Which profile do the action keys act on? Several independent sources, tried in an
  // order that depends on context, because no single one is reliable everywhere
  // (the "can't always find the profile id" problem):
  //   hover  — the tile/element under the mouse pointer (best on the grid).
  //   url    — /chat/<id>, /profile/<id>, ?profileId= (best when a route names it).
  //   view   — resolve from the open profile view container (fiber walk included).
  //   cursor — the keyboard tile cursor, if one is set.
  //   recent — lastViewedProfileId: the last single-profile id the APP ITSELF
  //            fetched (see noteViewedProfileFromUrl). This is the backstop that
  //            covers a profile view whose DOM exposes nothing at all — if the app
  //            just loaded that profile, its id went past our network observer.
  // On the grid, hover wins. On a profile/chat page the route wins, because
  // hovering the conversation list there would otherwise greet the wrong person.
  let lastViewedProfileId = '';
  // Decide which profile the action keys act on. An open overlay resolves from
  // Grindr's own conversation fetch first.
  function resolveTargetProfileId() {
    const fromEl = (el) => {
      if (!el || !(el instanceof Element) || !document.contains(el)) return '';
      try { return resolveProfileIdFromClick({ target: el }).profileId || ''; }
      catch (_e) { return ''; }
    };
    const hover = () => fromEl(lastHoverEl);
    const url = () => {
      const peer = chatPeerIdFromPath();
      if (isPlausibleProfileId(peer)) return peer;
      return openProfileIdFromUrl();
    };
    const view = () => fromEl(findOpenProfileView());
    const cursor = () => (isPlausibleProfileId(hotkeyCursorId) ? hotkeyCursorId : '');
    const recent = () => (isPlausibleProfileId(lastViewedProfileId) ? lastViewedProfileId : '');
    // Highest authority when a profile overlay is open: the conversation Grindr
    // ITSELF fetched when the overlay opened
    // (GET /api/v4/chat/conversation/<me>:<them>/message). That names the profile
    // on screen and nothing else does — ?profile=true carries no id.
    //
    // This is not a preference, it is a correction. A live capture caught the
    // resolver returning 600000003 while 600000002 was open, and the greet was
    // delivered to the wrong person: the stale hotkey cursor outranked the truth
    // because the URL step could not answer and the profile-view step matched
    // nothing. Three different ids were in play at once.
    const openPeer = () => {
      if (!isProfileOverlayOpenFromUrl() && !isOnChatPage()) return '';
      const me = String(albumState.myProfileId || '');
      if (!me || !openConversation.id) return '';
      if (openConversation.a === me) return openConversation.b;
      if (openConversation.b === me) return openConversation.a;
      return '';
    };
    const order = (isProfileViewOpen() || isOnChatPage())
      ? [openPeer, url, view, hover, recent, cursor]
      : [hover, cursor, url, view, recent];
    for (const step of order) {
      const id = step();
      if (isPlausibleProfileId(id)) return id;
    }
    return '';
  }

  // Backstop id source, fed by the network observer: whenever the app fetches ONE
  // specific profile (its profile view, its albums, its conversation), that id goes
  // past us. Remembering the last one gives the action keys a target even when the
  // DOM exposes nothing usable — the "sometimes it can't find the profile id" case.
  // Deliberately narrow: only paths whose LAST meaningful segment is a single id.
  // NOTE: `albums?` is deliberately ABSENT. Grindr fetches /albums/{id}/shares for
  // every album you own whenever the Media picker opens, and an album id is a
  // 9-digit number that passes isPlausibleProfileId — so including it here wrote
  // an ALBUM id into lastViewedProfileId, and that value is the last-resort target
  // for the action keys. Opening the media picker would arm block/hide/greet on a
  // non-existent profile. Album ids are learned separately by ALBUM_SHARES_URL_RE.
  const VIEWED_PROFILE_URL_RE = /\/(?:profiles?|users?|conversations?|chat)\/(\d{5,10})(?:\/|\?|$)/i;
  // Remember the last single profile the app fetched, as a last-resort target.
  function noteViewedProfileFromUrl(url) {
    try {
      const m = String(url || '').match(VIEWED_PROFILE_URL_RE);
      if (m && isPlausibleProfileId(m[1]) && m[1] !== lastViewedProfileId) {
        lastViewedProfileId = m[1];
        logTrace(`${LOG} lastViewedProfileId = ${m[1]}`);
      }
    } catch (_e) {}
  }

  // ── Albums: progressive unlock ─────────────────────────────────────────────
  // CONFIRMED from a HAR of the app sharing two albums (web.grindr.com5.har),
  // so this is no longer guessed:
  //   SHARE   POST   /api/v1/albums/{albumId}/shares
  //           body   {"profiles":[{"profileId":<num>,"shareId":"<uuid4>"}]}  → 200
  //           The shareId is generated by the CLIENT, and the chat message the
  //           recipient sees carries it as its message id ("<ms>:<shareId>" was
  //           visible in the app's own message-by-id refetch) — which is why every
  //           share must mint a FRESH uuid rather than reuse one.
  //   LIST    GET    /api/v1/albums/{albumId}/shares  → {"profileIds":[…]}
  //           The authoritative "who already has this album" list. This replaces
  //           the old guess-by-status-code: we ASK before sharing, so an album
  //           they already hold is never re-sent (a re-share doesn't re-notify —
  //           the app makes you Stop Sharing first, hence the wasted unlock).
  //   UNSHARE PUT /api/v1/albums/{albumId}/unshares — CONFIRMED from a HAR of the
  //           and only ever used when you explicitly ask to re-notify someone.
  //
  // Album ids are learned from the app's own traffic: opening the Media picker in
  // a chat makes Grindr fetch /albums/{id}/shares for each of YOUR albums, and a
  // shares URL is only ever queried for an album you own — so that single URL
  // shape is both the discovery source and the ownership proof. ALBUM_ORDER below
  // is the explicit rotation order and always wins over discovery order.
  const ALBUM_API_BASE = 'https://web.grindr.com/api/v1/albums';
  // Explicit unlock order — the sequence 'u' walks, one album per press. Ids
  // confirmed from the HAR; add the rest by opening the Media picker once and
  // reading __grindrBlock_albums(), then pasting them here in the order you want
  // them given out. `name` is cosmetic (it only labels the toast/log).
  // These ids are REAL (read from __grindrBlock_albums().discovered on the live
  // account); the names are not filled in because nothing observed proves which
  // id belongs to which tile. Run __grindrBlock_scanAlbums() with the My Albums
  // panel open to pair names to ids and set the order from what's on screen, or
  // edit this list by hand — a runtime order set that way is persisted and wins
  // over this seed.
  const ALBUM_ORDER = [
    { id: '800000002', name: '' },
    { id: '800000001', name: '' },
    { id: '800000003', name: '' },
    { id: '800000009', name: '' },
    { id: '800000008', name: '' },
    { id: '800000006', name: '' },
    { id: '800000007', name: '' },
    { id: '800000004', name: '' },
    { id: '800000005', name: '' },
  ];
  // Preferred unlock order BY ALBUM NAME, applied once the names are known (they
  // arrive from __grindrBlock_loadAlbumNames() or __grindrBlock_scanAlbums()).
  // Albums named here go first, in this order; everything else follows in the
  // rotation's existing order. Matching is case-insensitive.
  const ALBUM_ORDER_BY_NAME = ['stuff', 'ass'];
  // true  → ONLY the albums listed above are ever shared, in that order.
  // false → they come first, then any other album discovered from your traffic.
  const ALBUM_ONLY_EXPLICIT_ORDER = false;
  // How long a fetched share list is trusted before it's re-read. Short, because
  // you may share from the app's own UI in between presses.
  const ALBUM_SHARES_CACHE_MS = 5 * 60_000;
  // Minimum gap between two album writes — same reasoning as MIN_INTERVAL_MS for
  // blocks: bursts of writes are what get sessions killed.
  const ALBUM_MIN_INTERVAL_MS = 1500;
  // When every album in the rotation is already shared, 'u' can optionally
  // unshare + re-share the FIRST one to re-notify them. OFF by default: it needs
  // the probed unshare route, and it briefly revokes access. Prefer calling
  // __grindrBlock_reshareAlbum(pid, albumId) deliberately.
  const ALBUM_RESHARE_WHEN_EXHAUSTED = false;
  // Persisted state: discovered ids, the who-has-what ledger, my own profile id,
  // and which unshare shape was found to work. Under STORAGE_KEEP_PREFIX so the
  // stay-logged-in guard preserves it through Grindr's logout clear().
  // Your own profileId, seeded. Everything that needs to tell "you" apart from
  // "them" depends on this: which half of a sorted conversation id is the peer,
  // which album covers are yours, and — the one with teeth — whether a message
  // in a thread is THEIRS (unhides them) or YOURS (must not).
  //
  // Learning it by intersection needs two different conversations to have gone
  // past, which on a fresh profile can be a while, and until then the self-check
  // in noteIncomingMessage cannot fire. So the id is seeded here, confirmed from
  // this account's own traffic (it is the id common to the conversations
  // 500000000:600000000 and 400000000:500000000). The seed is a starting value,
  // not an override: it is only adopted when nothing has been learned or stored,
  // and intersection learning still runs and WINS if it ever disagrees, because
  // evidence from live traffic beats a constant compiled in months earlier.
  // Set to '' to disable seeding entirely.
  // Empty in the published script: a seed is YOUR OWN Grindr profile id, which
  // does not belong in a shared file. Leave it blank and the intersection learner
  // works it out from two different conversations, or set it once by hand with
  // __grindrBlock_setMyProfileId(id) if you would rather not wait.
  const MY_PROFILE_ID_SEED = '';
  // True while myProfileId came from the seed and no traffic has confirmed it.
  let myProfileIdIsSeeded = false;

  // Albums Grindr refuses (403/404). Persisted with the rest of the album state
  // so a dead id is skipped for good rather than re-probed on every unlock.
  function retireAlbum(id, status) {
    const aid = String(id || '');
    if (!aid) return false;
    albumState.retired = Array.isArray(albumState.retired) ? albumState.retired : [];
    if (albumState.retired.includes(aid)) return false;
    albumState.retired.push(aid);
    saveAlbumState();
    logWarn(`${LOG} album ${aid} retired from the unlock rotation (${status}) — it is not one of yours.`);
    return true;
  }
  const isRetiredAlbum = (id) => Array.isArray(albumState.retired) && albumState.retired.includes(String(id));

  const ALBUM_STORAGE_KEY = 'grindrMiddleClickAlbums_v1';
  // Only a /albums/{id}/shares URL proves the album is yours.
  const ALBUM_SHARES_URL_RE = /\/albums\/(\d{1,12})\/shares(?:\/|\?|$)/i;

  // `order` and `names` are the runtime (console-set or DOM-scanned) overrides of
  // the ALBUM_ORDER seed above; empty means "use the seed".
  const ALBUM_STATE_VERSION = 3;
  let albumState = { discovered: [], shares: {}, order: [], names: {}, retired: [], myProfileId: '', myProfileIdSource: '', listUrl: '', stateVersion: ALBUM_STATE_VERSION };
  const albumSharesCache = new Map();   // albumId → { ids:Set<string>, at:number }
  let lastAlbumWriteAt = 0;

  // Restore album state, migrating and discarding anything a removed heuristic
  // wrote.
  function loadAlbumState() {
    try {
      const raw = localStorage.getItem(ALBUM_STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        albumState = {
          discovered: Array.isArray(p.discovered) ? p.discovered : [],
          shares: p.shares && typeof p.shares === 'object' ? p.shares : {},
          order: Array.isArray(p.order) ? p.order.map(String) : [],
          names: p.names && typeof p.names === 'object' ? p.names : {},
          retired: Array.isArray(p.retired) ? p.retired.map(String) : [],
          myProfileId: isPlausibleProfileId(String(p.myProfileId || '')) ? String(p.myProfileId) : '',
          // Provenance must persist with the value. myProfileIdIsSeeded was
          // module-local, so on the SECOND page load the slot was already full,
          // the adopt block was skipped, and the flag stayed false — which made
          // noteMyProfileIdFromConversationId short-circuit and permanently
          // disabled the "traffic overrides a wrong seed" path this design
          // depends on. If the seed is wrong for the signed-in account, the
          // self-check in noteIncomingMessage never matches and YOUR OWN messages
          // unhide everyone you hid.
          myProfileIdSource: String(p.myProfileIdSource || (p.myProfileId ? 'traffic' : '')),
          listUrl: String(p.listUrl || ''),
          stateVersion: Number(p.stateVersion || 1),
        };
        // Two removed heuristics could both learn a STRANGER'S id as yours:
        // v0.21's expiring-pics CDN path (that CDN also serves pics other people
        // sent you), and v0.21-v0.22's "a conversation id is <me>:<them>" rule
        // (conversation ids are sorted, not role-ordered — see
        // noteMyProfileIdFromConversationId). Anything stored before this version
        // is untrustworthy for that one field — drop it and re-learn by
        // intersection, which makes no ordering assumption.
        if (albumState.stateVersion < ALBUM_STATE_VERSION) {
          if (albumState.myProfileId) logWarn(`${LOG} discarding myProfileId=${albumState.myProfileId} learned by a removed heuristic — it may have been someone else's.`);
          albumState.myProfileId = '';
          albumState.stateVersion = ALBUM_STATE_VERSION;
          saveAlbumState();
        }
      }
    } catch (e) { logWarn(`${LOG} loadAlbumState failed:`, e); }
  }
  // Persist album state.
  function saveAlbumState() {
    try { localStorage.setItem(ALBUM_STORAGE_KEY, JSON.stringify(albumState)); }
    catch (e) { logWarn(`${LOG} saveAlbumState failed:`, e); }
  }
  loadAlbumState();
  // Restore provenance so a seeded id stays correctable across reloads.
  myProfileIdIsSeeded = albumState.myProfileIdSource === 'seed';
  // Adopt the seed only into a genuinely empty slot — a stored id was either
  // learned from traffic or set by hand, and both outrank a constant.
  if (!albumState.myProfileId && isPlausibleProfileId(MY_PROFILE_ID_SEED)) {
    albumState.myProfileId = String(MY_PROFILE_ID_SEED);
    albumState.myProfileIdSource = 'seed';
    myProfileIdIsSeeded = true;
    saveAlbumState();
    logInfo(`${LOG} my profileId seeded: ${albumState.myProfileId} (intersection learning still runs and overrides on disagreement)`);
  }

  // A fresh uuid4 per share (see the shareId note above). crypto.randomUUID is
  // present in every browser that runs current Grindr web; the manual fallback
  // keeps the feature alive on an older engine or a non-secure context.
  function albumUuid() {
    try { if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (_e) {}
    const b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (_e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
  }

  // Discovery + ownership, from any /albums/{id}/shares URL the app touches.
  function noteAlbumIdFromUrl(url) {
    try {
      const m = String(url || '').match(ALBUM_SHARES_URL_RE);
      if (!m) return;
      const id = m[1];
      if (albumState.discovered.includes(id)) return;
      albumState.discovered.push(id);
      saveAlbumState();
      logInfo(`${LOG} album discovered: ${id} (${albumState.discovered.length} known)`);
    } catch (_e) {}
  }

  // Your own profileId. Used to keep our own id out of share targets, to pick the
  // peer out of a conversation id, and to label logs; harmless if never learned.
  //
  // A conversation id is NOT "<me>:<them>". v0.21/v0.22 assumed the app always put
  // you first, and a HAR of a working greet disproves it: the same account appears
  // as "500000000:600000000" (me first) and "400000000:500000000" (me SECOND).
  // Both are in ascending numeric order, so the id is sorted, not role-ordered —
  // which means a single conversation id names two people and identifies neither.
  // Taking half[0] therefore learned a STRANGER'S id as yours, exactly the bug
  // v0.22 fixed for the CDN-path heuristic while leaving this one in place.
  //
  // The fix is to learn it by INTERSECTION: you are the one id common to two
  // different conversations. Two distinct conversation ids sharing exactly one
  // half prove that half is you, with no ordering assumption at all.
  const seenConversationIds = new Set();
  const SEEN_CONVERSATION_CAP = 200;
  // Learn your own profile id by intersection: you are the id common to two
  // different conversations.
  function noteMyProfileIdFromConversationId(a, b) {
    if (!isPlausibleProfileId(a) || !isPlausibleProfileId(b)) return '';
    const key = `${a}:${b}`;
    if (seenConversationIds.has(key)) return '';
    // Keep observing while the current id is only SEEDED (see MY_PROFILE_ID_SEED),
    // so live traffic can confirm or correct a constant that may be stale. Once a
    // value has actually been learned or set by hand, stop — re-deriving it every
    // conversation would be pure overhead.
    if (albumState.myProfileId && !myProfileIdIsSeeded) { seenConversationIds.add(key); return ''; }
    for (const prev of seenConversationIds) {
      const [x, y] = prev.split(':');
      const shared = [a, b].filter((id) => id === x || id === y);
      // Exactly one id in common across two DIFFERENT conversations → that's you.
      if (shared.length === 1) { seenConversationIds.add(key); return shared[0]; }
    }
    // Bounded: this only ever needs two DIFFERENT conversations to do its job, so
    // an unbounded Set for the life of the tab bought nothing.
    if (seenConversationIds.size >= SEEN_CONVERSATION_CAP) {
      const oldest = seenConversationIds.values().next().value;
      seenConversationIds.delete(oldest);
    }
    seenConversationIds.add(key);
    return '';
  }
  // Learn your own profile id and the open conversation from a URL.
  function noteMyProfileIdFromUrl(url) {
    try {
      const u = String(url || '');
      const set = (id) => {
        if (!isPlausibleProfileId(String(id))) return;
        if (albumState.myProfileId === String(id)) {
          // Traffic agrees with the seed — promote it to "learned" so we stop
          // re-checking, and so a later observation can't flip it back.
          if (myProfileIdIsSeeded) { myProfileIdIsSeeded = false; albumState.myProfileIdSource = 'traffic'; saveAlbumState(); logInfo(`${LOG} my profileId ${id} confirmed by traffic (was seeded)`); }
          return;
        }
        if (albumState.myProfileIdSource === 'manual') {
          logWarn(`${LOG} my profileId: traffic says ${id}, but ${albumState.myProfileId} was set by hand — keeping the manual value.`);
          return;
        }
        if (albumState.myProfileId && myProfileIdIsSeeded) {
          logWarn(`${LOG} my profileId: traffic says ${id}, seed said ${albumState.myProfileId} — trusting traffic.`);
        }
        albumState.myProfileId = String(id);
        albumState.myProfileIdSource = 'traffic';
        myProfileIdIsSeeded = false;
        saveAlbumState();
        logInfo(`${LOG} my profileId learned: ${id}`);
      };
      // 1. Two different conversation ids sharing exactly one half → that half is you.
      const conv = u.match(/\/conversation\/(\d{5,10}):(\d{5,10})/);
      if (conv) {
        noteOpenConversation(conv[1], conv[2]);
        const me = noteMyProfileIdFromConversationId(conv[1], conv[2]);
        if (me) set(me);
        return;
      }
      // 2. An album cover is /<ownerProfileId>/<albumId>/<hash>, and an album id
      //    we discovered from a /albums/{id}/shares call is provably OURS — so the
      //    owner segment beside it is us.
      const cover = u.match(/cloudfront\.net\/(\d{5,10})\/(\d{1,12})\//);
      if (cover && albumState.discovered.includes(cover[2])) { set(cover[1]); return; }
      // (A third heuristic — the private-media CDN path for "expiring pics" —
      //  was tried in v0.21 and REMOVED: that CDN also serves the expiring pics
      //  OTHER people send you, so it learned a stranger's id as yours and the
      //  greet built /chat/<stranger>:<them>. Only shapes that are structurally
      //  about you are used here.)
    } catch (_e) {}
  }

  // Read your album list off the "My Albums" panel. Two id sources, because the
  // panel's thumbnails are plain hash URLs (cdns.grindr.com/images/thumb/…) that
  // carry NO album id — which is why the v0.20 cover-URL scan returned nothing:
  //   1. a cover URL of the form /<ownerProfileId>/<albumId>/<hash> when one is
  //      present (that's the shape used in Album chat messages), and
  //   2. the React fiber behind the tile, which holds the album object as a prop.
  // The tile's caption is read from the nearest ancestor with a short line of
  // text. Open Chat → Albums, then run __grindrBlock_scanAlbums().
  const ALBUM_COVER_URL_RE = /cloudfront\.net\/(\d{5,10})\/(\d{1,12})\//;
  const ALBUM_TILE_MIN_PX = 60;

  // Fiber walk for an album id, same technique (and same fragility caveat) as
  // findProfileIdInFiber: start at the clicked/rendered node and walk UP, because
  // the leaf <img> rarely holds the data but the tile component does.
  function findAlbumIdInFiber(startEl) {
    try {
      const keys = Object.keys(startEl).filter(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      if (!keys.length) return '';
      let fiber = startEl[keys[0]];
      let depth = 0;
      while (fiber && depth < 30) {
        const sources = [fiber.memoizedProps, fiber.pendingProps, fiber.stateNode?.props];
        for (const props of sources) {
          if (!props || typeof props !== 'object') continue;
          const checks = [
            props.albumId, props.album?.albumId, props.album?.id,
            props.item?.albumId, props.data?.albumId,
          ];
          for (const v of checks) {
            const sv = String(v || '');
            if (/^\d{1,12}$/.test(sv)) return sv;
          }
        }
        fiber = fiber.return;
        depth += 1;
      }
    } catch (_e) {}
    return '';
  }

  // Read album ids and names off the My Albums panel.
  function scanAlbumsFromDom() {
    const out = [];
    const seen = new Set();
    let imgs = [];
    try { imgs = Array.from(document.querySelectorAll('img')).filter(isVisibleEl); } catch (_e) { return out; }
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      if (r.width < ALBUM_TILE_MIN_PX || r.height < ALBUM_TILE_MIN_PX) continue;
      const src = String(img.getAttribute('src') || '');
      let albumId = '';
      const m = src.match(ALBUM_COVER_URL_RE);
      if (m) {
        // Someone else's album cover carries their profile id in the same slot,
        // so this doubles as the ownership filter when we know who we are.
        if (albumState.myProfileId && m[1] !== albumState.myProfileId) continue;
        albumId = m[2];
      }
      if (!albumId) albumId = findAlbumIdInFiber(img);
      if (!albumId || seen.has(albumId)) continue;
      seen.add(albumId);
      let label = '';
      let node = img;
      for (let i = 0; node && i < 5; i += 1, node = node.parentElement) {
        const t = String(node.innerText || '').trim();
        if (t && t.length <= 40) { label = t.split('\n')[0].trim(); break; }
      }
      out.push({ id: albumId, name: label });
    }
    return out;
  }

  // Album metadata. GET /api/v1/albums/{id} answers 405 Method Not Allowed (the
  // path exists, that verb doesn't), so the per-album probe is gone. Instead we
  // probe a small set of plausible LIST endpoints — the Albums panel has to get
  // its names from one of them — and keep the first that returns album objects.
  // GET-only, tried once, and the winner is remembered.
  const ALBUM_LIST_CANDIDATES = [
    'https://web.grindr.com/api/v1/albums',
    'https://web.grindr.com/api/v2/albums',
    'https://web.grindr.com/api/v3/albums',
    'https://web.grindr.com/api/v1/me/albums',
    'https://web.grindr.com/api/v1/albums/me',
  ];
  // Pull {id, name} pairs out of whatever shape the list endpoint returns —
  // Grindr's payloads nest inconsistently, so this walks rather than assumes.
  function harvestAlbums(node, out, depth) {
    if (!node || typeof node !== 'object' || depth > 5) return;
    if (Array.isArray(node)) { node.slice(0, 500).forEach((x) => harvestAlbums(x, out, depth + 1)); return; }
    const id = String(node.albumId || node.albumID || node.id || '');
    const name = String(node.albumName || node.name || node.title || '');
    if (/^\d{1,12}$/.test(id) && name) out.push({ id, name });
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') harvestAlbums(v, out, depth + 1);
    }
  }
  // Probe the album list endpoints once and adopt the first that returns album
  // objects.
  async function loadAlbumNames() {
    const auth = getCapturedAuth();
    if (!auth) { showToast('No captured auth yet — scroll the grid once', 'warn'); return null; }
    // A stored listUrl is replayed WITH the captured bearer token, so its host is
    // validated before use. It is only ever written from the hardcoded candidate
    // list, but it is read back out of localStorage — and anything already running
    // on web.grindr.com can write localStorage. Without this check, planting a key
    // is enough to receive a live session token on the next album-name load.
    const storedListUrl = isGrindrUrl(albumState.listUrl) ? albumState.listUrl : '';
    if (albumState.listUrl && !storedListUrl) {
      logWarn(`${LOG} ignoring stored album listUrl with an unexpected host: ${albumState.listUrl}`);
      albumState.listUrl = '';
      saveAlbumState();
    }
    const tryUrls = storedListUrl ? [storedListUrl, ...ALBUM_LIST_CANDIDATES] : ALBUM_LIST_CANDIDATES;
    for (const url of tryUrls) {
      try {
        noteApiCalls(1);
        const res = await origFetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', ...auth },
          credentials: 'include',
        });
        if (!res.ok) { logTrace(`${LOG} album list ${url} → ${res.status}`); continue; }
        const data = await res.json();
        const found = [];
        harvestAlbums(data, found, 0);
        if (!found.length) { logTrace(`${LOG} album list ${url} → 200 but no album objects`); continue; }
        albumState.listUrl = url;
        // The list endpoint's own order is the app's display order, so adopt it
        // as the rotation unless you've set one by hand.
        const ids = [];
        for (const a of found) {
          if (ids.includes(a.id)) continue;
          ids.push(a.id);
          albumState.names[a.id] = a.name;
          if (!albumState.discovered.includes(a.id)) albumState.discovered.push(a.id);
        }
        if (!albumState.order.length) albumState.order = ids;
        saveAlbumState();
        logInfo(`${LOG} album list from ${url}: ${found.map((a) => `${a.id}(${a.name})`).join(', ')}`);
        showToast(`Named ${found.length} albums`, 'ok');
        return albumRotation();
      } catch (e) { logTrace(`${LOG} album list ${url} error:`, e); }
    }
    logWarn(`${LOG} loadAlbumNames: none of the candidate list endpoints returned albums. Open Chat → Albums with the Network tab recording and tell me the request the panel makes.`);
    showToast('Could not find the album list endpoint', 'warn');
    return null;
  }

  // The rotation: explicit order first, then discovery order (unless pinned).
  // Order the rotation by NAME when the names are known — ALBUM_ORDER_BY_NAME
  // lists the albums you want handed out first, by their label, so the order
  // survives album ids changing and doesn't require knowing which id is which.
  function applyNameOrder(list) {
    if (!ALBUM_ORDER_BY_NAME.length) return list;
    const want = ALBUM_ORDER_BY_NAME.map((n) => String(n).trim().toLowerCase());
    const rank = (a) => {
      const i = want.indexOf(String(a.name || '').trim().toLowerCase());
      return i === -1 ? want.length : i;
    };
    // Stable: equal ranks keep their existing relative order.
    return list
      .map((a, i) => ({ a, i }))
      .sort((x, y) => (rank(x.a) - rank(y.a)) || (x.i - y.i))
      .map((x) => x.a);
  }

  // The ordered album list the unlock hotkey walks, with retired albums removed.
  function albumRotation() {
    const named = (id) => String(albumState.names[String(id)] || '');
    if (albumState.order.length) {
      return applyNameOrder(albumState.order
        .filter((id) => /^\d{1,12}$/.test(String(id)) && !isRetiredAlbum(id))
        .map((id) => ({ id: String(id), name: named(id) })));
    }
    const out = ALBUM_ORDER
      .map((a) => ({ id: String(a.id), name: String(a.name || '') || named(a.id) }))
      .filter((a) => /^\d{1,12}$/.test(a.id) && !isRetiredAlbum(a.id));
    if (!ALBUM_ONLY_EXPLICIT_ORDER) {
      for (const id of albumState.discovered) {
        if (!out.some((a) => a.id === String(id))) out.push({ id: String(id), name: named(id) });
      }
    }
    return applyNameOrder(out);
  }

  // Authoritative share list for one album, cached for ALBUM_SHARES_CACHE_MS.
  // A failed read returns null (NOT an empty set) so a network blip can never be
  // mistaken for "nobody has this album" and cause a duplicate share.
  async function fetchAlbumShares(albumId, force) {
    const id = String(albumId);
    const hit = albumSharesCache.get(id);
    if (!force && hit && Date.now() - hit.at < ALBUM_SHARES_CACHE_MS) return hit.ids;
    const auth = getCapturedAuth();
    if (!auth) return null;
    try {
      noteApiCalls(1);
      const res = await origFetch(`${ALBUM_API_BASE}/${id}/shares`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...auth },
        credentials: 'include',
      });
      if (!res.ok) {
        logWarn(`${LOG} album ${id}: shares read failed (${res.status})`);
        // 403/404 means this album is not ours — deleted, or an id that was
        // never valid. Every future unlock would stall on it identically, which
        // is what made "Delete says it unlocked but nothing happened": the
        // rotation kept re-reading a dead album instead of moving past it.
        // Retire it, persistently.
        if (res.status === 403 || res.status === 404) retireAlbum(String(id), res.status);
        return null;
      }
      const data = await res.json();
      const ids = new Set((Array.isArray(data && data.profileIds) ? data.profileIds : []).map(String));
      albumSharesCache.set(id, { ids, at: Date.now() });
      logTrace(`${LOG} album ${id}: ${ids.size} existing shares`);
      return ids;
    } catch (e) { logWarn(`${LOG} album ${id}: shares read error:`, e); return null; }
  }

  // True when this album has already been shared with this profile.
  function ledgerHas(pid, albumId) {
    const list = albumState.shares[String(pid)] || [];
    return list.includes(String(albumId));
  }
  // Record that an album was shared with a profile.
  function ledgerAdd(pid, albumId) {
    const p = String(pid);
    const list = albumState.shares[p] || (albumState.shares[p] = []);
    if (!list.includes(String(albumId))) { list.push(String(albumId)); saveAlbumState(); }
  }
  // Forget that an album was shared with a profile.
  function ledgerDrop(pid, albumId) {
    const p = String(pid);
    const list = albumState.shares[p];
    if (!list) return;
    const i = list.indexOf(String(albumId));
    if (i >= 0) { list.splice(i, 1); saveAlbumState(); }
  }

  // POST one share. Returns true only on a 2xx.
  async function shareAlbumWith(albumId, pid) {
    const auth = getCapturedAuth();
    if (!auth) { showToast('No captured auth yet — scroll the grid once', 'warn'); return false; }
    const body = JSON.stringify({ profiles: [{ profileId: Number(pid), shareId: albumUuid() }] });
    try {
      noteApiCalls(1);
      const res = await origFetch(`${ALBUM_API_BASE}/${albumId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body,
        credentials: 'include',
      });
      if (res.status >= 200 && res.status < 300) return true;
      if (res.status === 401 || res.status === 403) { showToast('Album unlock: session auth rejected', 'err'); return false; }
      logWarn(`${LOG} album ${albumId} → ${pid} share failed: ${res.status}`);
      showToast(`Album unlock failed (${res.status})`, 'err');
      return false;
    } catch (e) {
      logWarn(`${LOG} album share error:`, e);
      showToast('Album unlock: network error', 'err');
      return false;
    }
  }

  // Un-share — CONFIRMED from a HAR of the app's own "Stop Sharing" button
  // (web.grindr.com6.har): a PUT (not DELETE) to /unshares, with the same body
  // shape as a share and a FRESH uuid shareId. The v0.19 three-shape DELETE probe
  // is gone; there is nothing left to guess.
  //   PUT /api/v1/albums/{albumId}/unshares
  //       {"profiles":[{"profileId":N,"shareId":"<uuid4>"}]}   → 200
  // The result is still verified against the shares list before it's believed.
  async function unshareAlbumFrom(albumId, pid) {
    const auth = getCapturedAuth();
    if (!auth) { showToast('No captured auth yet — scroll the grid once', 'warn'); return false; }
    const body = JSON.stringify({ profiles: [{ profileId: Number(pid), shareId: albumUuid() }] });
    try {
      noteApiCalls(1);
      const res = await origFetch(`${ALBUM_API_BASE}/${albumId}/unshares`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body,
        credentials: 'include',
      });
      if (!(res.status >= 200 && res.status < 300)) {
        logWarn(`${LOG} album ${albumId}: un-share failed (${res.status})`);
        return false;
      }
      const ids = await fetchAlbumShares(albumId, true);
      if (ids && ids.has(String(pid))) {
        logWarn(`${LOG} album ${albumId}: un-share returned ${res.status} but ${pid} is still on the share list`);
        return false;
      }
      ledgerDrop(pid, albumId);
      return true;
    } catch (e) { logWarn(`${LOG} album un-share error:`, e); return false; }
  }

  // Unshare then re-share, which is what the app makes you do by hand to
  // re-notify someone who already has the album (the "Stop Sharing" button in the
  // Media picker). Deliberate, never automatic.
  async function reshareAlbum(pid, albumId) {
    const id = String(albumId || (albumRotation()[0] || {}).id || '');
    if (!id || !isPlausibleProfileId(String(pid))) return false;
    const removed = await unshareAlbumFrom(id, pid);
    if (!removed) { showToast('Could not un-share — see console', 'err'); return false; }
    const ok = await shareAlbumWith(id, pid);
    if (ok) { ledgerAdd(pid, id); albumSharesCache.delete(id); showToast(`Re-shared album ${id} → ${pid}`, 'ok'); }
    return ok;
  }

  // The 'u' action: give this profile the next album in the rotation they do not
  // already have. "Already have" is answered by the server's own share list, with
  // the local ledger as a fallback when that read fails.
  async function shareNextAlbumWith(profileId) {
    const pid = String(profileId || '');
    if (!isPlausibleProfileId(pid)) return false;
    if (albumState.myProfileId && pid === albumState.myProfileId) return false;
    const rotation = albumRotation();
    if (!rotation.length) {
      logWarn(`${LOG} album unlock: no albums known. Open a chat's Media picker once (that makes Grindr list your albums) or add ids to ALBUM_ORDER.`);
      showToast('No albums known — open the Media picker once', 'warn');
      return false;
    }
    const now = Date.now();
    if (now - lastAlbumWriteAt < ALBUM_MIN_INTERVAL_MS) { showToast('Album unlock throttled — try again in a moment', 'warn'); return false; }
    lastAlbumWriteAt = now;

    let target = null;
    let index = 0;
    for (let i = 0; i < rotation.length; i += 1) {
      const album = rotation[i];
      const ids = await fetchAlbumShares(album.id);
      const has = ids ? ids.has(pid) : ledgerHas(pid, album.id);
      if (ids && has) ledgerAdd(pid, album.id);          // keep the ledger honest
      if (!has) { target = album; index = i; break; }
    }
    if (!target) {
      logInfo(`${LOG} album unlock: ${pid} already has all ${rotation.length} albums`);
      if (ALBUM_RESHARE_WHEN_EXHAUSTED) return reshareAlbum(pid, rotation[0].id);
      showToast(`They already have all ${rotation.length} albums`, 'warn');
      return false;
    }
    const ok = await shareAlbumWith(target.id, pid);
    if (!ok) return false;
    ledgerAdd(pid, target.id);
    const cached = albumSharesCache.get(target.id);
    if (cached) cached.ids.add(pid);
    const label = target.name || target.id;
    logInfo(`${LOG} album ${target.id}${target.name ? ` ("${target.name}")` : ''} unlocked for ${pid} (${index + 1}/${rotation.length})`);
    showToast(`Unlocked ${label} → ${index + 1}/${rotation.length}`, 'ok');
    return true;
  }

  // The 'u' hotkey. Target resolution is the shared resolveTargetProfileId chain
  // (hover / URL / open view / cursor / last-fetched profile). Never advances the
  // cursor — unlocking is something you do to the profile you're already on.
  function hotkeyUnlockAlbum() {
    const pid = resolveTargetProfileId();
    logInfo(`${LOG} album unlock requested → target=${pid || '(none)'} rotation=${albumRotation().length} auth=${!!getCapturedAuth()}`);
    if (!isPlausibleProfileId(pid)) {
      logWarn(`${LOG} album unlock: could not resolve a profile id (hover a tile, or open the profile/chat)`);
      showToast('No profile id resolved — hover the profile', 'warn');
      return false;
    }
    // Fire-and-forget, but never silently: an unhandled rejection here would
    // surface with no [GrindrBlock] prefix, unlike every other async path.
    shareNextAlbumWith(pid).catch((err) => logError(`${LOG} album unlock crashed:`, err));
    return true;
  }

  // ── Click bindings ────────────────────────────────────────────────────────
  // One shared capture-phase handler is bound to BOTH mousedown and auxclick,
  // because no single event reports a middle click reliably everywhere:
  //   • mousedown — fires first; the de-facto primary path, and the only event
  //                 early enough to preventDefault() the middle-click autoscroll.
  //   • auxclick  — the spec'd middle-button event; a fallback for configs that
  //                 suppress mousedown.
  // A single physical click can fire BOTH; within the MIDDLE_CLICK_DEDUPE_MS window
  // a second event ON THE SAME TARGET is treated as that echo and made a no-op, so
  // attemptBlock runs exactly once per gesture. The dedupe is keyed on the target
  // (not time alone) so a fast click on a DIFFERENT card is never mistaken for the
  // echo and dropped — that time-only dedupe was the "rapid blocks don't take" bug.
  // Single-fire-per-gesture still matters beyond efficiency: a double attemptBlock
  // would call dimCard twice and corrupt the undo prevStyle snapshot (see
  // startBlock). Both bindings are capture-phase (`true`) so they win before
  // Grindr's own handlers.
  let lastMiddleAt = 0;
  let lastMiddleTarget = null;
  const onBlockClick = (e) => {
    if (SCRIPT_DISABLED) return;
    if (e.button !== 1) return;
    // Coalesce the mousedown+auxclick echo of ONE physical middle-click WITHOUT
    // dropping genuine rapid clicks on DIFFERENT profiles — the dedupe is keyed on
    // the event TARGET, not time alone: the echo lands on the SAME element (and is
    // suppressed), but a click on another card is a different target and always
    // runs. The old time-only dedupe swallowed any second click within
    // MIDDLE_CLICK_DEDUPE_MS regardless of profile (the "blocks don't take when I
    // click quickly" bug). A same-profile click that slips through is harmless:
    // enqueueAction and startBlock dedupe by profileId downstream.
    if (e.target === lastMiddleTarget && Date.now() - lastMiddleAt < MIDDLE_CLICK_DEDUPE_MS) return;
    lastMiddleAt = Date.now();
    lastMiddleTarget = e.target;
    attemptBlock(e);
  };
  document.addEventListener('mousedown', onBlockClick, true);
  document.addEventListener('auxclick', onBlockClick, true);

  // ── Touch: long-press a tile to block ──────────────────────────────────────
  // The touch equivalent of a middle-click. Opt-in (settings.longPressBlock, off
  // by default) because a long press during a scroll could misfire. A press is a
  // block only if the finger stays roughly still for LONG_PRESS_MS; any real drag
  // (a scroll) or an early lift cancels it. On fire it reuses the exact click→block
  // path via a synthetic event, so resolveProfileIdFromClick's full URL/DOM/hash/
  // fiber strategy runs on the touched element with no new selectors.
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_CANCEL_PX = 12;
  let longPressTimer = 0;
  let longPressStart = null;
  // Cancel any pending long-press (movement, lift, or multi-touch).
  function clearLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = 0; }
    longPressStart = null;
  }
  // Arm the long-press-to-block timer on a single-finger press over a tile.
  function onTouchStartBlock(e) {
    if (SCRIPT_DISABLED || !settings.longPressBlock) return;
    if (!e.touches || e.touches.length !== 1) { clearLongPress(); return; }   // ignore pinch/multi-touch
    const t = e.touches[0];
    const el = e.target;
    if (isOwnGreetUi(el)) return;   // our own HUD/toasts
    longPressStart = { x: t.clientX, y: t.clientY, el };
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTimer = 0;
      const start = longPressStart;
      longPressStart = null;
      if (!start) return;
      const synthetic = { target: start.el, __touch: true, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
      let acted = false;
      try { acted = attemptBlock(synthetic); } catch (err) { logWarn(`${LOG} long-press block failed:`, err); }
      if (acted) { try { if (navigator.vibrate) navigator.vibrate(30); } catch (_e) {} }
      else showToast('Long-press: no profile resolved here', 'warn');
    }, LONG_PRESS_MS);
  }
  // Cancel the long-press if the finger moves far enough to be a scroll.
  function onTouchMoveBlock(e) {
    if (!longPressStart) return;
    const t = e.touches && e.touches[0];
    if (!t) { clearLongPress(); return; }
    if (Math.abs(t.clientX - longPressStart.x) > LONG_PRESS_MOVE_CANCEL_PX
      || Math.abs(t.clientY - longPressStart.y) > LONG_PRESS_MOVE_CANCEL_PX) clearLongPress();  // it's a scroll
  }
  // Passive: never block the page's own scrolling or tap-to-open.
  document.addEventListener('touchstart', onTouchStartBlock, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMoveBlock, { capture: true, passive: true });
  document.addEventListener('touchend', clearLongPress, { capture: true, passive: true });
  document.addEventListener('touchcancel', clearLongPress, { capture: true, passive: true });
  let longPressStyleEl = null;
  // iOS Safari pops a save/share callout on a long-press over an image, which would
  // fight the block gesture. Suppress it on profile photos ONLY while long-press is
  // enabled (and remove the style when it's turned back off).
  function syncLongPressStyle() {
    const want = IS_TOUCH && settings.longPressBlock;
    if (want && !longPressStyleEl) {
      longPressStyleEl = document.createElement('style');
      longPressStyleEl.id = 'grindr-block-longpress-style';
      longPressStyleEl.textContent = `${PROFILE_PHOTO_SELECTOR}{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}`;
      (document.head || document.documentElement).appendChild(longPressStyleEl);
    } else if (!want && longPressStyleEl) {
      try { longPressStyleEl.remove(); } catch (_e) {}
      longPressStyleEl = null;
    }
  }
  syncLongPressStyle();

  // Shift+left-click block gesture — detected on `click`, NOT `mousedown`.
  // v0.16.0 detected it at mousedown (button:0 + shiftKey), but a macOS trackpad
  // secondary click (two-finger tap / Force Touch right-click) can report
  // button:0 on its mousedown and only reveal itself as a right-click via the
  // `contextmenu` that follows — so a shift+trackpad-secondary-click satisfied
  // the mousedown check and genuinely blocked the profile, on top of the
  // `contextmenu` listener below also firing the greet ("shift-right-click
  // blocks" bug). A real `click` event only ever fires for a genuine
  // primary-button release — a right-click/trackpad-secondary-click fires
  // `contextmenu`/`auxclick` instead and never reaches this handler — so
  // detecting here removes the ambiguity outright. This also means we no
  // longer need to defer to a follow-up navigation click: preventDefault on
  // THIS click (done inside attemptBlock) stops Grindr's own navigation
  // directly, and stopImmediatePropagation stops any other click handler
  // Grindr attached to the same element.
  document.addEventListener('click', (e) => {
    if (SCRIPT_DISABLED) return;
    if (e.button !== 0 || !e.shiftKey) return;
    if (e.target === lastMiddleTarget && Date.now() - lastMiddleAt < MIDDLE_CLICK_DEDUPE_MS) return;
    lastMiddleAt = Date.now();
    lastMiddleTarget = e.target;
    const acted = attemptBlock(e);
    if (acted) e.stopImmediatePropagation();
  }, true);

  // True when the current URL is Grindr's chat page (web.grindr.com/chat[/...]);
  // gates the shift+right-click intro-message gesture below.
  function isOnChatPage() {
    try { return /^\/chat(?:\/|$)/.test(location.pathname); }
    catch (_e) { return false; }
  }

  // Trackpad-friendly shift+right-click → send that profile a random greeting.
  // If a profileId resolves under the cursor (a cascade tile, a profile view, or —
  // via the URL — the chat you're already viewing), suppress the native menu and
  // greet it: sent inline when you're already on that chat, else queued while its
  // chat is opened in a new tab (triggerShiftRightGreetForProfile). With no
  // resolvable profile we fall back to the pre-0.16 behaviour (send into the open
  // composer on the chat page) and otherwise leave the normal menu alone. Plain
  // (non-shift) right-clicks are never touched; shift+right-click is not a block
  // gesture.
  document.addEventListener('contextmenu', (e) => {
    if (SCRIPT_DISABLED) return;
    if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const { profileId } = resolveProfileIdFromClick(e);
    if (profileId) {
      e.preventDefault();
      e.stopPropagation();
      triggerShiftRightGreetForProfile(profileId);
      return;
    }
    if (isOnChatPage()) {
      const composer = findChatComposer();
      if (composer) {
        e.preventDefault();
        e.stopPropagation();
        sendGreetingInChat(composer);
      }
    }
  }, true);


  // Hotkeys (see the HOTKEYS_ENABLED block near the top for the full rationale).
  //   Insert / Delete → next / previous profile. Handled EVEN WHILE TYPING when
  //     HOTKEY_NAV_IN_TEXT_FIELDS is on: that's the point — Grindr's own arrow
  //     navigation dies the moment you focus the chat box, and these keys don't
  //     collide with editing (Backspace is untouched; this Delete is fn+Delete).
  //     If nothing is navigable we return WITHOUT preventDefault, so the key does
  //     its normal job on pages we have no business touching.
  //   f / u          → greet / unlock an album for the resolved target. Always
  //     ignored while typing, so Home/End still move the caret in a text box.
  // Capture phase so Grindr's own handlers can't swallow the key first; every
  // guard runs before anything is prevented.
  document.addEventListener('keydown', (e) => {
    // Instrumented at EVERY exit. "I pressed the key and nothing happened" was
    // undiagnosable before: the recorder only logged a press that survived all
    // the gates, so a key swallowed early produced no evidence at all — which is
    // precisely the case that needs evidence. Now each early return says which
    // gate stopped it, and the recording answers the question directly.
    const bail = (why, extra) => { diagEvent('hotkey-ignored', Object.assign({ key: String(e.key || ''), why }, extra || {})); };
    if (!HOTKEYS_ENABLED || synthesizingKey || SCRIPT_DISABLED) {
      if (isSixKey(e.key)) bail('disabled', { hotkeysEnabled: HOTKEYS_ENABLED, synthesizingKey, scriptDisabled: SCRIPT_DISABLED });
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) {
      if (isSixKey(e.key)) bail('modifier-held', { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, composing: e.isComposing });
      return;
    }
    const key = String(e.key || '');
    if (!key) return;
    // HUD toggle. Outside the six-key cluster and ignored while typing.
    if (key === HOTKEY_TOGGLE_HUD_KEY && !isTypingTarget(e.target) && !isTypingTarget(document.activeElement)) {
      e.preventDefault(); e.stopPropagation();
      toggleHud();
      return;
    }
    const isNext = keyMatches(HOTKEY_NEXT_KEY(), key);
    const isPrev = keyMatches(HOTKEY_PREV_KEY(), key);
    const isGreet = keyMatches(HOTKEY_GREET_KEY(), key);
    const isAlbum = keyMatches(HOTKEY_ALBUM_KEY(), key);
    const isBlock = keyMatches(HOTKEY_BLOCK_KEY(), key);
    const isHide = keyMatches(HOTKEY_HIDE_KEY(), key);
    if (!isNext && !isPrev && !isGreet && !isAlbum && !isBlock && !isHide) return;
    const typing = isTypingTarget(e.target) || isTypingTarget(document.activeElement);
    diagEvent('hotkey-seen', {
      key,
      typing,
      repeat: !!e.repeat,
      activeEl: describeEl(document.activeElement),
      targetEl: describeEl(e.target),
    });

    // One action per physical press, checked BEFORE the nav branch. It used to sit
    // below it, so a HELD PageUp/PageDown re-ran navigateProfiles at the OS key-
    // repeat rate — each run doing two full listCascadeCards() scans and
    // restarting a smooth scrollIntoView, saturating the main thread while the
    // page barely moved.
    if (e.repeat) { bail('key-repeat'); return; }
    if (isNext || isPrev) {
      if (typing && !HOTKEY_NAV_IN_TEXT_FIELDS) { bail('typing (nav disabled in text fields)'); return; }
      if (!navigateProfiles(isNext ? 1 : -1)) { bail('navigateProfiles found nothing to move'); return; }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Nothing fires while typing. Home/End move the caret, PageUp/PageDown scroll
    // a focused field, and this return is what leaves all of them alone there.
    // (Insert/Delete are inert in a text box, but they carry ACTIONS now, and an
    // accidental block or greet mid-sentence is worse than a missed keystroke.)
    if (typing) { bail('typing'); return; }
    diagEvent('hotkey', { key, action: isGreet ? 'greet' : isAlbum ? 'album' : isBlock ? 'block' : 'hide' });
    // Run the action FIRST, then suppress the key only if it actually did
    // something — the same contract navigation already honours above. Each
    // handler resolves its target synchronously and returns false when there
    // isn't one, so a PageDown over empty space still scrolls the page instead
    // of being swallowed by a hotkey that had nothing to act on. Calling
    // preventDefault after the handler is still in time: the default action runs
    // once dispatch completes, not when the listener is entered.
    let acted = false;
    if (isGreet) acted = hotkeyGreetTarget();
    else if (isAlbum) acted = hotkeyUnlockAlbum();
    else if (isBlock) acted = hotkeyBlockTarget();
    else acted = hotkeyHideTarget();
    if (!acted) { diagEvent('hotkey-noop', { key, note: 'handler ran but reported no action' }); return; }
    diagEvent('hotkey-acted', { key });
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // A route change (grid → profile → chat and back) unmounts the tiles the cursor
  // points at; drop it rather than leave a stale outline behind.
  window.addEventListener('popstate', () => {
    clearHotkeyCursor();
    // The screen a greet was polling against is gone; its pending clicks and
    // composer fills would land on whatever replaced it.
    cancelGreetFlow('route changed');
  });

  // Start the persistent block-list enforcement (observer + backstop + initial
  // sweep) so listed profiles stay hidden and get re-blocked across refresh/scroll.
  installBlockListEnforcement();
  installAutoDrain();

  // If this page was opened (or navigated to) by a shift+right-click greeting,
  // send the queued phrase once the chat composer mounts.
  maybeAutoSendPendingGreetFromUrl();

  // ── DevTools hooks ────────────────────────────────────────────────────────
  // Console entry points (__grindrBlock_undoAll is defined up in the undo
  // section):
  //   __grindrBlock_reset()      — un-wedge the queue: clear the session-dead
  //                                flag + backoff and re-run it. Use when you
  //                                know you're logged in but blocks stopped.
  //   __grindrBlock_state()      — snapshot of internals (see field notes below).
  //   __grindrBlock_undoAll()    — unblock everything still in its undo window.
  //   __grindrBlock_cancelBlock(id) — kill-switch for ONE block: stop retrying a
  //                                profile that won't confirm (drops it from the
  //                                queue + aborts any in-flight attempt). Does
  //                                NOT unblock if it already applied server-side.
  //   __grindrBlock_clearQueue() — kill-switch for ALL pending blocks/unblocks:
  //                                empty the queue and abort in-flight retries.
  //                                Already-applied blocks stay applied.
  //   __grindrBlock_seenActions() — dump the block/hide/report requests Grindr's
  //                                OWN app made (method+URL+body); use it to find
  //                                the real block endpoint when the built-ins 501.
  //   __grindrBlock_captureWrites(ms) — arm a window (default 25s) that logs EVERY
  //                                mutating grindr.com request (fetch + XHR) so a
  //                                NATIVE block reveals its real request even if it
  //                                uses GraphQL or a non-'block' path.
  //   __grindrBlock_setLog(lvl)  — set verbosity: silent|error|warn|info|trace.
  window.__grindrBlock_setLog = function (level) {
    if (!(level in LOG_LEVELS)) {
      console.warn(`${LOG} unknown log level "${level}". Use one of: ${Object.keys(LOG_LEVELS).join(', ')}`);
      return LOG_LEVEL;
    }
    LOG_LEVEL = level;
    // Announce via console.log directly so the confirmation shows regardless of
    // the level just set (e.g. even when switching to 'silent').
    console.log(`${LOG} log level → ${LOG_LEVEL}`);
    return LOG_LEVEL;
  };
  // Clear the session-dead pause and any backoff, then kick the queue. Named so
  // the HUD button can call it directly: the console wrapper is gated behind
  // __grindrBlock_arm(), and that gate exists to stop a drive-by script on
  // grindr.com calling it — a click on our own HUD is a real user gesture, so it
  // is not what the gate is protecting against.
  function resetQueuePauses() {
    const wasDead = blockSessionDead;
    logInfo(`${LOG} manual reset: clearing session-dead flag + backoff. ${blockQueue.length} queued.`);
    blockSessionDead = false;
    blockBackoffUntil = 0;
    capWaitUntil = 0;
    processQueue().catch(err => logError(`${LOG} processQueue crashed:`, err));
    try { refreshHud(); } catch (_e) {}
    return { wasPaused: wasDead, queued: blockQueue.length };
  }
  window.__grindrBlock_reset = function () { return resetQueuePauses(); };
  // Stop retrying a single profile's block (e.g. one stuck in the verify-retry
  // loop forever). Removes any queued copy and flags an in-flight attempt to
  // abort. Returns what it did. Note: does NOT send an unblock — if the block
  // already applied server-side it stays; use the app/profile to unblock that.
  window.__grindrBlock_cancelBlock = function (profileId) {
    const id = String(profileId);
    const idx = blockQueue.findIndex(j => j.action === 'block' && j.profileId === id);
    if (idx >= 0) {
      // Queued (incl. waiting-to-retry) — just drop it. Do NOT touch
      // cancelledBlocks: a stale entry would silently kill the NEXT block of
      // this profile at the pre-send check.
      blockQueue.splice(idx, 1);
      blockQueueSet.delete('block:' + id);
      logInfo(`${LOG} cancelBlock(${id}) — removed from queue.`);
      return { profileId: id, removedFromQueue: true };
    }
    if (blockQueueSet.has('block:' + id)) {
      // In-flight (mid POST/verify) — flag it so processQueue aborts at its next
      // checkpoint (which also consumes the flag, so no leak).
      cancelledBlocks.add(id);
      blockQueueSet.delete('block:' + id);
      logInfo(`${LOG} cancelBlock(${id}) — flagged in-flight attempt to abort.`);
      return { profileId: id, removedFromQueue: false, abortedInFlight: true };
    }
    logInfo(`${LOG} cancelBlock(${id}) — nothing pending.`);
    return { profileId: id, removedFromQueue: false };
  };
  // Nuke the whole queue. Bumps queueGeneration so the one block currently
  // mid-flight (if any) aborts at its next checkpoint instead of re-queueing a
  // retry — that generation bump is the abort signal, so we don't need to seed
  // cancelledBlocks per-job (which would leak and kill future blocks). Clearing
  // cancelledBlocks here just tidies any in-flight flags. Already-applied blocks
  // on Grindr's side are untouched, and any pending unblocks are dropped too.
  window.__grindrBlock_clearQueue = function () {
    const n = blockQueue.length;
    blockQueue.length = 0;
    blockQueueSet.clear();
    cancelledBlocks.clear();
    queueGeneration++;                  // signals the in-flight block (if any) to abort
    logInfo(`${LOG} clearQueue — dropped ${n} job(s); in-flight block (if any) will abort.`);
    return { cleared: n };
  };
  // Persistent local block list (survives refresh/scroll). Inspect or edit it:
  //   __grindrBlock_blockList()              — array of blocked profileIds.
  //   __grindrBlock_removeFromBlockList(id)  — drop one id (stops re-hide/re-block)
  //                                            and restore its card if present.
  //   __grindrBlock_clearBlockList()         — wipe the whole local list.
  // Which blocks are still being enforced locally, and which Grindr has taken over.
  window.__grindrBlock_arm = function () { return armConsole(true); };
  window.__grindrBlock_disarm = function () { return armConsole(false); };
  window.__grindrBlock_blockTiers = function () {
    return {
      pending: pendingBlockIds(),
      confirmed: [...blockConfirmedIds],
      quietMsFallback: BLOCK_CONFIRM_QUIET_MS,
      lastReconciledAt: lastBlockReconcileAt ? new Date(lastBlockReconcileAt).toISOString() : null,
    };
  };
  // Ask Grindr's own hide/block lists right now and re-tier every pending block.
  window.__grindrBlock_reconcileBlocks = function () {
    return reconcileBlockTiers(true).then((r) => {
      console.log(`${LOG} reconcile:`, r || '(skipped — no auth captured, or no blocks tracked)');
      return r;
    }).catch((e) => { logError(`${LOG} reconcile failed:`, e); return null; });
  };
  // Block a profile by id, exactly as a middle-click or the block hotkey would:
  // it joins the persistent local list and is queued as INTERACTIVE work, so it
  // runs ahead of any auto-drain backlog. Use it when you have an id but no card
  // on screen (from a log, a capture, or the blocklist), and to check by hand that
  // a pressed block still overtakes the drain:
  //
  //     __grindrBlock_autoDrain(true); __grindrBlock_block('600000001')
  //
  // Returns { profileId, queued } — queued:false means the id was rejected by the
  // plausibility gate or was already on the list, and nothing was sent.
  window.__grindrBlock_block = function (profileId) {
    const id = String(profileId || '');
    if (!isPlausibleProfileId(id)) {
      logWarn(`${LOG} __grindrBlock_block: ${JSON.stringify(profileId)} is not a plausible profile id.`);
      return { profileId: id, queued: false, reason: 'implausible id' };
    }
    const added = addToLocalBlockList(id);
    enqueueAction(id, 'block');
    return { profileId: id, queued: true, addedToList: added };
  };
  // Profiles retired from the hide→block backlog: POSTed MAX_UPGRADE_ATTEMPTS
  // times, answered 200 each time, never appeared in Grindr's blocks list. They
  // remain blocked locally. Pass true to clear the counters and retry them all.
  window.__grindrBlock_stuckBlocks = function (retry) {
    if (retry === true) {
      const cleared = upgradeAttempts.size;
      upgradeAttempts = new Map();
      saveUpgradeAttempts();
      logInfo(`${LOG} cleared ${cleared} upgrade-attempt counter(s); the drain will retry them.`);
      try { refreshHud(); } catch (_e) {}
      return { cleared };
    }
    const ids = stuckUpgradeIds();
    return { count: ids.length, maxAttempts: MAX_UPGRADE_ATTEMPTS, ids };
  };
  window.__grindrBlock_blockList = function () { return [...blockedProfileIds]; };
  window.__grindrBlock_removeFromBlockList = function (profileId) {
    const removed = removeFromLocalBlockList(profileId);
    restoreBlockedCardInDom(String(profileId));
    return { removed, size: blockedProfileIds.size };
  };
  window.__grindrBlock_clearBlockList = function () {
    const n = blockedProfileIds.size;
    // Clear every derived tier too (as removeFromLocalBlockList does per id) and
    // persist the confirmed set — otherwise BLOCK_CONFIRMED_STORAGE_KEY keeps
    // growing and re-blocking a cleared id is skipped as still-"confirmed".
    blockedProfileIds.clear();
    lastReblockAt.clear();
    blockLandedAt.clear();
    blockConfirmedIds.clear();
    serverBlockedIds = new Set();
    serverBlocksKnown = false;
    saveServerBlocks();
    saveBlockList();
    saveConfirmedBlocks();
    logInfo(`${LOG} cleared local block list (${n} entr${n === 1 ? 'y' : 'ies'}).`);
    return { cleared: n };
  };
  // Auto text-filter (see TEXT_FILTER_* near the top of the file):
  //   __grindrBlock_textFilter()  — current config + counts { action, wholeWord,
  //                                  keywords, hiddenCount, handledCount }.
  //   __grindrBlock_textHidden()  — array of profileIds hidden DOM-only by the
  //                                  text filter this session ('hide' mode).
  window.__grindrBlock_textFilter = function () {
    return {
      action: TEXT_FILTER_ACTION,
      wholeWord: TEXT_FILTER_WHOLE_WORD,
      keywords: textFilterMatchers.map(m => m.keyword),
      hiddenCount: autoTextHiddenIds.size,
      handledCount: autoTextHandled.size,
    };
  };
  window.__grindrBlock_textHidden = function () { return [...autoTextHiddenIds]; };

  // ── Console-surface arming ────────────────────────────────────────────────
  // Under @grant none this script runs in the PAGE's own context, so every
  // window.__grindrBlock_* function is callable by anything else executing on
  // web.grindr.com — Grindr's own bundle, or any third-party tag it loads. Most
  // of them are read-only diagnostics and harmless. A few are not: greet() sends
  // a message as you, unlockAlbum()/reshareAlbum() share a PRIVATE album with an
  // arbitrary profile id, and the clear*/undo* family destroys local state.
  //
  // Those are now disarmed by default. They still exist and still work — you just
  // have to say so first, which is one line in the console you were already
  // typing in, and which no drive-by script is going to do on your behalf.
  const ARMED_STORAGE_KEY = 'grindrMiddleClickArmed_v1';
  let consoleArmed = false;
  try { consoleArmed = sessionStorage.getItem(ARMED_STORAGE_KEY) === '1'; } catch (_e) {}
  // Arm or disarm the acting console functions for this tab.
  function armConsole(on) {
    consoleArmed = on !== false;
    try { if (consoleArmed) sessionStorage.setItem(ARMED_STORAGE_KEY, '1'); else sessionStorage.removeItem(ARMED_STORAGE_KEY); } catch (_e) {}
    console.log(`${LOG} acting console functions are now ${consoleArmed ? 'ARMED' : 'DISARMED'} for this tab.`);
    return consoleArmed;
  }
  // Wrap an acting function so it refuses until armed.
  function gated(name, fn) {
    return function (...args) {
      if (!consoleArmed) {
        console.warn(`${LOG} __grindrBlock_${name}() is disarmed. Run __grindrBlock_arm() first (this tab only).`);
        return undefined;
      }
      return fn.apply(this, args);
    };
  }

  // ── Persistent hide list (PageDown) ────────────────────────────────────────
  //   __grindrBlock_hiddenList()        — [{profileId, hiddenAt, hiddenAgo}]
  //   __grindrBlock_unhide(id)          — put one back on screen
  //   __grindrBlock_clearHiddenList()   — put them all back
  // A hide never touched Grindr, so undoing one is purely local: drop the id and
  // clear the two inline styles the sweep set.
  window.__grindrBlock_hiddenList = function () {
    const now = Date.now();
    return [...hiddenProfileIds.entries()].map(([profileId, hiddenAt]) => ({
      profileId,
      hiddenAt: hiddenAt ? new Date(hiddenAt).toISOString() : null,
      hiddenAgoMs: hiddenAt ? now - hiddenAt : null,
      expiresInDays: (HIDE_MAX_AGE_MS && hiddenAt)
        ? Math.max(0, Math.round((hiddenAt + HIDE_MAX_AGE_MS - now) / 86_400_000))
        : null,
    }));
  };
  window.__grindrBlock_unhide = function (profileId) {
    const ok = unhideProfile(profileId, 'manual');
    if (!ok) console.log(`${LOG} ${profileId} was not on the hide list.`);
    return ok;
  };
  window.__grindrBlock_clearHiddenList = function () {
    const ids = [...hiddenProfileIds.keys()];
    for (const id of ids) unhideProfile(id, 'hide list cleared');
    console.log(`${LOG} hide list cleared (${ids.length} restored).`);
    return ids;
  };
  // Dump the block/hide/report-ish requests Grindr's OWN app has made (newest
  // last), so the real block endpoint can be identified when the built-ins 501.
  // Block one person via Grindr's normal UI, then call this and share the output.
  window.__grindrBlock_seenActions = function () {
    const now = Date.now();
    return seenBlockActions.map(r => ({ method: r.method, url: r.url, body: r.body, ageMs: now - r.at }));
  };
  // Arm a capture window (default 25s): logs EVERY mutating grindr.com request
  // (method+URL+body, fetch + XHR) so a NATIVE block reveals its real request even
  // if it's GraphQL or a non-'block' path. Usage: run this, then click Grindr's OWN
  // Block on a profile; the `[capture]` line that prints is the request to share.
  window.__grindrBlock_captureWrites = function (ms) {
    const dur = Math.max(1000, Math.min(Number(ms) || 25000, 120000));
    captureWritesUntil = Date.now() + dur;
    console.log(`${LOG} Capturing ALL grindr writes (fetch, XHR, WebSocket frames, sendBeacon; any *grindr* host) for ${Math.round(dur / 1000)}s. Now click Grindr's OWN "Block" (or Report/Hide) on a profile — the request prints here as "[capture] …". Share those lines. If NOTHING prints, the block is going through a service worker and only the DevTools Network tab will show it.`);
    return { capturingMs: dur };
  };
  // Diagnostic — peek at internal state. Fields:
  //   queueDepth         — jobs waiting/in-flight in the queue.
  //   sessionDead        — true if paused on a 401/403 (needs reset or re-login).
  //   backoffMsRemaining — ms left on a 429 backoff before the queue resumes.
  //   photoHashMapSize   — entries in the photo-hash→profileId index.
  //   authCaptured       — whether non-stale auth headers are currently held.
  //   authAgeMs          — age of the captured auth, or null if none.
  //   hourCount          — API calls in the rolling hour (vs MAX_PER_HOUR).
  //   undoableNow        — profiles currently inside their 30s unblock window.
  //   verifyBlocks       — whether block read-back verification is enabled.
  //   retrying           — blocks awaiting a retry: [{profileId, attempt, retryInMs}].
  //   cancelledInFlight  — count of in-flight blocks flagged to abort.
  //   endpointWrong      — true once a block hit 501/405 (dead endpoint; needs the
  //                        real URL via __grindrBlock_seenActions()).
  //   seenBlockActions   — count of Grindr-app block/hide requests observed so far.
  //   logLevel           — current verbosity (see __grindrBlock_setLog).
  //   localBlockListSize — profiles on the persistent local block list.
  //   textHiddenSize     — profiles hidden DOM-only by the text filter this session.
  window.__grindrBlock_state = function () {
    const now = Date.now();
    return {
      queueDepth: blockQueue.length,
      sessionDead: blockSessionDead,
      // Auth rejections, so a capture shows why a queue went quiet rather than
      // leaving "stopped" and "nothing to do" looking identical.
      authRejectCount,
      lastAuthRejectStatus,
      lastAuthRejectAgoMin: lastAuthRejectAt ? Math.floor((Date.now() - lastAuthRejectAt) / 60000) : null,
      backoffMsRemaining: Math.max(0, blockBackoffUntil - now),
      photoHashMapSize: photoHashToProfileId.size,
      authCaptured: !!getCapturedAuth(),
      authAgeMs: capturedAuth ? now - capturedAuth.capturedAt : null,
      hourCount: recentManualCalls.length + recentBulkCalls.length,
      manualHourCount: recentManualCalls.length,
      bulkHourCount: recentBulkCalls.length,
      undoableNow: recentlyBlocked.size,
      verifyBlocks: VERIFY_BLOCKS,
      retrying: blockQueue
        .filter(j => j.action === 'block' && j.attempt > 0)
        .map(j => ({ profileId: j.profileId, attempt: j.attempt, retryInMs: Math.max(0, (j.notBefore || 0) - now) })),
      cancelledInFlight: cancelledBlocks.size,
      endpointWrong: endpointWrongWarned,
      seenBlockActions: seenBlockActions.length,
      logLevel: LOG_LEVEL,
      localBlockListSize: blockedProfileIds.size,
      blocksPending: pendingBlockIds().length,      // still scanned for each sweep
      blocksConfirmed: blockConfirmedIds.size,
      hidesNeedingUpgrade: (() => { try { return hidesNeedingUpgrade().length; } catch (_e) { return null; } })(),
      autoDrain,      // propagated server-side; never scanned
      textHiddenSize: autoTextHiddenIds.size,
      hiddenListSize: hiddenProfileIds.size,
      unhideOnMessage: UNHIDE_ON_MESSAGE,
      hideMaxAgeDays: HIDE_MAX_AGE_MS ? Math.round(HIDE_MAX_AGE_MS / 86_400_000) : 0,
    };
  };
  // Stay-logged-in (see STAY_LOGGED_IN near the top of the file): report what's
  // active. active — master switch; idleClampFloorMin — delays at/above this many
  // minutes are rewritten; idleOverrideH — hours the idle countdown becomes (~99);
  // keepAliveMs — heartbeat interval, 0 if off; guardStorage — whether this
  // script's stored keys survive logout's clear().
  window.__grindrBlock_stayLoggedIn = function () {
    return {
      active: STAY_LOGGED_IN,
      idleClampFloorMin: IDLE_CLAMP_FLOOR_MS / 60_000,
      idleOverrideH: IDLE_TIMEOUT_OVERRIDE_MS / 3_600_000,
      keepAliveMs: KEEPALIVE_INTERVAL_MS,
      guardStorage: GUARD_LOCALSTORAGE,
      storageKeepPrefix: STORAGE_KEEP_PREFIX,
    };
  };
  // Skip-beta-dialog (see SKIP_BETA_DIALOG near the top): report status and allow
  // a manual dismiss from DevTools. active — master switch; sessionKey — the flag
  // the dialog is gated on; seeded — whether that flag is currently set;
  // dialogPresent — whether the dialog's dismiss button is in the DOM right now;
  // dismiss() — click it now.
  window.__grindrBlock_skipBetaDialog = function () {
    let seeded = null;
    try { seeded = !!sessionStorage.getItem(BETA_DIALOG_SS_KEY); } catch {}
    return {
      active: SKIP_BETA_DIALOG,
      sessionKey: BETA_DIALOG_SS_KEY,
      seeded,
      dialogPresent: !!document.getElementById(BETA_DIALOG_BTN_ID),
      dismiss: () => dismissBetaDialogIfPresent(),
    };
  };

  // Shift+right-click greeting (see the greeting-navigation section): inspect the
  // pending queue or fire a greeting at a profile from DevTools.
  //   __grindrBlock_greet(id)       — queue + open a chat and auto-send a greeting
  //                                   to profileId `id` (same as shift+right-click).
  //   __grindrBlock_pendingGreets() — { id: { phrase, ageMs } } still queued.
  window.__grindrBlock_greet = function (id) { return triggerShiftRightGreetForProfile(String(id)); };
  window.__grindrBlock_pendingGreets = function () {
    const now = Date.now();
    const out = {};
    for (const id of Object.keys(pendingGreets)) out[id] = { phrase: pendingGreets[id].phrase, ageMs: now - pendingGreets[id].ts };
    return out;
  };

  // Hotkeys (see HOTKEYS_ENABLED near the top).
  //   __grindrBlock_hotkeys()        — { enabled, keys, where, tiles, target… }.
  //   .next() / .prev()              — navigate from the console.
  //   .greet() / .unlock()           — fire the action keys from the console.
  window.__grindrBlock_hotkeys = function () {
    return {
      enabled: HOTKEYS_ENABLED,
      keys: {
        next: keyLabel(HOTKEY_NEXT_KEY()), prev: keyLabel(HOTKEY_PREV_KEY()),
        greet: keyLabel(HOTKEY_GREET_KEY()), album: keyLabel(HOTKEY_ALBUM_KEY()),
        block: keyLabel(HOTKEY_BLOCK_KEY()), hide: keyLabel(HOTKEY_HIDE_KEY()),
      },
      navInTextFields: HOTKEY_NAV_IN_TEXT_FIELDS,
      greetAdvances: HOTKEY_GREET_ADVANCES,
      blockAdvances: HOTKEY_BLOCK_ADVANCES,
      hiddenListSize: hiddenProfileIds.size,
      unhideOnMessage: UNHIDE_ON_MESSAGE,
      hideMaxAgeDays: HIDE_MAX_AGE_MS ? Math.round(HIDE_MAX_AGE_MS / 86_400_000) : 0,
      myProfileIdSeeded: myProfileIdIsSeeded,
      myProfileIdSource: albumState.myProfileIdSource || null,
      where: isProfileViewOpen() ? 'profile' : (isOnChatPage() ? 'chat' : 'grid'),
      tiles: listCascadeCards().length,
      cursorProfileId: hotkeyCursorId || null,
      lastViewedProfileId: lastViewedProfileId || null,
      resolvedTarget: resolveTargetProfileId() || null,
      // Navigation only. The acting members (greet/unlock/block/hide/unhide) used to
      // be exposed here as ungated closures — a bypass of the console arming gate,
      // since any page script could call __grindrBlock_hotkeys().greet() to send a
      // message or share a private album without arming. Use the gated
      // __grindrBlock_greet()/_unlockAlbum()/_block-equivalent APIs instead.
      next: () => navigateProfiles(1),
      prev: () => navigateProfiles(-1),
      clearCursor: () => clearHotkeyCursor(),
    };
  };

  // Albums (see the album section above).
  //   __grindrBlock_scanAlbums()          — with Chat → Albums open, pair every
  //                                         album id with the name on its tile and
  //                                         adopt that display order. Do this once.
  //   __grindrBlock_albums()              — rotation, discovered ids, ledger, my id.
  //   __grindrBlock_albumShares(id)       — LIVE read of who already has an album.
  //   __grindrBlock_setAlbumOrder([ids])  — set the unlock order by hand (persisted,
  //                                         wins over the ALBUM_ORDER seed); pass []
  //                                         to fall back to the seed.
  //   __grindrBlock_nameAlbum(id, name)   — label one album (cosmetic).
  //   __grindrBlock_unlockAlbum(pid)      — share the next album pid doesn't have.
  //   __grindrBlock_reshareAlbum(pid, id) — un-share then re-share, to re-notify.
  //   __grindrBlock_forgetAlbumShares(pid)— clear the local ledger (all, or one).
  window.__grindrBlock_scanAlbums = function () {
    const found = scanAlbumsFromDom();
    if (!found.length) {
      logWarn(`${LOG} scanAlbums: no album covers on screen. Open Chat → Albums (the "My Albums" panel) and run this again.`);
      showToast('Open Chat → Albums first', 'warn');
      return [];
    }
    albumState.order = found.map((a) => a.id);
    for (const a of found) { if (a.name) albumState.names[a.id] = a.name; }
    for (const a of found) { if (!albumState.discovered.includes(a.id)) albumState.discovered.push(a.id); }
    saveAlbumState();
    logInfo(`${LOG} scanAlbums: ${found.length} albums — ${found.map((a) => `${a.id}${a.name ? `(${a.name})` : ''}`).join(', ')}`);
    showToast(`Found ${found.length} albums`, 'ok');
    return albumRotation();
  };
  window.__grindrBlock_albums = function () {
    return {
      rotation: albumRotation(),
      orderSource: albumState.order.length ? 'runtime (scanned/set)' : 'ALBUM_ORDER seed',
      onlyExplicitOrder: ALBUM_ONLY_EXPLICIT_ORDER,
      discovered: [...albumState.discovered],
      names: { ...albumState.names },
      myProfileId: albumState.myProfileId || null,
      ledger: JSON.parse(JSON.stringify(albumState.shares)),
      cached: [...albumSharesCache.entries()].map(([id, v]) => ({ id, shares: v.ids.size, ageMs: Date.now() - v.at })),
    };
  };
  window.__grindrBlock_albumShares = async function (albumId) {
    const ids = await fetchAlbumShares(String(albumId), true);
    return ids ? [...ids] : null;
  };
  window.__grindrBlock_setAlbumOrder = function (ids) {
    albumState.order = Array.isArray(ids) ? ids.map(String) : [];
    saveAlbumState();
    return albumRotation();
  };
  // Name the rotation positionally, when the panel gave ids but no names:
  // pass the names in the order they appear in __grindrBlock_albums().rotation.
  window.__grindrBlock_nameAlbumsInOrder = function (names) {
    const rotation = albumRotation();
    (Array.isArray(names) ? names : []).forEach((n, i) => {
      if (rotation[i] && n) albumState.names[rotation[i].id] = String(n);
    });
    saveAlbumState();
    return albumRotation();
  };
  // Ask the API for each album's name (endpoint unconfirmed — fails quietly).
  window.__grindrBlock_loadAlbumNames = function () { return loadAlbumNames(); };
  // Your own profileId: normally learned from traffic, settable by hand if not.
  window.__grindrBlock_setMyProfileId = function (id) {
    if (!isPlausibleProfileId(String(id))) return null;
    albumState.myProfileId = String(id);
    albumState.myProfileIdSource = 'manual';
    myProfileIdIsSeeded = false;   // set by hand outranks the seed
    saveAlbumState();
    return albumState.myProfileId;
  };
  window.__grindrBlock_nameAlbum = function (id, name) {
    albumState.names[String(id)] = String(name || '');
    saveAlbumState();
    return albumRotation();
  };
  window.__grindrBlock_unlockAlbum = function (pid) { return shareNextAlbumWith(String(pid)); };
  window.__grindrBlock_reshareAlbum = function (pid, albumId) { return reshareAlbum(String(pid), albumId); };
  window.__grindrBlock_forgetAlbumShares = function (pid) {
    if (pid == null) { albumState.shares = {}; } else { delete albumState.shares[String(pid)]; }
    albumSharesCache.clear();
    saveAlbumState();
    return albumState.shares;
  };

  // One-call diagnosis for "I pressed the key and nothing happened". Reports every
  // precondition the action keys depend on, in the order they're checked, so the
  // failing one is obvious instead of silent.
  //   __grindrBlock_why()
  window.__grindrBlock_why = function () {
    const target = resolveTargetProfileId();
    const rotation = albumRotation();
    return {
      disabled: SCRIPT_DISABLED,                    // true → every hotkey is a no-op
      hotkeysEnabled: HOTKEYS_ENABLED,
      where: isProfileViewOpen() ? 'profile' : (isOnChatPage() ? 'chat' : 'grid'),
      overlayOpen: grindrOverlayOpen(),
      profileOverlayFromUrl: isProfileOverlayOpenFromUrl(),  // "?profile=true"
      lightboxOpen: isLightboxOpenFromUrl(),        // true → greet closes it before looking for Chat
      profileViewFound: !!findOpenProfileView(),    // false → findProfileChatButton REFUSES to search
      chatButtonFound: !!findProfileChatButton(),   // false → greet cannot start a conversation here
      authCaptured: !!getCapturedAuth(),            // false → no album call can be made
      greetMode: GREET_MODE,
      myProfileId: albumState.myProfileId || null,   // null → peer of a sorted conversation id is unresolvable
      conversationsSeen: seenConversationIds.size,   // 2 different ones are enough to learn myProfileId
      openConversation: openConversation.id || null, // whose chat is on screen (from Grindr's own traffic)
      openConversationAgeMs: openConversation.at ? (Date.now() - openConversation.at) : null,
      tiles: listCascadeCards().length,
      hoverResolves: !!lastHoverEl,
      resolvedTarget: target || null,               // null → the action keys have no target
      targetMismatch: target ? greetTargetMismatch(target) : null,  // true → greet will ABORT rather than send
      chatPeer: chatPeerIdFromPath() || null,
      chatRoute: target ? (chatRouteFor(target) || null) : null,
      lastViewedProfileId: lastViewedProfileId || null,
      albums: rotation.length,
      albumsSharedWithTarget: target ? (albumState.shares[target] || []).length : null,
      nextAlbumForTarget: target ? (rotation.find((a) => !ledgerHas(target, a.id)) || null) : null,
    };
  };

  // Kill switch (see the safe-mode section near the top).
  //   __grindrBlock_disable()  — turn every listener/observer/timer of this script
  //                              into a no-op and restore the patched globals.
  //                              Use it to answer "is the userscript doing this?"
  //                              without uninstalling: disable, reproduce, decide.
  //   __grindrBlock_enable()   — re-arm the listeners. The global patches are NOT
  //                              re-wrapped (reload the page for those).
  //   __grindrBlock_isDisabled()
  window.__grindrBlock_disable = function () {
    if (SCRIPT_DISABLED) return true;
    SCRIPT_DISABLED = true;
    try { clearHotkeyCursor(); } catch (_e) {}
    for (const o of installedObservers) { try { o.disconnect(); } catch (_e) {} }
    for (const id of installedIntervals) { try { clearInterval(id); } catch (_e) {} }
    try { window.fetch = origFetch; } catch (_e) {}
    try {
      XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
      XMLHttpRequest.prototype.open = origXhrOpen;
      XMLHttpRequest.prototype.send = origXhrSend;
    } catch (_e) {}
    if (origWsSendRef) { try { WebSocket.prototype.send = origWsSendRef; } catch (_e) {} }
    if (origWsAddRef) { try { WebSocket.prototype.addEventListener = origWsAddRef; } catch (_e) {} }
    if (origWsRemoveRef) { try { WebSocket.prototype.removeEventListener = origWsRemoveRef; } catch (_e) {} }
    if (origSendBeaconRef) { try { navigator.sendBeacon = origSendBeaconRef; } catch (_e) {} }
    if (origSetTimeoutRef) { try { window.setTimeout = origSetTimeoutRef; } catch (_e) {} }
    for (const { store, clear } of origStorageClears) { try { store.clear = clear; } catch (_e) {} }
    // Restore console too, so "is the userscript doing this?" can be answered fully.
    for (const k of Object.keys(origConsoleMethods)) { try { console[k] = origConsoleMethods[k]; } catch (_e) {} }
    diagConsolePatched = false;
    logWarn(`${LOG} DISABLED — all listeners are no-ops and the patched globals are restored. Reload the page to fully re-arm.`);
    showToast('Userscript disabled for this page', 'warn');
    return true;
  };
  window.__grindrBlock_enable = function () {
    if (!SCRIPT_DISABLED) return true;
    SCRIPT_DISABLED = false;
    // disable() disconnected every observer and cleared every interval, so simply
    // flipping the flag left the script half-dead: blocked profiles stopped being
    // hidden and the drain never ran again. Re-arm the block-enforcement observer +
    // sweep and the drain (their handles were dead; reset the tracking arrays so a
    // later disable() clears the fresh ones, not stale entries).
    installedObservers.length = 0;
    installedIntervals.length = 0;
    try { installBlockListEnforcement(); } catch (e) { logWarn(`${LOG} enable: enforcement re-arm failed:`, e); }
    try { installAutoDrain(); } catch (e) { logWarn(`${LOG} enable: drain re-arm failed:`, e); }
    logWarn(`${LOG} re-armed block enforcement + drain. Reload the page to restore the network patches and the HUD refresh.`);
    return true;
  };
  window.__grindrBlock_isDisabled = function () { return SCRIPT_DISABLED; };


  // Wrap the acting members now that every one of them has been assigned.
  // NOT gated: disable/enable (the kill switch — gating it would defeat the one
  // function whose entire value is being reachable instantly), and
  // cancelBlock/clearQueue (local safety valves that stop our own traffic).
  for (const name of ['greet', 'unlockAlbum', 'reshareAlbum', 'clearBlockList', 'clearHiddenList', 'removeFromBlockList', 'unhide', 'undoAll', 'reset', 'setMyProfileId', 'setAlbumOrder', 'nameAlbum']) {
    const fn = window['__grindrBlock_' + name];
    if (typeof fn === 'function') window['__grindrBlock_' + name] = gated(name, fn);
  }
  logInfo(`${LOG} 12 acting console function(s) disarmed until __grindrBlock_arm(). disable()/enable()/cancelBlock()/clearQueue() stay ungated — they are the kill switch and the safety valves, and their whole value is being reachable in ten seconds.`);
  // ── On-screen legend + diagnostics HUD ────────────────────────────────────
  // A hotkey that silently does nothing is the hardest thing to debug in this
  // script, and it has now happened several times: a key that meant "greet" in
  // one version means "block" in the next, and there is no way to tell from the
  // page which build is actually installed. The HUD answers both questions
  // without opening the console — what the keys do RIGHT NOW, in this build, and
  // what the script thinks it is looking at.
  //
  // Everything lives under an id starting with "grindr-block-", which is what
  // isOwnGreetUi() keys on, so the HUD can never be mistaken for Grindr's own UI
  // by any of the matchers.
  // ── User settings (HUD "settings" tab) ────────────────────────────────────
  // Behaviour that is a matter of taste rather than correctness lives here, so it
  // can be changed without editing the file.
  const SETTINGS_STORAGE_KEY = 'grindrMiddleClickSettings_v1';
  const SETTINGS_DEFAULTS = {
    // What happens after a greet is delivered.
    //   'advance' — step to the next profile, ready to greet again
    //   'chat'    — stay in the conversation you just opened
    //   'stay'    — leave the profile exactly as it is
    //   'grid'    — return to the grid (the pre-0.44 behaviour)
    afterGreet: 'advance',
    // Same, after a block lands.
    afterBlock: 'advance',
    // Collapse the blocked profile's card immediately rather than waiting for
    // the enforcement sweep.
    hideCardOnBlock: true,
    // Touch only: long-press a profile tile to block it (the touch equivalent of a
    // middle-click). Off by default because a long press during a scroll can
    // misfire; enable it in the HUD settings tab.
    longPressBlock: false,
  };
  // The allowed value set for each setting. Storage and the console API are both
  // untrusted inputs — a corrupted afterBlock falls through applyAfterAction's
  // default and silently advances; the string 'false' is truthy for hideCardOnBlock.
  const SETTINGS_OPTIONS = {
    afterGreet: ['advance', 'chat', 'stay', 'grid'],
    afterBlock: ['advance', 'stay', 'grid'],
    hideCardOnBlock: [true, false],
    longPressBlock: [true, false],
  };
  let settings = { ...SETTINGS_DEFAULTS };
  // Restore user settings — copy only keys whose stored value is a known option.
  function loadSettings() {
    const o = readJson(SETTINGS_STORAGE_KEY, null, 'settings');
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    const next = { ...SETTINGS_DEFAULTS };
    for (const k of Object.keys(SETTINGS_DEFAULTS)) {
      if (Object.prototype.hasOwnProperty.call(o, k) && SETTINGS_OPTIONS[k].includes(o[k])) next[k] = o[k];
    }
    settings = next;
  }
  // Change one setting, persist it, and redraw the HUD.
  function setSetting(key, value) {
    if (!(key in SETTINGS_DEFAULTS)) return false;
    if (!SETTINGS_OPTIONS[key].includes(value)) return false;
    settings[key] = value;
    writeJson(SETTINGS_STORAGE_KEY, settings, 'settings');
    logInfo(`${LOG} setting ${key} = ${value}`);
    if (key === 'longPressBlock') { try { syncLongPressStyle(); } catch (_e) {} }
    refreshHud();
    return true;
  }
  loadSettings();

  // Carry out whichever after-action the user chose. Shared by greet and block so
  // the two behave consistently.
  function applyAfterAction(mode, profileId, onGrid) {
    switch (mode) {
      case 'stay':
        return;
      case 'chat':
        // Already in the conversation — do nothing, just don't route away.
        return;
      case 'grid':
        pressEscape();
        setTimeout(() => {
          const here = location.pathname + location.search;
          if (here !== '/' && !here.startsWith('/chat')) spaNavigate('/');
        }, 250);
        return;
      case 'advance':
      default:
        // On an open profile, advance Grindr's own pager; on the grid, walk the
        // tile cursor. navigateProfiles already knows the difference.
        setTimeout(() => {
          try { navigateProfiles(1); } catch (e) { logTrace(`${LOG} advance failed:`, e); }
        }, 200);
        return;
    }
  }

  const HUD_ID = 'grindr-block-hud';
  const HUD_STORAGE_KEY = 'grindrMiddleClickHud_v1';
  const HUD_TOGGLE_KEY = '\\';        // backslash — outside the six-key cluster
  let hudOpen = false;
  let hudTab = 'main';   // 'main' | 'settings'
  let hudEl = null;
  let hudTimer = 0;

  // Snapshot of everything the HUD displays. Doubles as its re-render
  // fingerprint.
  function hudState() {
    let target = '';
    try { target = resolveTargetProfileId() || ''; } catch (_e) {}
    const pending = (() => { try { return pendingBlockIds().length; } catch (_e) { return '?'; } })();
    return {
      version: SCRIPT_VERSION,
      where: (() => { try { return isProfileViewOpen() ? 'profile' : (isOnChatPage() ? 'chat' : 'grid'); } catch (_e) { return '?'; } })(),
      target,
      targetState: describeTargetState(target),
      blocks: `${blockedProfileIds.size} (${pending} pending)`,
      capWaitMin: capWaitUntil > Date.now() ? Math.ceil((capWaitUntil - Date.now()) / 60000) : 0,
      sessionDead: blockSessionDead,
      authRejectCount,
      lastAuthRejectStatus,
      lastAuthRejectAgoMin: lastAuthRejectAt ? Math.floor((Date.now() - lastAuthRejectAt) / 60000) : null,
      hides: hiddenProfileIds.size,
      // The two rolling-hour budgets, so the HUD can say what the limit is, how
      // much of it is gone, and when it frees up — rather than leaving a paused
      // queue looking like a broken one.
      budget: (() => {
        try {
          pruneCallWindows();
          const now = Date.now();
          return {
            capsEnabled: HOURLY_CAPS_ENABLED,
            manualUsed: recentManualCalls.length, manualCap: MANUAL_HOURLY_CAP,
            bulkUsed: recentBulkCalls.length, bulkCap: DRAIN_HOURLY_CAP,
            manualResetMin: windowResetMinutes(recentManualCalls[0], now),
            bulkResetMin: windowResetMinutes(recentBulkCalls[0], now),
          };
        } catch (_e) { return null; }
      })(),
      greetMode: GREET_MODE,
      armed: consoleArmed,
      recording: diagRecording,
      entries: diagCount(),
      // In the fingerprint so the drain button actually updates. Without these
      // the label was computed once and never redrawn, which made a running
      // drain look like a dead button.
      upgradesLeft: (() => { try { return hidesNeedingUpgrade().length; } catch (_e) { return 0; } })(),
      stuck: (() => { try { return stuckUpgradeIds().length; } catch (_e) { return 0; } })(),
      draining: autoDrain,
      queued: blockQueue.length,
      lastBlocked: lastBlockedProfileId || '',
    };
  }

  // Why a key might refuse. This is the line that would have explained the last
  // two failures immediately.
  function describeTargetState(id) {
    if (!id) return 'none resolved';
    const bits = [];
    if (blockedProfileIds.has(id)) bits.push(blockConfirmedIds.has(id) ? 'BLOCKED (confirmed)' : 'BLOCKED (pending)');
    if (hiddenProfileIds.has(id)) bits.push('HIDDEN');
    if (!bits.length) return 'ok';
    // Grindr refuses to open a conversation with someone you have hidden or
    // blocked — the chat endpoint 403s and the profile renders no Chat button —
    // so a greet against this target cannot succeed no matter what we click.
    bits.push('→ greet will fail: Grindr hides the Chat button for these');
    return bits.join(' ');
  }

  // Create the HUD element, restore its position, and make it draggable.
  function buildHud() {
    if (hudEl || !document.body) return;
    const wrap = document.createElement('div');
    wrap.id = HUD_ID;
    wrap.style.cssText = [
      'position:fixed', 'right:12px', 'z-index:2147483600',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#e8e8e8', 'background:rgba(18,18,20,.94)', 'border:1px solid #3a3a40',
      'border-radius:10px', 'box-shadow:0 6px 24px rgba(0,0,0,.45)',
      'user-select:none', '-webkit-user-select:none', 'cursor:move',
      // On touch the fixed 340px panel is too wide for a phone and bottom:12px
      // sits under Grindr's bottom nav bar; lift it clear (respecting the iOS home
      // indicator via safe-area-inset), fit the viewport, and cap the height so the
      // action buttons and tabs stay reachable with an internal scroll.
      IS_TOUCH ? 'bottom:calc(env(safe-area-inset-bottom,0px) + 72px)' : 'bottom:12px',
      IS_TOUCH ? 'max-width:min(340px,92vw)' : 'max-width:340px',
      IS_TOUCH ? 'max-height:68vh' : 'max-height:none',
      IS_TOUCH ? 'overflow-y:auto' : '',
      IS_TOUCH ? '-webkit-overflow-scrolling:touch' : '',
    ].filter(Boolean).join(';');
    document.body.appendChild(wrap);
    hudEl = wrap;
    restoreHudPosition();
    makeHudDraggable(wrap);
    renderHud();
  }

  // ── Draggable HUD ─────────────────────────────────────────────────────────
  // Drag by any part of the panel that isn't a control, so it can be moved off
  // whatever it happens to be covering. Position is stored as a left/top pair
  // and clamped back into view on restore, so a window resize can't strand it.
  const HUD_POS_KEY = 'grindrMiddleClickHudPos_v1';
  let hudDrag = null;
  // Let the HUD be dragged by any non-button part of itself.
  function makeHudDraggable(el) {
    const onGrab = (clientX, clientY) => {
      const r = el.getBoundingClientRect();
      hudDrag = { dx: clientX - r.left, dy: clientY - r.top, moved: false };
    };
    el.addEventListener('mousedown', (e) => {
      // Buttons keep their normal behaviour.
      if (e.target && e.target.closest && e.target.closest('button')) return;
      if (e.button !== 0) return;
      onGrab(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!hudDrag || !hudEl) return;
      hudDrag.moved = true;
      placeHud(e.clientX - hudDrag.dx, e.clientY - hudDrag.dy);
    });
    document.addEventListener('mouseup', () => {
      if (!hudDrag) return;
      if (hudDrag.moved) persistHudPosition();
      hudDrag = null;
    });
    // Touch drag: same model, so the HUD can be repositioned on a phone. A touch
    // that starts on a button is left alone (the tap acts). touchmove is
    // non-passive here so dragging the panel doesn't also scroll the page.
    el.addEventListener('touchstart', (e) => {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('button')) return;
      // On touch, only the header is a drag handle — the rest of the panel scrolls,
      // so a swipe over the content list isn't hijacked into moving the panel.
      if (!e.target.closest('[data-huddrag]')) return;
      if (!e.touches || e.touches.length !== 1) return;
      onGrab(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!hudDrag || !hudEl || !e.touches || !e.touches[0]) return;
      hudDrag.moved = true;
      placeHud(e.touches[0].clientX - hudDrag.dx, e.touches[0].clientY - hudDrag.dy);
      if (e.cancelable) e.preventDefault();   // we own this gesture: don't scroll too
    }, { passive: false });
    const endTouch = () => { if (!hudDrag) return; if (hudDrag.moved) persistHudPosition(); hudDrag = null; };
    el.addEventListener('touchend', endTouch, { passive: true });
    el.addEventListener('touchcancel', endTouch, { passive: true });
  }
  // Position the HUD, clamped inside the viewport.
  function placeHud(left, top) {
    if (!hudEl) return;
    const r = hudEl.getBoundingClientRect();
    const maxL = Math.max(0, (window.innerWidth || 0) - r.width);
    const maxT = Math.max(0, (window.innerHeight || 0) - r.height);
    const L = Math.min(Math.max(0, left), maxL);
    const T = Math.min(Math.max(0, top), maxT);
    hudEl.style.left = `${L}px`;
    hudEl.style.top = `${T}px`;
    hudEl.style.right = 'auto';
    hudEl.style.bottom = 'auto';
  }
  // Remember where the HUD was dragged to.
  function persistHudPosition() {
    if (!hudEl) return;
    const r = hudEl.getBoundingClientRect();
    try { localStorage.setItem(HUD_POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch (_e) {}
  }
  // Put the HUD back where it was left.
  function restoreHudPosition() {
    const pos = readJson(HUD_POS_KEY, null, 'hud position');
    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') placeHud(pos.left, pos.top);
  }
  window.__grindrBlock_resetHudPosition = function () {
    try { localStorage.removeItem(HUD_POS_KEY); } catch (_e) {}
    if (hudEl) { hudEl.style.left = 'auto'; hudEl.style.top = 'auto'; hudEl.style.right = '12px'; hudEl.style.bottom = '12px'; }
    return 'HUD moved back to the bottom-right corner.';
  };

  // One label/value row in the HUD.
  function hudRow(k, v) {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;gap:8px;justify-content:space-between;padding:1px 0';
    const a = document.createElement('span'); a.textContent = k; a.style.cssText = 'color:#8f8f9a;white-space:nowrap';
    const b = document.createElement('span'); b.textContent = String(v); b.style.cssText = 'text-align:right;word-break:break-word';
    r.append(a, b);
    return r;
  }

  // Draw the HUD for the active tab. Called only when hudState() changes.
  function renderHud() {
    if (!hudEl) return;
    hudEl.textContent = '';
    if (!hudOpen) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.textContent = diagRecording ? '● REC' : '⌨';
      badge.title = `Grindr hotkeys — click or press ${HUD_TOGGLE_KEY} for the legend`;
      badge.style.cssText = 'all:unset;cursor:pointer;padding:6px 10px;display:block;font:12px ui-monospace,monospace;color:' + (diagRecording ? '#ff6b6b' : '#e8e8e8');
      badge.addEventListener('click', () => { hudOpen = true; persistHud(); renderHud(); });
      hudEl.appendChild(badge);
      return;
    }

    const head = document.createElement('div');
    head.setAttribute('data-huddrag', '1');   // touch drag handle (see makeHudDraggable)
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #3a3a40';
    const title = document.createElement('strong');
    const st = hudState();
    title.textContent = `GrindrBlock v${st.version}`;
    title.style.cssText = 'font-weight:600';
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.textContent = hudTab === 'main' ? 'settings' : '‹ back';
    tabBtn.style.cssText = 'all:unset;cursor:pointer;padding:2px 6px;color:#8f8f9a;font-size:11px;border:1px solid #4a4a52;border-radius:6px';
    tabBtn.addEventListener('click', () => { hudTab = hudTab === 'main' ? 'settings' : 'main'; renderHud(); });
    const greetBtn = document.createElement('button');
    greetBtn.type = 'button';
    greetBtn.textContent = 'greetings';
    greetBtn.style.cssText = 'all:unset;cursor:pointer;padding:2px 6px;color:#8f8f9a;font-size:11px;border:1px solid #4a4a52;border-radius:6px';
    greetBtn.addEventListener('click', () => { hudTab = hudTab === 'greetings' ? 'main' : 'greetings'; renderHud(); });
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '×';
    close.style.cssText = 'all:unset;cursor:pointer;padding:0 4px;color:#8f8f9a;font-size:16px';
    close.addEventListener('click', () => { hudOpen = false; persistHud(); renderHud(); });
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:8px;align-items:center';
    right.append(greetBtn, tabBtn, close);
    head.append(title, right);

    if (hudTab === 'settings') { hudEl.append(head, renderSettingsTab()); return; }
    if (hudTab === 'greetings') { hudEl.append(head, renderGreetingsTab()); return; }

    const keys = document.createElement('div');
    keys.style.cssText = 'padding:8px 10px;border-bottom:1px solid #3a3a40';
    const kh = document.createElement('div');
    kh.textContent = 'KEYS';
    kh.style.cssText = 'color:#8f8f9a;letter-spacing:.08em;font-size:10px;margin-bottom:4px';
    keys.appendChild(kh);
    // Read from the actual constants, so the legend can never drift from the
    // build — the drift is precisely what made the last two failures confusing.
    for (const [k, label, action] of [
      [HOTKEY_GREET_KEY(), 'greet', 'greet'],
      [HOTKEY_ALBUM_KEY(), 'unlock album', 'album'],
      [HOTKEY_BLOCK_KEY(), 'block', 'block'],
      [HOTKEY_HIDE_KEY(), 'hide', 'hide'],
      [HOTKEY_PREV_KEY(), 'previous profile', 'prev'],
      [HOTKEY_NEXT_KEY(), 'next profile', 'next'],
    ]) {
      const row = hudRow(keyLabel(k), label);
      // Click a row, press a key, and whatever your keyboard ACTUALLY sends is
      // stored. This is the end of guessing which keys exist on your hardware.
      row.style.cursor = 'pointer';
      row.title = 'click, then press a key to rebind';
      row.addEventListener('click', () => beginRebind(action, row));
      keys.appendChild(row);
    }
    const resetRow = document.createElement('div');
    resetRow.textContent = 'click a key to rebind · dbl-click here to reset';
    resetRow.style.cssText = 'color:#6f6f78;font-size:10px;margin-top:4px;cursor:pointer';
    resetRow.addEventListener('dblclick', () => clearKeyBindings());
    keys.appendChild(resetRow);
    const note = document.createElement('div');
    note.textContent = 'all six ignored while typing';
    note.style.cssText = 'color:#6f6f78;font-size:10px;margin-top:4px';
    keys.appendChild(note);

    const state = document.createElement('div');
    state.style.cssText = 'padding:8px 10px;border-bottom:1px solid #3a3a40';
    const sh = document.createElement('div');
    sh.textContent = 'STATE';
    sh.style.cssText = 'color:#8f8f9a;letter-spacing:.08em;font-size:10px;margin-bottom:4px';
    state.appendChild(sh);
    state.appendChild(hudRow('where', st.where));
    state.appendChild(hudRow('target', st.target || '—'));
    const tsRow = hudRow('status', st.targetState);
    if (st.targetState !== 'ok' && st.targetState !== 'none resolved') tsRow.style.color = '#ffb86b';
    state.appendChild(tsRow);
    state.appendChild(hudRow('blocks', st.blocks));
    if (st.capWaitMin) {
      const r = hudRow('block cap', `paused ${st.capWaitMin}m`);
      r.style.color = '#ffb86b';
      r.title = 'The rolling hourly cap is spent. Queued blocks resume when the window rolls.';
      state.appendChild(r);
    }
    if (st.queued) state.appendChild(hudRow('queued', `${st.queued} waiting`));
    if (st.budget) {
      // Always shown, spent or not: "why has nothing happened for 40 minutes" is
      // the question these two rows exist to answer.
      const bRow = (label, used, cap, resetMin, tip) => {
        // With the caps off the counters still say how hard we are hitting the
        // API, which is worth seeing — but "/cap per hr" would imply a ceiling
        // that is not enforced, and "frees 1 in Nm" a wait that is not happening.
        if (!st.budget.capsEnabled) {
          const r = hudRow(label, `${used} this hr · no limit`);
          r.title = tip + ' Hourly caps are DISABLED (HOURLY_CAPS_ENABLED=false).';
          return r;
        }
        const r = hudRow(label, `${used}/${cap} per hr${used ? ` · frees 1 in ${resetMin}m` : ''}`);
        if (used >= cap) r.style.color = '#ffb86b';
        else if (used >= cap * 0.8) r.style.color = '#e0d070';
        r.title = tip;
        return r;
      };
      state.appendChild(bRow('your blocks', st.budget.manualUsed, st.budget.manualCap,
        st.budget.manualResetMin,
        'API calls you caused in the last hour, against your own share of the cap. '
        + 'The auto-drain cannot spend this.'));
      state.appendChild(bRow('drain blocks', st.budget.bulkUsed, st.budget.bulkCap,
        st.budget.bulkResetMin,
        'API calls the background hide-to-block drain made in the last hour, against its '
        + 'own share. When this is spent the drain pauses and your own blocks keep working.'));
    }
    // A 401 is the most consequential thing that can happen to the queue — it
    // latches the pause, and before v0.58.0 nothing could clear it. A queue going
    // quiet then looked exactly like a queue with nothing to do. Say so plainly.
    if (st.sessionDead) {
      const r = hudRow('auth', `REJECTED ${st.lastAuthRejectStatus || 401} — queue paused`);
      r.style.color = '#ff7b72';
      r.title = 'Grindr rejected our credentials, so the queue is paused. It retries by '
        + 'itself every 15s and resumes when one succeeds; "resume queue" forces it now.';
      state.appendChild(r);
    } else if (st.authRejectCount) {
      const ago = st.lastAuthRejectAgoMin;
      const r = hudRow('auth', `recovered · ${st.authRejectCount} reject${st.authRejectCount === 1 ? '' : 's'}`
        + (ago != null ? `, last ${ago}m ago` : ''));
      r.style.color = '#e0d070';
      r.title = 'Grindr rejected our credentials earlier in this session and the queue '
        + 'recovered on its own. Shown so a stall you noticed has an explanation.';
      state.appendChild(r);
    }
    if (st.stuck) {
      const r = hudRow('wont convert', `${st.stuck} · blocked locally only`);
      r.style.color = '#e0d070';
      r.title = 'These were POSTed to the block endpoint repeatedly, answered 200 every time, '
        + 'and never appeared in Grindr\'s block list — hidden profiles (hide and block are '
        + 'mutually exclusive) or deleted accounts. They stay blocked locally and are excluded '
        + 'from the backlog so it can actually reach zero. __grindrBlock_stuckBlocks() lists '
        + 'them; __grindrBlock_stuckBlocks(true) retries them.';
      state.appendChild(r);
    }
    state.appendChild(hudRow('hides', st.hides));
    state.appendChild(hudRow('greet mode', st.greetMode));
    state.appendChild(hudRow('console', st.armed ? 'armed' : 'disarmed'));

    const diag = document.createElement('div');
    diag.style.cssText = 'padding:8px 10px;display:flex;gap:6px;flex-wrap:wrap';
    const mkBtn = (label, fn, accent) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'all:unset;cursor:pointer;padding:4px 8px;border:1px solid #4a4a52;border-radius:6px;font:11px ui-monospace,monospace;color:' + (accent || '#e8e8e8');
      b.addEventListener('click', fn);
      return b;
    };
    diag.appendChild(mkBtn(diagRecording ? `■ stop (${st.entries})` : '● record', () => {
      if (diagRecording) stopDiagRecording(); else startDiagRecording();
      renderHud();
    }, diagRecording ? '#ff6b6b' : '#e8e8e8'));
    diag.appendChild(mkBtn('save', () => saveDiagReport()));
    // Its own button on purpose. Chrome blocks a SECOND automatic download from
    // one gesture behind an "allow multiple downloads?" prompt that is easy to
    // miss — which is why the .har silently never appeared. One click, one file.
    diag.appendChild(mkBtn(`har (${diagNet.length})`, () => saveDiagHar()));
    // Reconcile, badged with how many local entries are still only HIDES. A hide
    // never removes anyone from the cascade, so that number is "how many blocks
    // are not really doing anything yet". Clicking with a badge upgrades a batch.
    const upgradeCount = (() => { try { return hidesNeedingUpgrade().length; } catch (_e) { return 0; } })();
    const stuckCount = (() => { try { return stuckUpgradeIds().length; } catch (_e) { return 0; } })();
    diag.appendChild(mkBtn(upgradeCount ? `reconcile (${upgradeCount})` : 'reconcile', (ev) => {
      const btn = ev && ev.currentTarget;
      if (btn) btn.textContent = 'reconciling…';
      reconcileBlockTiers(true).then((r) => {
        if (!r) showToast('Reconcile skipped — no auth captured yet, or nothing blocked', 'warn');
        else showToast(`Reconciled: ${r.promoted} confirmed, ${r.demoted} demoted, ${r.pending} pending`, 'ok');
        // Now that we know what Grindr actually holds, upgrade a batch of the
        // entries that are still only hides.
        const left = hidesNeedingUpgrade().length;
        if (left) upgradeHidesToBlocks(UPGRADE_BATCH);
        renderHud();
      }).catch((e) => { logError(`${LOG} reconcile failed:`, e); showToast('Reconcile failed — see console', 'err'); renderHud(); });
    }, upgradeCount ? '#e8b93b' : null));
    // Auto-drain toggle, showing what is left to upgrade.
    if (upgradeCount || autoDrain) {
      diag.appendChild(mkBtn(
        autoDrain ? `■ draining (${upgradeCount})` : `▶ drain ${upgradeCount}`,
        () => { setAutoDrain(!autoDrain); if (!autoDrain) return; drainTick().catch(() => {}); },
        autoDrain ? '#6bd68a' : '#e8b93b'));
    }
    // Resume a paused queue. Only shown when something is actually holding it, so
    // its presence is itself the signal that the queue is stopped rather than idle.
    // Calls resetQueuePauses() directly: __grindrBlock_reset is gated behind
    // __grindrBlock_arm(), and that gate exists to stop a drive-by script on
    // grindr.com calling it — a click on our own HUD is not that.
    if (st.sessionDead || st.capWaitMin) {
      diag.appendChild(mkBtn('▶ resume queue', () => {
        const r = resetQueuePauses();
        showToast(r.wasPaused
          ? `Queue resumed — ${r.queued} job(s) waiting`
          : `Nothing was paused — ${r.queued} job(s) waiting`, 'ok');
        renderHud();
      }, '#ff7b72'));
    }
    // Reverse the most recent block, long after its 30-second toast has gone.
    if (lastBlockedProfileId) {
      diag.appendChild(mkBtn(`unblock ${lastBlockedProfileId}`, () => {
        const id = lastBlockedProfileId;
        removeFromLocalBlockList(id);
        if (!cancelQueuedBlock(id)) enqueueAction(id, 'unblock');
        restoreBlockedCardInDom(id);
        clearLastBlocked();
        showToast(`Unblocking ${id}…`, 'ok');
        renderHud();
      }, '#ff9b6b'));
    }

    // ── Touch action buttons ────────────────────────────────────────────────
    // Mobile has no middle-click, shift-click, or hardware keys, so these are the
    // on-screen path: tap to act on the profile you have OPEN (resolved via the
    // same URL / open-profile / cursor strategy the hotkeys use). Touch only, so
    // the desktop HUD is unchanged. Large hit targets for fingers.
    let actions = null;
    if (IS_TOUCH) {
      actions = document.createElement('div');
      actions.style.cssText = 'padding:8px 10px;border-bottom:1px solid #3a3a40';
      const ah = document.createElement('div');
      ah.textContent = st.target ? `ACTIONS · target ${st.target}` : 'ACTIONS · open a profile first';
      ah.style.cssText = 'color:#8f8f9a;letter-spacing:.08em;font-size:10px;margin-bottom:6px';
      actions.appendChild(ah);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px';
      const bigBtn = (label, fn, accent) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label;
        b.style.cssText = 'all:unset;text-align:center;cursor:pointer;padding:11px 8px;border:1px solid #4a4a52;border-radius:8px;font:600 13px ui-monospace,monospace;color:' + (accent || '#e8e8e8');
        b.addEventListener('click', () => { try { fn(); } catch (e) { logWarn(`${LOG} HUD action failed:`, e); } renderHud(); });
        return b;
      };
      grid.appendChild(bigBtn('Block', () => hotkeyBlockTarget(), '#ff8a8a'));
      grid.appendChild(bigBtn('Hide', () => hotkeyHideTarget(), '#e8b93b'));
      grid.appendChild(bigBtn('Greet', () => hotkeyGreetTarget(), '#6bd6c8'));
      grid.appendChild(bigBtn('Unlock', () => hotkeyUnlockAlbum(), '#8fb3ff'));
      actions.appendChild(grid);
      if (settings.longPressBlock) {
        const hint = document.createElement('div');
        hint.textContent = 'long-press a tile to block';
        hint.style.cssText = 'color:#6f6f78;font-size:10px;margin-top:6px';
        actions.appendChild(hint);
      }
    }

    // The keyboard legend is meaningless on a touch device (no such keys), so the
    // action buttons above replace it there.
    hudEl.append(head, ...(IS_TOUCH ? [] : [keys]), ...(actions ? [actions] : []), state, diag);
  }

  // Redraw the HUD if it is open.
  function refreshHud() { try { if (hudOpen && hudEl) renderHud(); } catch (_e) {} }
  // Capture the next keydown and bind it. Uses its own one-shot listener in the
  // capture phase so it sees the key before the hotkey handler can act on it.
  let rebindPending = null;
  // Capture the next keypress and bind it to an action.
  function beginRebind(action, row) {
    if (rebindPending) return;
    if (row.firstChild) row.firstChild.textContent = 'press a key…';
    let to = 0;
    // Time-box the capture and cancel it on a click elsewhere. Without this, an
    // abandoned rebind left a document-level capture-phase keydown armed forever:
    // the next character typed anywhere (e.g. into the chat composer) was
    // preventDefault'd, swallowed, and silently became the new binding.
    const cancel = (msg) => {
      clearTimeout(to);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onAway, true);
      rebindPending = null;
      if (msg) showToast(msg, 'warn');
      refreshHud();
    };
    const onAway = () => cancel('Rebind cancelled');
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(to);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onAway, true);
      rebindPending = null;
      if (e.key === 'Escape') { showToast('Rebind cancelled', 'warn'); refreshHud(); return; }
      setKeyBinding(action, e.key);
    };
    rebindPending = onKey;
    to = setTimeout(() => cancel('Rebind timed out'), 10_000);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onAway, true);
    showToast(`Press the key you want for "${action}" (Esc to cancel)`, 'ok');
  }

  // The settings tab. Each row is a labelled set of choices; clicking one stores
  // it immediately. Kept to behaviour the user actually asked to control rather
  // than exposing every constant in the file.
  function renderSettingsTab() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:8px 10px';
    const group = (label, key, opts, help) => {
      const h = document.createElement('div');
      h.textContent = label;
      h.style.cssText = 'color:#8f8f9a;letter-spacing:.08em;font-size:10px;margin:6px 0 4px';
      wrap.appendChild(h);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:2px';
      for (const [val, text] of opts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        const on = settings[key] === val;
        b.style.cssText = 'all:unset;cursor:pointer;padding:3px 8px;border-radius:6px;font:11px ui-monospace,monospace;'
          + (on ? 'background:#e8b93b;color:#1a1a1c;' : 'border:1px solid #4a4a52;color:#e8e8e8;');
        b.addEventListener('click', () => setSetting(key, val));
        row.appendChild(b);
      }
      wrap.appendChild(row);
      if (help) {
        const p = document.createElement('div');
        p.textContent = help;
        p.style.cssText = 'color:#6f6f78;font-size:10px;margin-bottom:6px';
        wrap.appendChild(p);
      }
    };

    group('AFTER GREET', 'afterGreet', [
      ['advance', 'next profile'], ['chat', 'stay in chat'],
      ['stay', 'stay put'], ['grid', 'back to grid'],
    ], 'What happens once the message is delivered.');

    group('AFTER BLOCK', 'afterBlock', [
      ['advance', 'next profile'], ['stay', 'stay put'], ['grid', 'back to grid'],
    ], 'What happens once the block lands.');

    group('BLOCKED CARD', 'hideCardOnBlock', [
      [true, 'hide immediately'], [false, 'leave it'],
    ], 'Grindr keeps serving profiles you have hidden, so hiding the card locally is what makes a block look like it worked.');

    if (IS_TOUCH) {
      group('LONG-PRESS BLOCK', 'longPressBlock', [
        [true, 'on'], [false, 'off'],
      ], 'Touch: press and hold a profile tile to block it (the middle-click equivalent). Off by default because a long press during a scroll can misfire.');
    }

    const foot = document.createElement('div');
    foot.textContent = 'stored per browser · __grindrBlock_settings() to read or set';
    foot.style.cssText = 'color:#6f6f78;font-size:10px;margin-top:8px;border-top:1px solid #3a3a40;padding-top:6px';
    wrap.appendChild(foot);
    return wrap;
  }

  // The greetings tab: a plain textarea, one phrase per line. Deliberately not a
  // list of add/remove rows — editing prose is what a textarea is for, and this
  // list gets rewritten wholesale far more often than it gets appended to.
  function renderGreetingsTab() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:8px 10px';
    const h = document.createElement('div');
    h.textContent = `GREETINGS (${activeGreetings().length})${greetingsOverride ? '' : ' — built-in'}`;
    h.style.cssText = 'color:#8f8f9a;letter-spacing:.08em;font-size:10px;margin-bottom:4px';
    const ta = document.createElement('textarea');
    ta.id = 'grindr-block-greetings-input';
    ta.value = activeGreetings().join('\n');
    ta.spellcheck = false;
    ta.style.cssText = 'width:100%;box-sizing:border-box;height:180px;resize:vertical;'
      + 'background:#141416;color:#e8e8e8;border:1px solid #4a4a52;border-radius:6px;padding:6px;'
      + 'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace';
    // The hotkey listener ignores keys while a text field has focus, so typing
    // here cannot fire a greet or a block.
    const help = document.createElement('div');
    help.textContent = 'One per line. {timeOfDay} and {dayPart} are filled in when a greeting is picked.';
    help.style.cssText = 'color:#6f6f78;font-size:10px;margin:6px 0';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px';
    const mk = (label, fn, accent) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'all:unset;cursor:pointer;padding:4px 8px;border:1px solid #4a4a52;border-radius:6px;font:11px ui-monospace,monospace;color:' + (accent || '#e8e8e8');
      b.addEventListener('click', fn);
      return b;
    };
    row.appendChild(mk('save', () => { setGreetings(ta.value); showToast(`Saved ${activeGreetings().length} greeting(s)`, 'ok'); }, '#e8b93b'));
    row.appendChild(mk('restore defaults', () => { setGreetings([]); showToast('Back to the built-in greetings', 'ok'); }));
    row.appendChild(mk('preview', () => { const p = pickGreeting(); showToast(p || '(none configured)', 'ok'); }));
    wrap.append(h, ta, help, row);
    return wrap;
  }

  // Remember whether the HUD is open.
  function persistHud() { try { localStorage.setItem(HUD_STORAGE_KEY, hudOpen ? '1' : '0'); } catch (_e) {} }
  // Show or hide the HUD.
  function toggleHud() { hudOpen = !hudOpen; persistHud(); renderHud(); }

  // Every click you make while recording, described the way the resolvers see it.
  let diagClicks = 0;
  let diagClickListener = null;
  // Start recording clicks, with the profile id each one resolves to.
  function installDiagClickCapture() {
    if (diagClickListener) return;
    diagClickListener = (e) => {
      if (!diagRecording) return;
      diagClicks += 1;
      let resolved = '';
      try { resolved = String((resolveProfileIdFromClick(e) || {}).profileId || ''); } catch (_e) {}
      diagEvent('click', {
        button: e.button,
        shift: !!e.shiftKey,
        target: describeEl(e.target),
        card: !!(e.target && e.target.closest && e.target.closest(CASCADE_CARD_SELECTOR)),
        ownUi: isOwnGreetUi(e.target),
        resolvesTo: resolved || null,
      });
    };
    // Capture phase and passive: observe only, never alter the page's own handling.
    for (const t of ['mousedown', 'auxclick']) document.addEventListener(t, diagClickListener, { capture: true, passive: true });
  }

  // Mirror the page's own console while recording — Grindr's errors are often the
  // real story (a 403 from its bundle explains more than anything we log).
  let diagConsolePatched = false;
  // Originals kept so __grindrBlock_disable() can truly restore console (the kill
  // switch is documented as putting the patched globals back).
  const origConsoleMethods = {};
  // Mirror the page's own console.error/warn into the recording.
  function installDiagConsoleCapture() {
    if (diagConsolePatched) return;
    diagConsolePatched = true;
    for (const level of ['error', 'warn']) {
      const orig = console[level];
      if (typeof orig !== 'function') continue;
      origConsoleMethods[level] = orig;
      console[level] = function (...args) {
        try {
          if (diagRecording) {
            const msg = args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (_e) { return String(a); } })()))).join(' ');
            // Don't echo our own lines — diagPush already has them.
            if (!msg.includes('[GrindrBlock]')) diagEvent(`console.${level}`, { msg: msg.slice(0, 800) });
          }
        } catch (_e) {}
        return orig.apply(console, args);
      };
    }
  }

  // Begin a diagnostic recording.
  function startDiagRecording() {
    diagReset();
    installDiagClickCapture();
    installDiagConsoleCapture();
    diagRecording = true;
    diagStartedAt = Date.now();
    diagEvent('recording-started', { url: location.href, version: SCRIPT_VERSION });
    logInfo(`${LOG} diagnostic recording STARTED — reproduce the problem, then press save.`);
    showToast('Recording diagnostics — reproduce the problem, then Save', 'ok');
  }
  // End the recording.
  function stopDiagRecording() {
    if (!diagRecording) return;
    diagEvent('recording-stopped', { entries: diagCount() });
    diagRecording = false;
    logInfo(`${LOG} diagnostic recording stopped (${diagCount()} entries, ${diagNoisySkipped} noisy trace lines sampled out). Press save to download.`);
  }

  // Build a plain-text report and hand it to the browser as a download. Includes
  // the state a reader would otherwise have to ask for: build, keymap, where we
  // were, what the lists look like, and the captured timeline.
  function saveDiagReport() {
    const st = hudState();
    const lines = [];
    lines.push(`GrindrBlock diagnostic report`);
    lines.push(`generated   : ${new Date().toISOString()}`);
    lines.push(`version     : ${st.version}`);
    lines.push(`url         : ${location.href}`);
    lines.push(`userAgent   : ${navigator.userAgent}`);
    lines.push(`where       : ${st.where}`);
    lines.push(`target      : ${st.target || '(none)'} — ${st.targetState}`);
    lines.push(`greetMode   : ${st.greetMode}`);
    lines.push(`blocks      : ${st.blocks}`);
    lines.push(`hides       : ${st.hides}`);
    lines.push(`console     : ${st.armed ? 'armed' : 'disarmed'}`);
    lines.push(`logLevel    : ${LOG_LEVEL}`);
    lines.push(`clicks      : ${diagClicks} captured`);
    lines.push(`network     : ${diagNet.length} Grindr requests captured (saved alongside as .har)`);
    lines.push('');
    lines.push(`keymap:`);
    for (const [k, label] of [
      [HOTKEY_GREET_KEY(), 'greet'], [HOTKEY_ALBUM_KEY(), 'unlock album'],
      [HOTKEY_BLOCK_KEY(), 'block'], [HOTKEY_HIDE_KEY(), 'hide'],
      [HOTKEY_PREV_KEY(), 'previous profile'], [HOTKEY_NEXT_KEY(), 'next profile'],
    ]) lines.push(`  ${keyLabel(k).padEnd(14)} ${label}`);
    lines.push('');
    try { lines.push(`why(): ${JSON.stringify(window.__grindrBlock_why(), null, 2)}`); } catch (_e) {}
    lines.push('');
    // The single most useful thing a report can carry when a greet fails:
    // chatButtonFound:false says the matcher missed, but not WHAT it missed.
    // This lists every candidate in the open profile view so the selector can be
    // corrected from evidence instead of guessed at a third time.
    lines.push('buttons inside the open profile view (for matcher debugging):');
    try {
      const scope = findOpenProfileView();
      if (!scope) lines.push('  (no profile view resolved)');
      else {
        const seen = [];
        for (const b of scope.querySelectorAll('button, [role="button"], a')) {
          if (!isVisibleEl(b) || isOwnGreetUi(b)) continue;
          const r = b.getBoundingClientRect();
          seen.push(`  ${describeEl(b)}  text=${JSON.stringify(String(b.innerText || '').trim().slice(0, 40))}`
            + `  testid=${JSON.stringify(String(b.getAttribute('data-testid') || ''))}`
            + `  chrome=${isAppChrome(b)}  ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (seen.length >= 40) { seen.push('  … truncated at 40'); break; }
        }
        lines.push(seen.length ? seen.join('\n') : '  (none visible)');
      }
    } catch (e) { lines.push(`  (inventory failed: ${e && e.message})`); }
    lines.push('');
    if (diagNet.length) {
      lines.push('');
      lines.push('network (newest last; ">>" = sent by this script, not by Grindr):');
      for (const r of diagNet.slice(-60)) {
        lines.push(`  ${r.mine ? '>>' : '  '} ${String(r.status || '---').padStart(3)} ${r.method.padEnd(6)} ${String(r.ms).padStart(5)}ms  ${r.url.replace('https://web.grindr.com', '')}`
          + (r.reqBody ? `  req=${r.reqBody.slice(0, 120)}` : '')
          + (r.status >= 400 && r.resBody ? `  res=${r.resBody.slice(0, 200)}` : ''));
      }
    }
    lines.push('');
    const all = diagAll();
    lines.push(`timeline (${all.length} entries${diagStartedAt ? `, ${Math.round((Date.now() - diagStartedAt) / 1000)}s` : ''}${diagNoisySkipped ? `, ${diagNoisySkipped} noisy trace lines sampled out` : ''}):`);
    const t0 = all.length ? all[0].t : Date.now();
    for (const e of all) {
      lines.push(`  +${String(((e.t - t0) / 1000).toFixed(2)).padStart(8)}s [${e.level.padEnd(5)}] ${e.msg}`);
    }
    const text = lines.join('\n');
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.id = 'grindr-block-diag-dl';
      a.href = url;
      a.download = `grindrblock-diag-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) {} }, 1000);
      showToast(`Saved ${diagCount()} entries, ${diagClicks} clicks — press "har" for the ${diagNet.length} requests`, 'ok');
    } catch (e) {
      logError(`${LOG} could not save the report:`, e);
      showToast('Could not save — the report is in the console instead', 'warn');
      console.log(text);
    }
    return text;
  }

  // Download just the network capture, as a real HAR 1.2 file.
  function saveDiagHar() {
    if (!diagNet.length) { showToast('No requests captured — record first', 'warn'); return null; }
    try {
      const blob = new Blob([JSON.stringify(buildHar(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.id = 'grindr-block-diag-har';
      a.href = url;
      a.download = `grindrblock-diag-${new Date().toISOString().replace(/[:.]/g, '-')}.har`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) {} }, 1000);
      showToast(`Saved ${diagNet.length} requests`, 'ok');
    } catch (e) {
      logError(`${LOG} could not save the HAR:`, e);
      showToast('Could not save the HAR — see console', 'warn');
    }
    return diagNet.length;
  }
  window.__grindrBlock_saveHar = function () { return saveDiagHar(); };
  window.__grindrBlock_setKey = function (action, key) { return setKeyBinding(action, key); };
  window.__grindrBlock_resetKeys = function () { return clearKeyBindings(); };

  // Mount the HUD and start its refresh timer.
  function installHud() {
    try { hudOpen = localStorage.getItem(HUD_STORAGE_KEY) === '1'; } catch (_e) {}
    const boot = () => { buildHud(); };
    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
    // Cheap periodic refresh so the live state is actually live while open.
    // Re-render only when something actually changed. The old unconditional
    // 1s rebuild wiped and recreated the whole panel — which destroys focus on
    // any HUD button you had just clicked — and called resolveTargetProfileId()
    // every second, a full DOM resolution, forever, purely to redraw the same
    // text. Now the state is fingerprinted and the rebuild is skipped when it
    // matches.
    let lastHudFingerprint = '';
    hudTimer = setInterval(() => {
      if (!hudOpen || !hudEl) return;
      // The settings and greetings tabs hold live user input (a textarea that is
      // rebuilt from saved state on every render); the rebind prompt holds a
      // capture-phase listener. A periodic rebuild would wipe an in-progress edit
      // or the "press a key…" prompt — pointer movement alone changes the
      // fingerprint via the resolved target — so only auto-refresh the main tab.
      if (hudTab !== 'main' || rebindPending) return;
      let fp = '';
      try { fp = JSON.stringify(hudState()); } catch (_e) { fp = String(Date.now()); }
      if (fp === lastHudFingerprint) return;
      lastHudFingerprint = fp;
      renderHud();
    }, 1000);
    installedIntervals.push(hudTimer);
  }
  installHud();

  // Read or change settings from the console: __grindrBlock_settings() to read,
  // __grindrBlock_settings('afterGreet','chat') to set.
  // Read or replace the greeting list: __grindrBlock_greetings() to read,
  // __grindrBlock_greetings(['Hey','Howdy']) to set, __grindrBlock_greetings([])
  // to go back to the built-in list.
  window.__grindrBlock_greetings = function (list) {
    if (list === undefined) return { active: activeGreetings(), custom: !!greetingsOverride };
    return setGreetings(list);
  };
  window.__grindrBlock_upgradeHides = function (limit) { return upgradeHidesToBlocks(limit); };
  // Start/stop the background hide→block drain, or read its state.
  window.__grindrBlock_autoDrain = function (on) {
    if (on === undefined) return { running: autoDrain, remaining: hidesNeedingUpgrade().length, queued: blockQueue.length };
    return setAutoDrain(on);
  };
  window.__grindrBlock_settings = function (key, value) {
    if (key === undefined) return { ...settings, options: { ...SETTINGS_OPTIONS } };
    return setSetting(key, value) ? { ...settings } : `unknown setting: ${key}`;
  };
  window.__grindrBlock_hud = function (show) {
    if (show !== undefined) { hudOpen = !!show; persistHud(); renderHud(); }
    return { open: hudOpen, recording: diagRecording, entries: diagCount() };
  };
  window.__grindrBlock_record = function () { startDiagRecording(); return true; };
  window.__grindrBlock_saveReport = function () { stopDiagRecording(); return saveDiagReport(); };

  logInfo(`${LOG} loaded v${SCRIPT_VERSION} (LOCAL_ONLY=${LOCAL_ONLY}, MIN_INTERVAL_MS=${MIN_INTERVAL_MS}, MAX_PER_HOUR=${MAX_PER_HOUR}, UNDO_WINDOW_MS=${UNDO_WINDOW_MS}, VERIFY_BLOCKS=${VERIFY_BLOCKS}, blockList=${blockedProfileIds.size} (${pendingBlockIds().length} pending), hideList=${hiddenProfileIds.size}, textFilter=${TEXT_FILTER_KEYWORDS.length ? TEXT_FILTER_ACTION : 'off'}, stayLoggedIn=${STAY_LOGGED_IN}, skipBetaDialog=${SKIP_BETA_DIALOG}, hotkeys=${HOTKEYS_ENABLED ? `${keyLabel(HOTKEY_GREET_KEY())} greet, ${keyLabel(HOTKEY_ALBUM_KEY())} album, ${keyLabel(HOTKEY_BLOCK_KEY())} block, ${keyLabel(HOTKEY_HIDE_KEY())} hide, ${keyLabel(HOTKEY_PREV_KEY())}/${keyLabel(HOTKEY_NEXT_KEY())} nav` : 'off'}, albums=${albumRotation().length}, greetMode=${GREET_MODE}, me=${albumState.myProfileId || 'unknown'}${myProfileIdIsSeeded ? ' (seeded)' : ''})`);

  // ── Test export ────────────────────────────────────────────────────────────
  // The pure helpers, exposed for the test suite. `module` does not exist in a
  // page under @grant none, so this whole block is inert in the browser and adds
  // nothing to the page's global surface — unlike the __grindrBlock_* API, which
  // is deliberately published.
  //
  // Only genuinely pure functions belong here: same input, same output, no DOM
  // and no network. Anything that touches the page is verified against a real
  // session instead, because a stubbed DOM would only ever confirm the
  // assumptions that written the stub.
  try {
    if (typeof module === 'object' && module && module.exports) {
      module.exports = {
        isPlausibleProfileId, conversationIdFor, isUsableHash,
        greetingTimeTokens, resolveGreetingTokens,
        idsFromListPayload, keyList, keyMatches, keyLabel,
        NOT_SEND_BUTTON_RE, SEND_BUTTON_TEXT_RE, NOT_CHAT_BUTTON_RE,
        NOT_PAGER_RE, PAGER_NAME_RE, PAGER_ID_RE,
        VIEWED_PROFILE_URL_RE, LIST_RESPONSE_URL_RE,
        MIN_PROFILE_ID_LEN, MAX_PROFILE_ID_LEN,
        queueInsertIndex, nextRunnableIndex, parseServerBlocksSnapshot, windowResetMinutes,
        HOURLY_CAPS_ENABLED, DRAIN_HOURLY_CAP, MANUAL_HOURLY_CAP,
        MAX_PER_HOUR, DRAIN_HOURLY_CAP, MANUAL_HOURLY_CAP,
      };
    }
  } catch (_e) { /* not a CommonJS host — nothing to export to */ }
})();
