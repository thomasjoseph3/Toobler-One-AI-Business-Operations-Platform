import type { WebchatButton, WebchatSettings } from '@toobler-one/shared';

// Puts a business's stored chat settings into the shape the API shows: which buttons really show, the code to paste, and "last seen".
// Pure: no database.

/** A settings row as the database holds it (what this needs of it). */
export interface StoredWebchatSettings {
  widgetKey: string;
  colour: string;
  greeting: string;
  position: 'bottom_right' | 'bottom_left';
  allowedWebsites: string[];
  phoneNumber: string | null;
  whatsappNumber: string | null;
  whatsappMessage: string | null;
  buttonOrder: string[];
  lastSeenWebsite: string | null;
  lastSeenAt: Date | null;
}

const KNOWN_BUTTONS: readonly WebchatButton[] = ['chat', 'call', 'whatsapp'];

/** The buttons the business chose, in its order, keeping only the ones this version knows (a stored list is never trusted blindly). */
function readButtonOrder(stored: readonly string[]): WebchatButton[] {
  const order: WebchatButton[] = [];
  for (const name of stored) {
    const known = KNOWN_BUTTONS.find((button) => button === name);
    if (known && !order.includes(known)) order.push(known);
  }
  return order;
}

/** The one line of code to paste into the website. The address is the API's own for now (hosting is not decided yet). */
export function makeSnippet(publicBaseUrl: string, widgetKey: string): string {
  return `<script src="${publicBaseUrl}/widget/loader.js" data-key="${widgetKey}" async></script>`;
}

/** The settings as the API shows them. */
export function describeWebchatSettings(stored: StoredWebchatSettings, publicBaseUrl: string): WebchatSettings {
  const buttonOrder = readButtonOrder(stored.buttonOrder);
  // Call and WhatsApp need their number; chat always has what it needs
  const buttonsShown = buttonOrder.filter(
    (button) =>
      button === 'chat' ||
      (button === 'call' && stored.phoneNumber !== null) ||
      (button === 'whatsapp' && stored.whatsappNumber !== null),
  );
  return {
    widgetKey: stored.widgetKey,
    colour: stored.colour,
    greeting: stored.greeting,
    position: stored.position,
    allowedWebsites: stored.allowedWebsites,
    phoneNumber: stored.phoneNumber,
    whatsappNumber: stored.whatsappNumber,
    whatsappMessage: stored.whatsappMessage,
    buttonOrder,
    buttonsShown,
    snippet: makeSnippet(publicBaseUrl, stored.widgetKey),
    lastSeen:
      stored.lastSeenWebsite !== null && stored.lastSeenAt !== null
        ? { website: stored.lastSeenWebsite, at: stored.lastSeenAt.toISOString() }
        : null,
  };
}
