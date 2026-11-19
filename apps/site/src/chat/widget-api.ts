import type { WidgetChat, WidgetConfig, WidgetMessageResponse } from '@toobler-one/shared';

// The chat window's calls to the public chat routes. The window is served by the API itself, so every address is on the same site.

/** A failed call: the HTTP status, and the API's error code when it gave one. The API's own words are never shown to the visitor. */
export class WidgetApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null) {
    super(`The chat call failed (${status})`);
    this.status = status;
    this.code = code;
  }
}

/** Makes the address of one of the key's chat routes. */
function addressOf(widgetKey: string, path: 'config' | 'messages' | 'end'): string {
  return `/api/v1/public/widget/${encodeURIComponent(widgetKey)}/${path}`;
}

/** Sends one request and gives back its JSON, or throws a WidgetApiError (a network failure is status 0). */
async function callApi<Answer>(
  address: string,
  options: { method: 'GET' | 'POST'; token?: string | null; body?: unknown },
): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(address, {
      method: options.method,
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new WidgetApiError(0, null);
  }
  if (!response.ok) {
    let code: string | null = null;
    try {
      const failure = (await response.json()) as { error?: { code?: unknown } };
      code = typeof failure.error?.code === 'string' ? failure.error.code : null;
    } catch {
      // An answer that is not JSON has no code
    }
    throw new WidgetApiError(response.status, code);
  }
  return (await response.json()) as Answer;
}

/** How the bubble looks (colour, greeting). */
export const fetchWidgetConfig = (widgetKey: string) =>
  callApi<WidgetConfig>(addressOf(widgetKey, 'config'), { method: 'GET' });

/** The chat so far, for a visitor coming back. */
export const fetchWidgetChat = (widgetKey: string, token: string) =>
  callApi<WidgetChat>(addressOf(widgetKey, 'messages'), { method: 'GET', token });

/** Sends the visitor's message (without a token it starts a chat) and gives back the reply and the token to keep. */
export const sendWidgetMessage = (widgetKey: string, token: string | null, message: string) =>
  callApi<WidgetMessageResponse>(addressOf(widgetKey, 'messages'), { method: 'POST', token, body: { message } });

/** Ends the chat. */
export const endWidgetChat = (widgetKey: string, token: string) =>
  callApi<{ ended: true }>(addressOf(widgetKey, 'end'), { method: 'POST', token });
