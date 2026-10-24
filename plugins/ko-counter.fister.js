// ==FisterPlugin==
// @id          ko-counter
// @name        KO Counter
// @version     1.0.0
// @author      jaxonb423
// @description Shows how many KOs you've landed this round (and this session) in a small box on screen.
// @tags        hud stats
// @icon        https://raw.githubusercontent.com/jaxonb423/fister-plugin-manager/main/plugins/art/ko-counter-icon.svg
// @banner      https://raw.githubusercontent.com/jaxonb423/fister-plugin-manager/main/plugins/art/ko-counter-banner.svg
// ==/FisterPlugin==

fister.settings.define({
  corner: { type: 'select', label: 'Corner', default: 'top-right',
    options: [['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']] },
  showSession: { type: 'checkbox', label: 'Also show the session total', default: true },
});

fister.ui.style(`
  .fpm-ko-counter { position: fixed; padding: 6px 12px; background: rgba(0,0,0,.62); color: #fff;
    font: 700 14px Tahoma, Arial, sans-serif; border-radius: 6px; letter-spacing: .5px; }
  .fpm-ko-counter.bump { animation: fpm-ko-bump .35s ease-out; }
  @keyframes fpm-ko-bump { 40% { transform: scale(1.25); } }
`);
const box = fister.ui.add(fister.ui.element('div', { className: 'fpm-ko-counter' }));

let round = 0, session = 0;
function place() {
  const c = fister.settings.get('corner');
  Object.assign(box.style, { top: c.startsWith('top') ? '12px' : '', bottom: c.startsWith('bottom') ? '12px' : '',
    left: c.endsWith('left') ? '12px' : '', right: c.endsWith('right') ? '12px' : '' });
}
function draw() {
  box.textContent = 'KOs: ' + round + (fister.settings.get('showSession') ? '  ·  session ' + session : '');
}

fister.on('kill', e => {
  if (!e.byMe) return;
  round++; session++; draw();
  box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
  fister.log('KO on', e.victim || 'someone');
});
fister.on('roundStart', () => { round = 0; draw(); });
fister.settings.onChange(() => { place(); draw(); });
place(); draw();
