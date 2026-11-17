// The pretend website chat settings for the browser tests. It answers the same calls as the real API (`GET` and `PATCH /channels/webchat`), keeps
// what the page sent, and can be told to be off (404), to refuse or to fail.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendWebchat {
  settings: Record<string, unknown>;
  patches: Array<Record<string, unknown>>;
  /** True when the chat is switched off for the business: both calls answer 404. */
  isOff: boolean;
  /** When set, the next change is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** When true, `GET /channels/webchat` fails with a server error. */
  fails: boolean;
}

const SNIPPET = '<script src="https://api.example/widget/loader.js" data-key="wk_abcdefghijklmnopqrstuvwxyz012345" async></script>';

export function startingWebchat(): PretendWebchat {
  return {
    settings: {
      widgetKey: 'wk_abcdefghijklmnopqrstuvwxyz012345',
      colour: '#1F6FEB',
      greeting: 'Welcome to Nair Stays! Ask me anything.',
      position: 'bottom_right',
      allowedWebsites: ['https://nairstays.example'],
      phoneNumber: '+919847012345',
      whatsappNumber: null,
      whatsappMessage: null,
      buttonOrder: ['chat', 'call', 'whatsapp'],
      buttonsShown: ['chat', 'call'],
      snippet: SNIPPET,
      lastSeen: null,
    },
    patches: [],
    isOff: false,
    refusal: null,
    fails: false,
  };
}

/** Which buttons really show: chosen, and for Call and WhatsApp with a number. */
function shownButtons(settings: Record<string, unknown>): string[] {
  return (settings['buttonOrder'] as string[]).filter((button) => (button === 'call' ? settings['phoneNumber'] : button === 'whatsapp' ? settings['whatsappNumber'] : true));
}

export function answerWebchatCall(state: PretendWebchat, call: { method: string; path: string; body: Record<string, unknown> | null; role: 'manager' | 'staff' }): PretendAnswer | undefined {
  const { method, path, body, role } = call;
  if (path !== '/channels/webchat') return undefined;
  if (state.isOff) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That was not found.' } } };
  if (method === 'GET') {
    if (state.fails) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: state.settings };
  }
  if (method === 'PATCH') {
    if (role !== 'manager') return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      return { status, body: { error: { code, message } } };
    }
    state.patches.push(body ?? {});
    Object.assign(state.settings, body ?? {});
    state.settings['buttonsShown'] = shownButtons(state.settings);
    return { status: 200, body: state.settings };
  }
  return undefined;
}
