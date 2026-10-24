// ==FisterPlugin==
// @id          hit-sounds
// @name        Hit Sounds
// @version     1.0.0
// @author      jaxonb423
// @description Plays a short sound when you land a hit, parry or KO, so you can hear it even when the screen is busy.
// @tags        audio combat
// @icon        https://raw.githubusercontent.com/jaxonb423/fister-plugins/main/plugins/art/hit-sounds-icon.svg
// @banner      https://raw.githubusercontent.com/jaxonb423/fister-plugins/main/plugins/art/hit-sounds-banner.svg
// ==/FisterPlugin==

fister.settings.define({
  volume: { type: 'range', label: 'Volume', min: 0, max: 100, default: 50 },
  hits:    { type: 'checkbox', label: 'Hits', default: true },
  parries: { type: 'checkbox', label: 'Parries', default: true },
  kos:     { type: 'checkbox', label: 'KOs', default: true },
  pitch:   { type: 'range', label: 'Pitch', min: 50, max: 200, default: 100, note: '100 is normal' },
});

let ctx = null;
// Synth blips: no sound files needed.
function blip(notes) {
  const vol = fister.settings.get('volume') / 100;
  if (!vol) return;
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const pitch = fister.settings.get('pitch') / 100;
  let t = ctx.currentTime;
  for (const [freq, len, type] of notes) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq * pitch;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + len + 0.02);
    t += len * 0.8;
  }
}

fister.on('punch', e => { if (e.byMe && e.hit && fister.settings.get('hits')) blip([[660, 0.06]]); });
fister.on('parry', e => { if (e.byMe && fister.settings.get('parries')) blip([[1320, 0.08, 'triangle'], [1760, 0.1, 'triangle']]); });
fister.on('kill', e => { if (e.byMe && fister.settings.get('kos')) blip([[523, 0.09], [659, 0.09], [784, 0.16]]); });
fister.onStop(() => { if (ctx) ctx.close(); });
