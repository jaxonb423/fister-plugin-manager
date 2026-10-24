// ==FisterPlugin==
// @id          chat-timestamps
// @name        Chat Timestamps
// @version     1.0.0
// @author      jaxonb423
// @description Puts the time in front of each new chat message.
// @tags        chat
// @icon        https://raw.githubusercontent.com/jaxonb423/fister-plugins/main/plugins/art/chat-timestamps-icon.svg
// @banner      https://raw.githubusercontent.com/jaxonb423/fister-plugins/main/plugins/art/chat-timestamps-banner.svg
// ==/FisterPlugin==

fister.settings.define({
  hour24: { type: 'checkbox', label: '24-hour clock', default: false },
  seconds: { type: 'checkbox', label: 'Show seconds', default: false },
});

fister.ui.style(`.fpm-ts { opacity: .65; font-size: .85em; margin-right: 4px; }`);

fister.chat.onMessage(({ element }) => {
  if (element.querySelector('.fpm-ts')) return;
  const stamp = document.createElement('span');
  stamp.className = 'fpm-ts';
  stamp.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit',
    second: fister.settings.get('seconds') ? '2-digit' : undefined,
    hour12: !fister.settings.get('hour24'),
  });
  element.prepend(stamp);
});

// Take the stamps away again when the plugin is turned off.
fister.onStop(() => document.querySelectorAll('.fpm-ts').forEach(el => el.remove()));
