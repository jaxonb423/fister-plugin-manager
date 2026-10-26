// ==FisterPlugin==
// @id          lazy-edition
// @name        Fister Lazy Edition
// @version     1.0.1
// @author      jaxonb423
// @description A pile of small fixes from the community wishlist: parry cooldown ring, kill confirm sound, profanity filter, clearer charge bar, HUD sizes, dailies mid-match, leave warnings and more. Every part has its own switch.
// @tags        qol hud audio chat
// ==/FisterPlugin==

// Everything here only changes what you see and hear on your own screen.
// Each feature checks that the game piece it relies on is there and quietly does nothing if a game update moved it.

fister.settings.define({
  parryRing:      { type: 'checkbox', label: 'Parry cooldown ring around the crosshair', default: true },
  killSound:      { type: 'checkbox', label: 'Kill confirm sound', default: true },
  killVolume:     { type: 'range', label: 'Kill sound volume', min: 0, max: 100, default: 60 },
  collateral:     { type: 'checkbox', label: '"Collateral!" callout for double sniper kills', default: true },
  chargeLabel:    { type: 'checkbox', label: 'Charge bar: icons for each attack, grey out Rocket Punch when you can\'t use it', default: true },
  chargeSound:    { type: 'checkbox', label: 'Charge bar: "powering up" sound while charging', default: false },
  chargeVolume:   { type: 'range', label: 'Powering up volume', min: 0, max: 100, default: 35 },
  shieldIcon:     { type: 'checkbox', label: 'Shield icon in first person while you have a shield', default: true },
  tankHint:       { type: 'checkbox', label: 'Tank: remind me to hold the button to charge a grab', default: true },
  carVolume:      { type: 'checkbox', label: 'Car transformation scream follows the Air kick volume slider', default: true },
  profanity:      { type: 'checkbox', label: 'Profanity filter for chat (also what the chat voice reads out)', default: true },
  profanityNames: { type: 'checkbox', label: 'Also filter usernames in chat, the killfeed and scoreboards', default: true },
  customWords:    { type: 'text', label: 'Extra words to filter (comma separated)', default: '', note: 'Names on players\' heads are drawn by the game in 3D and aren\'t filtered.' },
  shieldKillfeed: { type: 'checkbox', label: 'Killfeed: mark KOs caused by a shield parry', default: true },
  endAvatars:     { type: 'checkbox', label: 'Profile pictures on the end of round and match screens', default: true },
  leaveWarning:   { type: 'checkbox', label: 'Warn before FiStore or "Create loadout" takes me out of a match', default: true },
  dailies:        { type: 'checkbox', label: 'Daily quests button in the pause menu', default: true },
  dailiesKey:     { type: 'text', label: 'Key to open daily quests (leave empty for none)', default: '', maxLength: 12, note: 'For example F7. Only works while chat isn\'t focused.' },
  storeOrder:     { type: 'select', label: 'FiStore category order', default: 'popular',
                    options: [['off', 'As the game has it'], ['popular', 'Most popular first'], ['body', 'Top to bottom (hats down to shoes)']] },
  chatScale:      { type: 'range', label: 'Text chat size %', min: 50, max: 200, default: 100 },
  killfeedScale:  { type: 'range', label: 'Killfeed size %', min: 50, max: 200, default: 100 },
  leaderboardScale:{ type: 'range', label: 'Scoreboard size %', min: 50, max: 200, default: 100 },
  healthScale:    { type: 'range', label: 'Health bar size %', min: 50, max: 200, default: 100 },
  actionScale:    { type: 'range', label: 'Charge bar size %', min: 50, max: 200, default: 100 },
  tips:           { type: 'checkbox', label: 'Tips and a Discord invite on the home screen', default: true },
});
// settings are read every frame, so keep a copy instead of asking the manager each time
const SET = fister.settings.get();
fister.settings.onChange((k, v) => { SET[k] = v; });
const S = k => SET[k];

