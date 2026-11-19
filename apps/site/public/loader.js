// The one line a business pastes into its website loads this file. It is plain JavaScript on purpose (no React, no libraries), so it is tiny
// and never slows the customer's page. It asks the chat service how the bubble should look, shows the launcher buttons (Chat, Call,
// WhatsApp), and opens the chat window (a separate page in an iframe) when the visitor taps Chat. It never reads or changes the page.
(function startTooblerChat() {
  'use strict';

  const script = document.currentScript;
  if (!script) return;
  const widgetKey = script.getAttribute('data-key') || '';
  if (!/^wk_[A-Za-z0-9_-]{32}$/.test(widgetKey)) return;
  // The loader and the chat service live at the same address (the one the script was loaded from)
  const serviceOrigin = new URL(script.src, window.location.href).origin;
  if (window.__tooblerChatStarted === widgetKey) return;
  window.__tooblerChatStarted = widgetKey;

  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const ICON_PATHS = {
    chat: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    close: 'M6 6l12 12M18 6L6 18',
    call: 'M6.6 3h3l1.4 4-2 1.4a11 11 0 0 0 5.6 5.6L16 12l4 1.4v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z',
    whatsapp:
      'M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zm-3 5.5c.3-.6.6-.6.9-.6h.5l.9 2.1-.7 1c.6 1.3 1.6 2.3 3 3l1-.8 2 .9c0 .6-.3 1.3-.9 1.6-.7.4-1.4.4-2.3.1-2.4-.8-4.4-2.7-5.2-5-.2-.7-.1-1.6.8-2.9z',
  };
  const LABELS = {
    chat: 'Chat with us',
    close: 'Close the chat',
    call: 'Call us',
    whatsapp: 'Chat with us on WhatsApp',
  };

  /** An icon drawn from one path (a line icon, so it takes the button's colour). */
  function makeIcon(name) {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', ICON_PATHS[name]);
    svg.appendChild(path);
    return svg;
  }

  /** The styles of the bubble, written for one colour and one side of the screen. */
  function makeStyles(colour, position) {
    const side = position === 'bottom_left' ? 'left' : 'right';
    return `
      :host { all: initial; }
      .launcher { position: fixed; ${side}: 16px; bottom: 16px; bottom: max(16px, env(safe-area-inset-bottom));
        display: flex; flex-direction: column; align-items: center; gap: 12px; z-index: 2147483000;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
      .button { width: 56px; height: 56px; border-radius: 50%; border: 0; padding: 0; display: flex; align-items: center;
        justify-content: center; background: ${colour}; color: #ffffff; cursor: pointer; text-decoration: none;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28); }
      .button:hover { filter: brightness(1.12); }
      .button:focus-visible { outline: 3px solid #ffffff; box-shadow: 0 0 0 6px ${colour}; }
      .frame { position: fixed; ${side}: 16px; bottom: 88px; width: 380px; height: min(640px, calc(100vh - 112px));
        border: 0; border-radius: 16px; background: #ffffff; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3); z-index: 2147483000; }
      .frame[hidden], .launcher[hidden] { display: none; }
      @media (max-width: 480px) {
        .frame { inset: 0; width: 100%; height: 100%; border-radius: 0; }
      }
      @media (prefers-reduced-motion: no-preference) { .button { transition: filter 120ms; } }
    `;
  }

  /** Builds the bubble from the business's settings. */
  function start(config) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(config.colour)) return;
    const host = document.createElement('div');
    host.setAttribute('data-toobler-chat', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = makeStyles(config.colour, config.position);
    const launcher = document.createElement('div');
    launcher.className = 'launcher';
    shadow.append(style, launcher);

    let frame = null;
    let chatButton = null;

    /** Opens or closes the chat window. The window page is only loaded the first time it is opened. */
    function setChatOpen(shouldOpen) {
      if (shouldOpen && !frame) {
        frame = document.createElement('iframe');
        frame.className = 'frame';
        frame.title = 'Chat with our AI assistant';
        frame.src = `${serviceOrigin}/widget/chat?key=${encodeURIComponent(widgetKey)}`;
        shadow.appendChild(frame);
      }
      if (!frame) return;
      frame.hidden = !shouldOpen;
      if (chatButton) {
        chatButton.setAttribute('aria-expanded', String(shouldOpen));
        chatButton.setAttribute('aria-label', shouldOpen ? LABELS.close : LABELS.chat);
        chatButton.replaceChildren(makeIcon(shouldOpen ? 'close' : 'chat'));
      }
      if (shouldOpen) frame.focus();
      else if (chatButton) chatButton.focus();
      // On a phone the window covers the whole screen, so the buttons step aside while it is open
      if (window.matchMedia('(max-width: 480px)').matches) launcher.hidden = shouldOpen;
    }

    for (const button of config.buttons) {
      if (button.kind === 'chat') {
        chatButton = document.createElement('button');
        chatButton.type = 'button';
        chatButton.className = 'button';
        chatButton.setAttribute('aria-label', LABELS.chat);
        chatButton.setAttribute('aria-expanded', 'false');
        chatButton.appendChild(makeIcon('chat'));
        chatButton.addEventListener('click', () => setChatOpen(!frame || frame.hidden));
        launcher.appendChild(chatButton);
      } else if (button.kind === 'call' && typeof button.link === 'string' && button.link.startsWith('tel:')) {
        launcher.appendChild(makeLink('call', button.link, false));
      } else if (
        button.kind === 'whatsapp' &&
        typeof button.link === 'string' &&
        button.link.startsWith('https://wa.me/')
      ) {
        launcher.appendChild(makeLink('whatsapp', button.link, true));
      }
    }

    /** A button that is a plain link (the phone app, or WhatsApp in a new tab). */
    function makeLink(kind, address, opensNewTab) {
      const link = document.createElement('a');
      link.className = 'button';
      link.href = address;
      link.setAttribute('aria-label', LABELS[kind]);
      if (opensNewTab) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      link.appendChild(makeIcon(kind));
      return link;
    }

    // The chat window asks to be closed (its × button, or Escape). Only the window we made is listened to.
    window.addEventListener('message', (event) => {
      if (event.origin !== serviceOrigin || !frame || event.source !== frame.contentWindow) return;
      if (event.data && event.data.type === 'toobler-chat:close') setChatOpen(false);
    });

    document.body.appendChild(host);
  }

  fetch(`${serviceOrigin}/api/v1/public/widget/${encodeURIComponent(widgetKey)}/config`, { credentials: 'omit' })
    .then((response) => (response.ok ? response.json() : null))
    .then((config) => {
      if (config && Array.isArray(config.buttons) && config.buttons.length > 0) start(config);
    })
    .catch(() => {
      // The chat service is unreachable or this website is not allowed: the page simply has no bubble
    });
})();
