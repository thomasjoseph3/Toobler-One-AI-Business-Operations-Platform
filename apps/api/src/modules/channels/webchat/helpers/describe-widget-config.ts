import type { WidgetConfig } from '@toobler-one/shared';
import { describeWebchatSettings, type StoredWebchatSettings } from './describe-webchat-settings';

// Puts a business's chat settings into what the bubble on a website needs: the look and the buttons with their links. Pure: no database.

/** The link of the Call button: the phone app opens with the number ready. */
function makeCallLink(phoneNumber: string): string {
  return `tel:${phoneNumber}`;
}

/** The link of the WhatsApp button: WhatsApp opens a chat with the number, with the ready-typed message when there is one. */
function makeWhatsappLink(whatsappNumber: string, whatsappMessage: string | null): string {
  const digitsOnly = whatsappNumber.replace(/^\+/, '');
  const message =
    whatsappMessage === null || whatsappMessage === '' ? '' : `?text=${encodeURIComponent(whatsappMessage)}`;
  return `https://wa.me/${digitsOnly}${message}`;
}

/** What the bubble needs, in the business's button order. Only the buttons that really show are included. */
export function describeWidgetConfig(stored: StoredWebchatSettings, publicBaseUrl: string): WidgetConfig {
  const shown = describeWebchatSettings(stored, publicBaseUrl).buttonsShown;
  return {
    colour: stored.colour,
    greeting: stored.greeting,
    position: stored.position,
    buttons: shown.map((button) => {
      if (button === 'call' && stored.phoneNumber !== null) {
        return { kind: button, link: makeCallLink(stored.phoneNumber) };
      }
      if (button === 'whatsapp' && stored.whatsappNumber !== null) {
        return { kind: button, link: makeWhatsappLink(stored.whatsappNumber, stored.whatsappMessage) };
      }
      return { kind: button, link: null };
    }),
  };
}
