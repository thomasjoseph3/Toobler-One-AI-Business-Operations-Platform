import type { PatchWebchatSettingsRequest, WebchatButton, WebchatPosition, WebchatSettings } from '@toobler-one/shared';
import { MOST_ALLOWED_WEBSITES } from '@toobler-one/shared';

// The website chat's settings as the form holds them, and how they turn into what the API takes. Pure: no screen, no network.
// The API tidies and checks everything again; these checks give quick, friendly messages.

export interface WebchatFormFields {
  colour: string;
  greeting: string;
  position: WebchatPosition;
  phoneNumber: string;
  whatsappNumber: string;
  whatsappMessage: string;
  buttonOrder: WebchatButton[];
}

export type WebchatFormProblems = Partial<Record<'colour' | 'greeting' | 'phoneNumber' | 'whatsappNumber' | 'whatsappMessage' | 'buttonOrder', string>>;

export const formFromSettings = (settings: WebchatSettings): WebchatFormFields => ({
  colour: settings.colour,
  greeting: settings.greeting,
  position: settings.position,
  phoneNumber: settings.phoneNumber ?? '',
  whatsappNumber: settings.whatsappNumber ?? '',
  whatsappMessage: settings.whatsappMessage ?? '',
  buttonOrder: [...settings.buttonOrder],
});

/** Whether a text looks like a phone number: a leading + is allowed, and 7 to 15 digits among spaces, dashes and brackets. */
export function looksLikePhoneNumber(text: string): boolean {
  if (!/^\+?[\d\s\-()]+$/.test(text.trim())) return false;
  const digits = text.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

/** Checks the form. A number may be left empty (that button is then hidden). */
export function checkWebchatForm(fields: WebchatFormFields): WebchatFormProblems {
  const problems: WebchatFormProblems = {};
  if (!/^#[0-9A-Fa-f]{6}$/.test(fields.colour)) problems.colour = 'Use a colour like #1F6FEB.';
  const greeting = fields.greeting.trim();
  if (greeting === '') problems.greeting = 'Write a greeting.';
  else if (greeting.length > 200) problems.greeting = 'Keep the greeting under 200 characters.';
  if (fields.phoneNumber.trim() !== '' && !looksLikePhoneNumber(fields.phoneNumber)) problems.phoneNumber = 'Use a phone number like +91 98470 12345.';
  if (fields.whatsappNumber.trim() !== '' && !looksLikePhoneNumber(fields.whatsappNumber)) problems.whatsappNumber = 'Use a number like +91 98470 12345.';
  if (fields.whatsappMessage.trim().length > 300) problems.whatsappMessage = 'Keep the message under 300 characters.';
  if (fields.buttonOrder.length === 0) problems.buttonOrder = 'Keep at least one button.';
  return problems;
}

const sameList = (first: readonly string[], second: readonly string[]) => JSON.stringify(first) === JSON.stringify(second);

/** What `PATCH /channels/webchat` takes: only what changed from the settings as they were. A number or message the owner emptied is sent as null. */
export function buildWebchatPatch(original: WebchatSettings, fields: WebchatFormFields): PatchWebchatSettingsRequest {
  const request: PatchWebchatSettingsRequest = {};
  if (fields.colour.toUpperCase() !== original.colour.toUpperCase()) request.colour = fields.colour;
  if (fields.greeting.trim() !== original.greeting) request.greeting = fields.greeting.trim();
  if (fields.position !== original.position) request.position = fields.position;
  const asNullable = (text: string) => (text.trim() === '' ? null : text.trim());
  if (asNullable(fields.phoneNumber) !== original.phoneNumber) request.phoneNumber = asNullable(fields.phoneNumber);
  if (asNullable(fields.whatsappNumber) !== original.whatsappNumber) request.whatsappNumber = asNullable(fields.whatsappNumber);
  if (asNullable(fields.whatsappMessage) !== original.whatsappMessage) request.whatsappMessage = asNullable(fields.whatsappMessage);
  if (!sameList(fields.buttonOrder, original.buttonOrder)) request.buttonOrder = fields.buttonOrder;
  return request;
}

/** Whether a patch has nothing in it. */
export const isEmptyPatch = (request: object): boolean => Object.keys(request).length === 0;

/** The button order with one button moved a place; the ends and unknown buttons leave it as it was. */
export function moveButton(order: readonly WebchatButton[], button: WebchatButton, direction: 'up' | 'down'): WebchatButton[] {
  const position = order.indexOf(button);
  const target = direction === 'up' ? position - 1 : position + 1;
  if (position === -1 || target < 0 || target >= order.length) return [...order];
  const moved = [...order];
  [moved[position], moved[target]] = [moved[target]!, moved[position]!];
  return moved;
}

/** Adds a button to the end, or takes it out (the chat button too: a business may show only Call and WhatsApp). */
export function toggleButton(order: readonly WebchatButton[], button: WebchatButton, isOn: boolean): WebchatButton[] {
  const without = order.filter((item) => item !== button);
  return isOn ? [...without, button] : without;
}

/** Whether a button really shows: chosen, and for Call and WhatsApp the number is set (in the form as typed). */
export function isButtonShown(button: WebchatButton, fields: WebchatFormFields): boolean {
  if (!fields.buttonOrder.includes(button)) return false;
  if (button === 'call') return fields.phoneNumber.trim() !== '';
  if (button === 'whatsapp') return fields.whatsappNumber.trim() !== '';
  return true;
}

// ---- Allowed websites ----

/**
 * Turns what the owner typed into a website address like https://nairstays.example (no page, no trailing slash), or null when it is not an
 * address. A bare name gets https://. This only tidies and checks the shape: the API does the same again and decides.
 */
export function tidyWebsite(typed: string): string | null {
  const text = typed.trim();
  if (text === '') return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  return url.origin;
}

/** The list with a website added (tidied, no duplicates, within the most allowed), or a message saying why not. */
export function addWebsite(list: readonly string[], typed: string): { ok: true; list: string[] } | { ok: false; message: string } {
  const website = tidyWebsite(typed);
  if (website === null) return { ok: false, message: 'Use the address of your website, like https://www.nairstays.in.' };
  if (list.includes(website)) return { ok: false, message: 'That website is already on the list.' };
  if (list.length >= MOST_ALLOWED_WEBSITES) return { ok: false, message: `You can list up to ${MOST_ALLOWED_WEBSITES} websites.` };
  return { ok: true, list: [...list, website] };
}

// ---- Checking the installation ----

export type InstallationState =
  | { kind: 'no_websites' }
  | { kind: 'never_seen' }
  | { kind: 'seen'; website: string; at: string };

/** What "Check installation" says: no website listed yet, the bubble never seen, or where and when it was last seen working. */
export function describeInstallation(settings: Pick<WebchatSettings, 'allowedWebsites' | 'lastSeen'>): InstallationState {
  if (settings.allowedWebsites.length === 0) return { kind: 'no_websites' };
  if (settings.lastSeen === null) return { kind: 'never_seen' };
  return { kind: 'seen', website: settings.lastSeen.website, at: settings.lastSeen.at };
}

/** "17 Nov 2026, 15:30" in the business's time zone. */
export function formatSeenAt(isoText: string, timeZone: string): string {
  const moment = new Date(isoText);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(moment);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(moment);
  return `${day}, ${time}`;
}