// ---------------------------------------------------------------- shared bits
const css = fister.ui.style(`
#lazy-ring{position:fixed;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;pointer-events:none;z-index:60;display:none}
#lazy-ring circle{fill:none;stroke-width:3.5}
#lazy-ring .bg{stroke:rgba(0,0,0,.35)}
#lazy-ring .fg{stroke:#3d8bff;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%}
#lazy-ring.ready{animation:lazy-ring-flash .45s ease-out forwards}
@keyframes lazy-ring-flash{0%{opacity:1;filter:brightness(2.2) drop-shadow(0 0 6px #8fc2ff)}100%{opacity:0;transform:scale(1.35)}}
#lazy-shield{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);width:34px;height:40px;pointer-events:none;z-index:60;display:none;opacity:.9;filter:drop-shadow(1px 1px 0 #000)}
#lazy-callout{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);pointer-events:none;z-index:70;font:900 34px var(--fister-ui-font,sans-serif);color:#ffe066;
 text-shadow:2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;letter-spacing:1px;animation:lazy-pop 1.6s ease-out forwards}
#lazy-callout.small{font-size:16px;color:#fff;top:58%;animation-duration:2.6s}
@keyframes lazy-pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%) scale(1)}}
#charge-bar-move[data-lazy-move]::before{content:"";display:inline-block;width:13px;height:13px;margin-right:4px;vertical-align:-2px;background:currentColor;
 -webkit-mask:var(--lazy-icon) center/contain no-repeat;mask:var(--lazy-icon) center/contain no-repeat}
#charge-bar-move[data-lazy-move=uppercut]{--lazy-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1l5 6H10v8H6V7H3z'/%3E%3C/svg%3E")}
#charge-bar-move[data-lazy-move=rocket_punch]{--lazy-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 0c3 2 4 5 4 8l2 3-3 1-1 2H6l-1-2-3-1 2-3c0-3 1-6 4-8zm0 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3z'/%3E%3C/svg%3E")}
#charge-bar-move[data-lazy-move=air_kick]{--lazy-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M5 1h4v7l5 2v4H3c-1 0-2-1-2-2v-1l4-2z'/%3E%3C/svg%3E")}
#charge-bar-move[data-lazy-move=divebomb]{--lazy-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 15l-5-6h3V1h4v8h3z'/%3E%3C/svg%3E")}
#charge-bar-move.lazy-unavailable{color:#9a9a9a!important;text-decoration:line-through}
.lazy-avatar{width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:-4px;margin-right:5px;border:1px solid #0006;background:#2d8c4e;display:inline-grid;place-items:center;
 font:700 10px var(--fister-ui-font,sans-serif);color:#fff;box-sizing:border-box}
.lazy-shield-tag{display:inline-flex;align-items:center;gap:3px;margin-left:5px;padding:0 5px;border-radius:8px;background:#1565c0;color:#fff;font-size:10px;font-weight:700;vertical-align:1px}
.lazy-shield-tag svg{width:9px;height:11px;fill:currentColor}
.lazy-modal{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:#0006}
.lazy-box{background:#c0c0c0;color:#111;border:2px outset #eee;box-shadow:3px 3px 0 #0007;font:13px var(--fister-ui-font,Tahoma,sans-serif);width:min(420px,92vw);max-height:80vh;display:flex;flex-direction:column}
.lazy-box h3{margin:0;padding:5px 8px;background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.lazy-box .lazy-body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:10px}
.lazy-box .lazy-row{display:flex;gap:8px;justify-content:flex-end}
.lazy-box button{font:inherit;padding:5px 14px;background:#c0c0c0;border:2px outset #eee;cursor:pointer}
.lazy-box button:active{border-style:inset}
.lazy-quest{border:2px inset #808080;background:#fff;padding:8px;display:flex;flex-direction:column;gap:5px}
.lazy-quest b{font-size:13px}.lazy-quest small{opacity:.75}
.lazy-quest .bar{height:10px;background:#ddd;border:1px solid #888}.lazy-quest .bar i{display:block;height:100%;background:#2e9e4f}
.lazy-quest.done{background:#eaffea}
#lazy-tips{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:30;width:min(460px,calc(100vw - 32px));background:#c0c0c0;border:2px outset #eee;box-shadow:2px 2px 0 #0006;
 font:12px var(--fister-ui-font,Tahoma,sans-serif);color:#111;padding:7px 30px 7px 10px;display:flex;gap:10px;align-items:center;box-sizing:border-box}
#lazy-tips .x{position:absolute;right:4px;top:4px;width:18px;height:18px;padding:0;border:2px outset #eee;background:#c0c0c0;font:700 10px sans-serif;cursor:pointer}
#lazy-tips a.lazy-discord{flex:none;padding:4px 10px;background:#5865f2;color:#fff;text-decoration:none;font-weight:700;border:2px outset #8f98ff}
body.in-game #lazy-tips{display:none}
`);
const el = (tag, props, ...kids) => fister.ui.element(tag, props, ...kids.filter(k => k != null && k !== false));
const scene = () => fister.game.scene;
const inGame = () => document.body.classList.contains('in-game');
function me() {
  const sc = scene(), id = fister.game.localPlayerId();
  if (!sc || id == null) return null;
  const list = sc.latestPlayerStates;
  if (Array.isArray(list)) return list.find(p => p && p.id === id) || null;
  return list?.get?.(id) ?? null;
}
function playerStates() {
  const list = scene()?.latestPlayerStates;
  return Array.isArray(list) ? list : list?.values ? [...list.values()] : [];
}
function callout(text, small) {
  document.getElementById('lazy-callout')?.remove();
  const c = el('div', { id: 'lazy-callout', className: small ? 'small' : '' }, text);
  document.body.append(c); fister.setTimeout(() => c.remove(), small ? 2700 : 1700);
}
function modal(title, body, buttons) {
  const box = el('div', { className: 'lazy-modal', 'data-prevent-game-input': '' },
    el('div', { className: 'lazy-box', role: 'dialog', 'aria-label': title },
      el('h3', {}, title, el('button', { type: 'button', 'aria-label': 'Close', style: { padding: '0 6px' }, onclick: () => close() }, 'x')),
      el('div', { className: 'lazy-body' }, body, el('div', { className: 'lazy-row' }, ...(buttons || []).map(b => el('button', { type: 'button', onclick: () => { close(); b.on?.(); } }, b.label))))));
  const close = () => { box.remove(); removeEventListener('keydown', esc, true); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', esc, true);
  fister.onStop(close);
  document.body.append(box);
  return close;
}

// small synthesized sounds (no files to download)
let actx = null;
function audio() {
  if (!actx) { try { actx = new AudioContext(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
fister.onStop(() => { try { actx?.close(); } catch {} });
function blip(freqs, volume, len = 0.09, type = 'square') {
  const a = audio(); if (!a || volume <= 0) return;
  let t = a.currentTime;
  for (const f of freqs) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * volume, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.02); t += len * 0.8;
  }
}

// ---------------------------------------------------------------- per-frame HUD bits
const ringBox = document.createElement('div');
ringBox.innerHTML = '<svg id="lazy-ring" viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="19"/><circle class="fg" cx="23" cy="23" r="19" stroke-dasharray="119.4" stroke-dashoffset="119.4"/></svg>';
const ringEl = ringBox.firstChild, ringFg = ringEl.querySelector('.fg');
const shieldBox = document.createElement('div');
shieldBox.innerHTML = '<svg id="lazy-shield" viewBox="0 0 34 40"><path d="M17 1l15 6v11c0 10-7 18-15 21C9 36 2 28 2 18V7z" fill="#3d8bff" stroke="#fff" stroke-width="2.5"/><path d="M17 8v25c5-3 9-8 9-15v-6z" fill="#fff" opacity=".35"/></svg>';
const shieldEl = shieldBox.firstChild;
fister.ui.add(ringEl); fister.ui.add(shieldEl);

let parryMax = 0, lastParry = 0, rocketUsed = false, groundedSince = 0;
let charge = { osc: null, gain: null, last: 0, full: false };
function stopChargeTone() {
  if (!charge.osc) return;
  try { charge.gain.gain.setTargetAtTime(0.0001, actx.currentTime, 0.03); charge.osc.stop(actx.currentTime + 0.15); } catch {}
  charge.osc = charge.gain = null;
}
fister.onStop(stopChargeTone);

const MOVES = { 'Uppercut': 'uppercut', 'Rocket Punch': 'rocket_punch', 'Air Kick': 'air_kick', 'Divebomb': 'divebomb' };
let raf = 0;
function frame() {
  raf = requestAnimationFrame(frame);
  const st = inGame() ? me() : null;
  const alive = st && st.health > 0 && !st.isCarMode && !st.isTankMode;
  const sc = scene();

  // parry ring: fills while the parry recharges, flashes when it's ready
  if (S('parryRing') && alive) {
    const cd = Math.max(0, Number(st.parryCooldown) || 0);
    if (cd > parryMax + 0.01) parryMax = cd;
    if (cd > 0 && parryMax > 0) {
      ringEl.classList.remove('ready'); ringEl.style.display = 'block';
      ringFg.setAttribute('stroke-dashoffset', String(119.4 * (cd / parryMax)));
    } else if (lastParry > 0) {
      ringFg.setAttribute('stroke-dashoffset', '0');
      ringEl.classList.remove('ready'); void ringEl.getBoundingClientRect(); ringEl.classList.add('ready');
      parryMax = 0;
    } else if (!ringEl.classList.contains('ready')) ringEl.style.display = 'none';
    lastParry = cd;
  } else { ringEl.style.display = 'none'; lastParry = 0; parryMax = 0; }

  // shield icon in first person
  shieldEl.style.display = S('shieldIcon') && alive && st.hasShield && sc?.effectiveCameraPerspective === 'first-person' ? 'block' : 'none';

  // Rocket Punch: once per jump (the game resets it when you land) and a 2 s cooldown
  if (st) {
    if (st.isRocketPunchAscending || st.isRocketPunchDiving) { rocketUsed = true; groundedSince = 0; }
    else if (!st.isClearlyAirborneForUppercut) { groundedSince ||= performance.now(); if (performance.now() - groundedSince > 120) rocketUsed = false; }
    else groundedSince = 0;
  }
  const label = document.getElementById('charge-bar-move');
  if (label) {
    const key = S('chargeLabel') ? MOVES[label.textContent.trim()] : null;
    if (key) label.dataset.lazyMove = key; else delete label.dataset.lazyMove;
    label.classList.toggle('lazy-unavailable', !!(key === 'rocket_punch' && st && (rocketUsed || (Number(st.rocketPunchUpCooldown) || 0) > 0)));
  }

  // powering-up sound while the fist charges
  const c = alive ? Math.max(0, Math.min(1, Number(st.charge) || 0)) : 0;
  if (S('chargeSound') && c > 0.03 && c >= charge.last - 0.001 && !charge.full) {
    const a = audio();
    if (a && !charge.osc) {
      charge.osc = a.createOscillator(); charge.gain = a.createGain(); charge.osc.type = 'triangle';
      charge.gain.gain.value = 0.0001; charge.osc.connect(charge.gain).connect(a.destination); charge.osc.start();
    }
    if (charge.osc) {
      charge.osc.frequency.setTargetAtTime(180 + c * 420, a.currentTime, 0.03);
      charge.gain.gain.setTargetAtTime(0.06 * (S('chargeVolume') / 100), a.currentTime, 0.05);
    }
    if (c >= 0.995) { charge.full = true; stopChargeTone(); blip([880, 1320], S('chargeVolume') / 100 * 0.5, 0.06, 'triangle'); }
  } else if (c < charge.last - 0.02 || c <= 0.03 || !S('chargeSound')) { stopChargeTone(); if (c <= 0.03) charge.full = false; }
  charge.last = c;
}
raf = requestAnimationFrame(frame);
fister.onStop(() => cancelAnimationFrame(raf));

// ---------------------------------------------------------------- kills: confirm sound, collateral, shield tag
const myKills = [];
const parries = [];
fister.on('parry', e => {
  const def = playerStates().find(p => p.id === e.defenderId);
  parries.push({ d: e.defenderId, a: e.attackerId, t: performance.now(), shield: !!def?.hasShield });
  while (parries.length > 20) parries.shift();
});
fister.on('kill', e => {
  const now = performance.now();
  if (e.byMe && !e.ofMe) {
    if (S('killSound')) blip([988, 1319], S('killVolume') / 100, 0.08, 'square');
    const method = String(e.raw?.method || e.raw?.killMethod || e.method || '');
    myKills.push({ t: now, sniper: /sniper/i.test(method) });
    while (myKills.length && now - myKills[0].t > 600) myKills.shift();
    const snipes = myKills.filter(k => k.sniper && now - k.t < 350);
    if (S('collateral') && snipes.length === 2) { callout('COLLATERAL!'); blip([660, 880, 1175, 1568], S('killVolume') / 100, 0.1, 'triangle'); }
  }
  if (S('shieldKillfeed')) {
    const p = parries.slice().reverse().find(p => p.shield && p.d === e.killerId && p.a === e.victimId && now - p.t < 5000);
    if (p) fister.setTimeout(() => {
      const entry = document.querySelector('#killfeed .killfeed-entry .killfeed-entry-message');
      if (entry && !entry.querySelector('.lazy-shield-tag')) {
        const tag = el('span', { className: 'lazy-shield-tag', title: 'Parried by a shield' });
        tag.innerHTML = '<svg viewBox="0 0 34 40"><path d="M17 1l15 6v11c0 10-7 18-15 21C9 36 2 28 2 18V7z"/></svg>shield';
        entry.append(tag);
      }
    }, 0);
  }
});

// ---------------------------------------------------------------- tank hint
let tankHints = 0, tankHintAt = 0;
fister.addEventListener(window, 'mousedown', e => {
  if (e.button !== 0 || !S('tankHint') || tankHints >= 3) return;
  const st = inGame() ? me() : null;
  if (!st?.isTankMode || st.health <= 0) return;
  fister.setTimeout(() => {
    const s2 = me();
    // a short click that didn't start a grab wind-up
    if (s2?.isTankMode && !s2.isWindingUpGrab && !s2.isGrabbing && performance.now() - tankHintAt > 6000) {
      tankHintAt = performance.now(); tankHints++;
      callout('Tank: hold the button to charge up a grab', true);
    }
  }, 260);
}, true);

// ---------------------------------------------------------------- car scream volume
let soundPatched = null;
function patchSound(sound) {
  if (!sound || soundPatched === sound || typeof sound.getSfxGainOverride !== 'function') return;
  const original = sound.getSfxGainOverride;
  sound.getSfxGainOverride = function (name) {
    const v = original.apply(this, arguments);
    return S('carVolume') && (name === 'carscream') ? v * (Number(this.airKickVolume) >= 0 ? Number(this.airKickVolume) : 1) : v;
  };
  soundPatched = sound;
  fister.onStop(() => { if (sound.getSfxGainOverride !== original) delete sound.getSfxGainOverride; });
}
fister.on('client', e => patchSound(e.sound));
fister.on('ready', () => patchSound(fister.game.sound));
patchSound(fister.game.sound);

// ---------------------------------------------------------------- profanity filter
const rot = s => s.replace(/[a-z]/gi, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() <= 'm' ? 13 : -13)));
const ROOTS = rot('shpx fuvg ovgpu phag avtt sntt zbgures jube fyhg ergneq jnax gjng').split(' ');
const WORDS = new Set(rot('nff nffubyr nefrubyr onfgneq qvpx qvpxurnq pbpx chffl snt sntf cvff cvffrq cevpx fcvp puvax xvxr genaal qlxr phz encr encvfg cbea obyybpxf jnaxre ubr gvgf gvggvrf obbof cravf intvan qvyqb wvmm anmv').split(' '));
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'l' };
let custom = new Set();
const loadCustom = () => { custom = new Set(String(S('customWords') || '').toLowerCase().split(',').map(w => w.trim()).filter(Boolean)); };
loadCustom(); fister.settings.onChange(k => { if (k === 'customWords') loadCustom(); });
function bad(word) {
  const w = word.toLowerCase().replace(/[0-9@$!|]/g, c => LEET[c] || c);
  const squeezed = w.replace(/(.)\1+/g, '$1');
  if (WORDS.has(w) || WORDS.has(squeezed) || custom.has(w) || custom.has(squeezed)) return true;
  return ROOTS.some(r => w.startsWith(r) || squeezed.startsWith(r.replace(/(.)\1+/g, '$1')));
}
function censor(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(/[A-Za-z0-9@$!|]{2,}/g, w => bad(w) ? w[0] + '*'.repeat(w.length - 1) : w);
}
// filter chat as it arrives, before the chat box, the bubbles and the chat voice see it
let clientPatched = null;
function patchClient(client) {
  if (!client) return;
  const proto = Object.getPrototypeOf(client);
  const fn = proto?.validateUntrustedChatMessage;
  if (typeof fn !== 'function' || fn.__lazy) return;
  const wrapped = function (msg) {
    const ok = fn.apply(this, arguments);
    if (ok && msg && typeof msg === 'object') {
      if (S('profanity') && typeof msg.message === 'string') msg.message = censor(msg.message);
      if (S('profanity') && S('profanityNames') && typeof msg.username === 'string') msg.username = censor(msg.username);
    }
    return ok;
  };
  wrapped.__lazy = true;
  proto.validateUntrustedChatMessage = wrapped;
  clientPatched = { proto, fn };
}
fister.onStop(() => { if (clientPatched && clientPatched.proto.validateUntrustedChatMessage.__lazy) clientPatched.proto.validateUntrustedChatMessage = clientPatched.fn; });
fister.on('client', e => patchClient(e.client));
patchClient(fister.game.client);
// names in the killfeed and scoreboards
function censorTree(root) {
  if (!root || !S('profanity') || !S('profanityNames')) return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) { const v = censor(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
}

// ---------------------------------------------------------------- end of round: profile pictures (and names filtered)
function avatarFor(name) {
  const st = playerStates().find(p => p && typeof p.username === 'string' && p.username.trim() === name);
  const id = st?.userId;
  if (id != null && /^\d+$/.test(String(id)) && Number(id) > 0) {
    const img = el('img', { className: 'lazy-avatar', alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', src: '/api/avatar/user/' + encodeURIComponent(String(id)) + '?size=64' });
    img.onerror = () => img.replaceWith(letter(name));
    return img;
  }
  return letter(name);
}
const letter = name => el('span', { className: 'lazy-avatar' }, (name || '?').trim().charAt(0).toUpperCase());
function decorateScores(root) {
  if (!root) return;
  censorTree(root);
  if (!S('endAvatars')) return;
  for (const row of root.querySelectorAll('tr')) {
    const cell = row.children[1];
    if (!cell || cell.tagName !== 'TD' || cell.querySelector('.lazy-avatar')) continue;
    const name = cell.textContent.trim();
    if (name) cell.prepend(avatarFor(name));
  }
}

// ---------------------------------------------------------------- warnings before leaving a match
let leaving = false;
fister.addEventListener(document, 'click', e => {
  if (leaving || !S('leaveWarning')) return;
  const t = e.target.closest?.('#round-end-store-btn, [data-round-loadout-create]');
  if (!t || !inGame()) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const store = t.id === 'round-end-store-btn';
  modal(store ? 'Open the FiStore?' : 'Create a new loadout?',
    el('div', {}, (store ? 'Opening the FiStore' : 'Making a new loadout') + ' takes you out of this match and disconnects you from the server.'),
    [{ label: 'Stay in the match' }, { label: store ? 'Go to the FiStore' : 'Leave and create', on: () => { leaving = true; try { t.click(); } finally { leaving = false; } } }]);
}, true);

// ---------------------------------------------------------------- daily quests mid-match
function identityToken() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem('fister_identity_token');
      if (!raw) continue;
      try { const j = JSON.parse(raw); if (j && typeof j.token === 'string') return j.token; if (typeof j === 'string') return j; } catch { return raw; }
    } catch {}
  }
  return null;
}
async function openDailies() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch {}
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, el('div', {}, 'Loading your daily quests…'));
  modal('Daily quests', body, [{ label: 'Close' }]);
  try {
    const token = identityToken();
    const r = await fetch('/api/plus/rewards/daily-quests', { credentials: 'include', cache: 'no-store', headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (r.status === 401 || r.status === 403) throw Error('Sign in to see your daily quests.');
    if (!r.ok) throw Error('The game didn\'t send your quests (' + r.status + ').');
    const data = await r.json(), board = data?.board || data;
    const quests = Array.isArray(board?.quests) ? board.quests : [];
    body.replaceChildren();
    if (!quests.length) { body.append(el('div', {}, 'No daily quests right now.')); return; }
    for (const q of quests) {
      const target = Number(q.target) || 0, progress = Math.min(Number(q.progress) || 0, target || Infinity), done = !!(q.completed || q.claimed || (target && progress >= target));
      body.append(el('div', { className: 'lazy-quest' + (done ? ' done' : '') },
        el('b', {}, String(q.title || 'Quest')),
        q.description ? el('small', {}, String(q.description)) : null,
        target ? el('div', { className: 'bar' }, el('i', { style: { width: Math.round(100 * progress / target) + '%' } })) : null,
        el('small', {}, (target ? progress + ' / ' + target : '') + (q.tokens ? (target ? ' · ' : '') + q.tokens + ' tokens' : '') + (q.claimed ? ' · claimed' : done ? ' · done, claim it from the home screen' : ''))));
    }
  } catch (err) {
    body.replaceChildren(el('div', {}, String(err?.message || err)), el('small', {}, 'You can always check them from Daily Quests on the home screen.'));
  }
}
fister.addEventListener(window, 'keydown', e => {
  const key = String(S('dailiesKey') || '').trim();
  if (!key || !S('dailies') || e.repeat) return;
  if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
  if (e.key.toLowerCase() === key.toLowerCase() || e.code.toLowerCase() === key.toLowerCase()) { e.preventDefault(); e.stopPropagation(); openDailies(); }
}, true);
function pauseButton() {
  const footer = document.querySelector('#pause-menu .pause-menu-footer, #pause-menu-window .pause-menu-footer');
  const have = document.getElementById('lazy-dailies-btn');
  if (!S('dailies')) { have?.remove(); return; }
  if (!footer || have) return;
  const ref = footer.querySelector('button');
  footer.prepend(el('button', { id: 'lazy-dailies-btn', type: 'button', className: ref ? ref.className : 'win95-button', onclick: e => { e.preventDefault(); openDailies(); } }, 'Daily Quests'));
}
fister.onStop(() => document.getElementById('lazy-dailies-btn')?.remove());

// ---------------------------------------------------------------- FiStore category order
const ORDERS = {
  popular: ['hat', 'face', 'cape', 'accessor', 'glove|fist', 'shirt', 'pants', 'shoe', 'badge', 'trail', 'punch', 'death', 'airtrick|air_trick', 'skin'],
  body: ['hat', 'face', 'cape', 'accessor', 'badge', 'shirt', 'glove|fist', 'pants', 'shoe', 'trail', 'punch', 'death', 'airtrick|air_trick', 'skin'],
};
function sortStore() {
  const mode = S('storeOrder'), order = ORDERS[mode];
  if (!order) return;
  for (const bar of document.querySelectorAll('.fist-store-category-switcher')) {
    const items = [...bar.children];
    const rank = node => {
      const btn = node.matches?.('[data-fist-store-category]') ? node : node.querySelector?.('[data-fist-store-category]');
      const key = (btn?.dataset.fistStoreCategory || '') + ' ' + (btn?.textContent || '');
      const k = key.toLowerCase().replace(/\s+/g, '');
      const i = order.findIndex(p => new RegExp(p).test(k));
      return i < 0 ? 99 : i;
    };
    const sorted = items.map((n, i) => ({ n, i, r: rank(n) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.n);
    if (sorted.some((n, i) => n !== items[i])) bar.append(...sorted);
  }
}

// ---------------------------------------------------------------- HUD sizes
const HUD = [['chatScale', '#chat-container', 'left bottom'], ['killfeedScale', '#killfeed', 'right top'], ['leaderboardScale', '#leaderboard', 'auto'],
  ['healthScale', '#health-bar-container', 'auto'], ['actionScale', '#action-bars-container', 'center bottom']];
const hudStyle = fister.ui.style('');
function applyHud() {
  let out = '';
  for (const [key, sel, origin] of HUD) {
    const v = Number(S(key)) || 100;
    if (v === 100) continue;
    let o = origin;
    if (o === 'auto') {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      o = r && r.width ? (r.left + r.width / 2 < innerWidth / 2 ? 'left' : 'right') + ' ' + (r.top + r.height / 2 < innerHeight / 2 ? 'top' : 'bottom') : 'center';
    }
    out += sel + '{scale:' + (v / 100) + ';transform-origin:' + o + '}\n';
  }
  hudStyle.textContent = out;
}
applyHud();
fister.settings.onChange(k => { if (/Scale$/.test(k)) applyHud(); if (k === 'storeOrder') sortStore(); if (k === 'dailies') pauseButton(); });

// ---------------------------------------------------------------- home screen tips + Discord invite
const TIPS = [
  'Open Settings to change graphics quality, your camera and controls, and to turn things like screen shake off.',
  'Low frame rate? Settings has graphics options that make the game much lighter.',
  'Hold the punch button longer for a stronger hit. The charge bar shows which attack you\'ll do.',
  'Parry has a cooldown; it\'s ready again when the ring around your crosshair flashes.',
  'Join the Fister Discord to meet other players and earn your Leaf of Verification.',
];
if (/Electron/i.test(navigator.userAgent)) TIPS.push('Enjoying Fister? A Steam review helps a lot.');
function tipsBox() {
  const want = S('tips') && !inGame() && document.getElementById('landing') && fister.storage.get('tipsHidden', false) !== true;
  let box = document.getElementById('lazy-tips');
  if (!want) { box?.remove(); return; }
  if (box) return;
  const discord = document.querySelector('#social-links-panel a[href*="discord"]')?.href;
  let i = Math.floor(Math.random() * TIPS.length);
  const text = el('span', {}, TIPS[i]);
  const steam = /Electron/i.test(navigator.userAgent) ? el('a', { href: 'https://store.steampowered.com/app/4682330/Fister/#app_reviews_hash', target: '_blank', rel: 'noopener', style: { flex: 'none' } }, 'Review') : null;
  box = el('div', { id: 'lazy-tips', role: 'note' }, el('b', { style: { flex: 'none' } }, 'Tip'), text,
    discord ? el('a', { className: 'lazy-discord', href: discord, target: '_blank', rel: 'noopener' }, 'Join Discord') : null, steam,
    el('button', { className: 'x', type: 'button', title: 'Hide tips for good', 'aria-label': 'Hide tips', onclick: () => { fister.storage.set('tipsHidden', true); box.remove(); } }, 'x'));
  document.body.append(box);
  fister.onStop(() => box.remove());
  const timer = fister.setInterval(() => { if (!box.isConnected) { clearInterval(timer); return; } i = (i + 1) % TIPS.length; text.textContent = TIPS[i]; }, 12000);
}

// ---------------------------------------------------------------- watch only the few parts of the page these features touch
// (no page-wide observer: the HUD changes every frame during a match)
const watched = new Map();
function watch(id, fn) {
  const node = document.getElementById(id);
  const cur = watched.get(id);
  if (cur && cur.node === node) return;
  cur?.mo.disconnect();
  if (!node) { watched.delete(id); return; }
  let queued = false;
  const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; mo.takeRecords(); fn(node); mo.takeRecords(); }); });
  mo.observe(node, { childList: true, subtree: true, characterData: true });
  watched.set(id, { node, mo });
  fn(node);
}
fister.onStop(() => { for (const w of watched.values()) w.mo.disconnect(); watched.clear(); });
function scan() {
  pauseButton(); tipsBox();
  watch('round-end-scores', decorateScores);
  watch('match-end-scores', decorateScores);
  watch('killfeed', censorTree);
  watch('leaderboard', censorTree);
  watch('fist-store-body', sortStore);
}
fister.setInterval(scan, 1000);
fister.setInterval(applyHud, 5000);
scan();
fister.log('Lazy Edition running. Game hooks: ' + (fister.game.hooked ? 'on' : 'waiting for a reload'));
