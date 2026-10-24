# Fister Plugin Manager

A mod manager for [Fister](https://fister.fun). It adds a **Plugins** tab to the game's Settings where you can browse a catalog of plugins, install them from a link or a file, turn them on and off, change their settings, and keep them updated.

It works on its own, or alongside [FisterQoL](https://github.com/jaxonb423/FisterQol) (version 2.3.6 or newer); with both installed the Plugins tab sits between General and QoL.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open **[FisterPluginManager.user.js](https://raw.githubusercontent.com/jaxonb423/fister-plugins/main/FisterPluginManager.user.js)** and click Install.
3. Open fister.fun → Settings → **Plugins**. (**Ctrl+Shift+P** also opens the manager, anywhere.)

The first time a plugin is downloaded from a new site, Tampermonkey asks to allow it. Choose **Always allow**.

If a plugin misbehaves, open `https://fister.fun/?plugins=off` to start with every plugin off, then turn the culprit off or remove it.

> **Plugins are code.** They run in the game page and can do anything the page can, including reading chat. Only install plugins from people you trust. Plugins in this repo's catalog are reviewed before they're listed.

## Writing a plugin

A plugin is a single `.js` file that starts with a header:

```js
// ==FisterPlugin==
// @id          my-plugin           (lowercase letters, numbers and dashes)
// @name        My Plugin
// @version     1.0.0
// @author      you
// @description One sentence about what it does.
// ==/FisterPlugin==

fister.on('kill', e => {
  if (e.byMe) fister.ui.toast('Got one: ' + (e.victim || 'someone'));
});
```

The code runs with a `fister` object in scope. Everything you add through `fister` (listeners, styles, elements, timers) is removed automatically when the plugin is turned off, so turning it off and on again works without reloading.

### `fister.on(event, handler)` → returns a function that unsubscribes

| Event | When | Data |
|---|---|---|
| `ready` | The game has loaded (fires straight away if it already has) | `{ scene }` |
| `kill` | Someone is KO'd | `{ killerId, victimId, killer, victim, byMe, ofMe, method, raw }` |
| `parry` | A successful parry | `{ defenderId, attackerId, byMe, againstMe, raw }` |
| `airKick` | Someone starts an air kick | `{ playerId, byMe, raw }` |
| `punch` | Someone punches | `{ playerId, victimId, hit, strength, byMe, onMe, raw }` |
| `roundStart` / `roundEnd` / `matchEnd` | Round and match changes | `{}` |
| `chat` | A chat message appears | `{ text, element }` |

`raw` is the game's own event object, which can change between game versions.

### Settings

```js
fister.settings.define({
  volume: { type: 'range', label: 'Volume', min: 0, max: 100, default: 50 },
  corner: { type: 'select', label: 'Corner', default: 'top-right',
            options: [['top-left', 'Top left'], ['top-right', 'Top right']] },
  enabled: { type: 'checkbox', label: 'Show it', default: true },
});
fister.settings.get('volume');              // current value
fister.settings.onChange((key, value) => {}); // when the player changes one
```

Types: `checkbox`, `range`, `number`, `select`, `color`, `text`. Add `note: '…'` for a hint under the field. The manager builds the settings form for you.

### Everything else

| | |
|---|---|
| `fister.ui.toast(text, ms)` | A small notice in the top right |
| `fister.ui.style(css)` | Adds a stylesheet |
| `fister.ui.element(tag, props, ...children)` | Makes an element (`props` can include `style: {...}` and `onclick`) |
| `fister.ui.add(element, { interactive })` | Puts an element on screen in a layer above the game (clicks pass through unless `interactive: true`) |
| `fister.chat.onMessage(fn)` | Same as `fister.on('chat', fn)` |
| `fister.game.localPlayerId()`, `.playerName(id)`, `.players()` | Who's in the game |
| `fister.game.scene`, `fister.game.client` | The game's own objects, for advanced use (can change between game versions) |
| `fister.storage.get(key, fallback)` / `.set(key, value)` | Saved data for your plugin |
| `fister.setTimeout`, `fister.setInterval`, `fister.addEventListener(target, type, fn)` | Like the normal ones, cleaned up when the plugin stops |
| `fister.onStop(fn)` | Runs when the plugin is turned off or updated |
| `fister.log(...)` | Shows in the plugin's Log in the manager |
| `fister.meta` | Your plugin's header values |

See [`plugins/`](plugins/) for three small examples: a KO counter, hit sounds and chat timestamps.

### Sharing it

- **By link:** put the file somewhere public (a GitHub repo or gist) and share the **Raw** link. Players paste it into *Install from link*, and the plugin updates itself when you raise `@version` at that address.
- **In the catalog:** open a pull request adding your file under `plugins/` and an entry to [`catalog.json`](catalog.json).

## How it hooks into the game

Like FisterQoL, the manager adds a few small hooks to the game's code as it loads (combat events, round events, the Plugins tab and access to the game scene). With FisterQoL installed, QoL loads the game and adds these hooks for it; on its own, the manager loads the game itself. If a game update moves something, the affected hooks switch off and the manager says which. If the Plugins tab itself can't be added, Ctrl+Shift+P still opens it.

## Licenses

The code parser used while loading (acorn, eslint-scope, esrecurse, estraverse) is listed in [`licenses/`](licenses/).
