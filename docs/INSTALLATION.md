# Installation

## Requirements

- A Chromium or Firefox browser
- [Tampermonkey](https://www.tampermonkey.net/) (or another userscript manager)
- Node 20+ **only if you want to run the tests** — the script itself needs nothing

## Install

1. Open `Grindr Middle-Click Block.user.js` in this repository and copy it whole.
2. Tampermonkey → **Create a new script**, replace the contents, save.
3. Reload `web.grindr.com`.

You are running it when the HUD badge appears in the corner. Press `\` to open it;
the title shows the version.

## Verify

```js
__grindrBlock_why()        // preconditions the action keys depend on
__grindrBlock_hotkeys()    // current bindings
```

The console also prints one line on load, listing the keymap and the state it
restored.

## First-run setup

- **Rebind the greet key.** The default accepts `Insert`, which does not exist on
  Apple keyboards. Open the HUD, click the `greet` row, press the key you want.
- **Let it learn your profile id.** Open two different existing chats; your id is
  the one they have in common. Or set it directly with
  `__grindrBlock_setMyProfileId(id)`.
- **Arm the acting functions** if you plan to use the console:
  `__grindrBlock_arm()` — per tab.

## Upgrade

Paste the new version over the old one. Everything is in `localStorage`, so block
lists, hides, settings, greetings and key bindings all survive.

## Uninstall

Remove the script in Tampermonkey. To clear its data as well:

```js
Object.keys(localStorage).filter(k => k.startsWith('grindrMiddleClick')).forEach(k => localStorage.removeItem(k));
```

That removes the local block and hide lists, settings, greetings, and bindings.
**It does not unblock anyone** — blocks made through Grindr's API are on your
account. Use `__grindrBlock_undoAll()` first if that is what you want.
