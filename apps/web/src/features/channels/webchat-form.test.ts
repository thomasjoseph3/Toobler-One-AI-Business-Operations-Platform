import { describe, expect, it } from 'vitest';
import type { WebchatSettings } from '@toobler-one/shared';
import {
  addWebsite,
  buildWebchatPatch,
  checkWebchatForm,
  describeInstallation,
  formatSeenAt,
  formFromSettings,
  isButtonShown,
  isEmptyPatch,
  looksLikePhoneNumber,
  moveButton,
  tidyWebsite,
  toggleButton,
} from './webchat-form';

const settings = (changes: Partial<WebchatSettings> = {}): WebchatSettings => ({
  widgetKey: 'wk_abcdefghijklmnopqrstuvwxyz012345',
  colour: '#1F6FEB',
  greeting: 'Welcome to Nair Stays',
  position: 'bottom_right',
  allowedWebsites: ['https://nairstays.example'],
  phoneNumber: '+919847012345',
  whatsappNumber: null,
  whatsappMessage: null,
  buttonOrder: ['chat', 'call', 'whatsapp'],
  buttonsShown: ['chat', 'call'],
  snippet: '<script src="x" data-key="wk_abc" async></script>',
  lastSeen: null,
  ...changes,
});

describe('checkWebchatForm', () => {
  it('accepts the settings as they are', () => {
    expect(checkWebchatForm(formFromSettings(settings()))).toEqual({});
  });

  it('checks the colour, the greeting, the numbers and that a button is kept', () => {
    const problems = checkWebchatForm({
      ...formFromSettings(settings()),
      colour: 'blue',
      greeting: '  ',
      phoneNumber: 'call me',
      whatsappNumber: '12',
      whatsappMessage: 'x'.repeat(301),
      buttonOrder: [],
    });
    expect(Object.keys(problems).sort()).toEqual([
      'buttonOrder',
      'colour',
      'greeting',
      'phoneNumber',
      'whatsappMessage',
      'whatsappNumber',
    ]);
  });

  it('knows a phone number from other text', () => {
    for (const good of ['+91 98470 12345', '98470-12345', '(0484) 123 4567'])
      expect(looksLikePhoneNumber(good), good).toBe(true);
    for (const bad of ['', 'abc', '12', '+1234567890123456', '98470 12345 ext'])
      expect(looksLikePhoneNumber(bad), bad).toBe(false);
  });
});

describe('buildWebchatPatch', () => {
  it('is empty when nothing changed', () => {
    expect(isEmptyPatch(buildWebchatPatch(settings(), formFromSettings(settings())))).toBe(true);
  });

  it('sends only what changed, and null for a number or message the owner emptied', () => {
    const original = settings({ whatsappNumber: '+919847099999', whatsappMessage: 'Hello' });
    const fields = { ...formFromSettings(original), greeting: 'Hi there', phoneNumber: '', whatsappMessage: ' ' };
    expect(buildWebchatPatch(original, fields)).toEqual({
      greeting: 'Hi there',
      phoneNumber: null,
      whatsappMessage: null,
    });
  });

  it('does not count a capital or small hex letter as a change, and sends a new order', () => {
    const original = settings();
    expect(isEmptyPatch(buildWebchatPatch(original, { ...formFromSettings(original), colour: '#1f6feb' }))).toBe(true);
    expect(
      buildWebchatPatch(original, {
        ...formFromSettings(original),
        buttonOrder: ['call', 'chat', 'whatsapp'],
        position: 'bottom_left',
      }),
    ).toEqual({
      position: 'bottom_left',
      buttonOrder: ['call', 'chat', 'whatsapp'],
    });
  });
});

describe('the buttons', () => {
  it('moves a button one place and leaves the ends alone', () => {
    expect(moveButton(['chat', 'call', 'whatsapp'], 'call', 'up')).toEqual(['call', 'chat', 'whatsapp']);
    expect(moveButton(['chat', 'call', 'whatsapp'], 'chat', 'up')).toEqual(['chat', 'call', 'whatsapp']);
    expect(moveButton(['chat', 'call'], 'whatsapp', 'down')).toEqual(['chat', 'call']);
  });

  it('adds a button at the end or takes it out', () => {
    expect(toggleButton(['chat'], 'call', true)).toEqual(['chat', 'call']);
    expect(toggleButton(['chat', 'call'], 'chat', false)).toEqual(['call']);
    expect(toggleButton(['chat', 'call'], 'call', true)).toEqual(['chat', 'call']);
  });

  it('shows Call and WhatsApp only with their number', () => {
    const fields = formFromSettings(settings());
    expect(isButtonShown('chat', fields)).toBe(true);
    expect(isButtonShown('call', fields)).toBe(true);
    expect(isButtonShown('whatsapp', fields)).toBe(false); // chosen, but no number
    expect(isButtonShown('call', { ...fields, buttonOrder: ['chat'] })).toBe(false);
  });
});

describe('allowed websites', () => {
  it('tidies a typed website to its address, and refuses what is not one', () => {
    expect(tidyWebsite('nairstays.in')).toBe('https://nairstays.in');
    expect(tidyWebsite(' https://www.nairstays.in/rooms?x=1 ')).toBe('https://www.nairstays.in');
    expect(tidyWebsite('http://localhost:4000')).toBe('http://localhost:4000');
    for (const bad of ['', 'not a site', 'ftp://nairstays.in', 'javascript:alert(1)', 'intranet'])
      expect(tidyWebsite(bad), bad).toBeNull();
  });

  it('adds a website once, and says why when it cannot', () => {
    expect(addWebsite(['https://a.example'], 'b.example')).toEqual({
      ok: true,
      list: ['https://a.example', 'https://b.example'],
    });
    expect(addWebsite(['https://a.example'], 'https://a.example/').ok).toBe(false);
    expect(addWebsite([], 'nonsense')).toMatchObject({ ok: false });
    expect(
      addWebsite(
        Array.from({ length: 20 }, (_, number) => `https://s${number}.example`),
        'new.example',
      ),
    ).toMatchObject({ ok: false });
  });
});

describe('checking the installation', () => {
  it('says no website, never seen, or where and when it was seen', () => {
    expect(describeInstallation(settings({ allowedWebsites: [] }))).toEqual({ kind: 'no_websites' });
    expect(describeInstallation(settings())).toEqual({ kind: 'never_seen' });
    expect(
      describeInstallation(
        settings({ lastSeen: { website: 'https://nairstays.example', at: '2026-11-17T10:00:00.000Z' } }),
      ),
    ).toEqual({
      kind: 'seen',
      website: 'https://nairstays.example',
      at: '2026-11-17T10:00:00.000Z',
    });
  });

  it('shows the time in the business’s own time zone', () => {
    expect(formatSeenAt('2026-11-17T10:00:00.000Z', 'Asia/Kolkata')).toBe('17 Nov 2026, 15:30');
    expect(formatSeenAt('2026-11-17T10:00:00.000Z', 'Asia/Dubai')).toBe('17 Nov 2026, 14:00');
  });
});
