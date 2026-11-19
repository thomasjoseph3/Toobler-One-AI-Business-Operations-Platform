import { describe, expect, it } from 'vitest';
import { describeWebchatSettings, makeSnippet, type StoredWebchatSettings } from './describe-webchat-settings';

const stored: StoredWebchatSettings = {
  widgetKey: 'wk_abcdefghijklmnopqrstuvwxyz012345',
  colour: '#161715',
  greeting: 'Hi!',
  position: 'bottom_right',
  allowedWebsites: ['https://nairstays.example'],
  phoneNumber: null,
  whatsappNumber: null,
  whatsappMessage: null,
  buttonOrder: ['chat', 'call', 'whatsapp'],
  lastSeenWebsite: null,
  lastSeenAt: null,
};

describe('describeWebchatSettings', () => {
  it('shows only the chat button until the numbers are set', () => {
    expect(describeWebchatSettings(stored, 'https://api.example').buttonsShown).toEqual(['chat']);
  });

  it('shows Call and WhatsApp once their number is set, in the business’s order', () => {
    const described = describeWebchatSettings(
      {
        ...stored,
        phoneNumber: '+919847012345',
        whatsappNumber: '+919847012345',
        buttonOrder: ['whatsapp', 'chat', 'call'],
      },
      'https://api.example',
    );
    expect(described.buttonsShown).toEqual(['whatsapp', 'chat', 'call']);
  });

  it('hides a button the business left out of its order, even with a number', () => {
    const described = describeWebchatSettings(
      { ...stored, phoneNumber: '+919847012345', buttonOrder: ['chat'] },
      'https://api.example',
    );
    expect(described.buttonsShown).toEqual(['chat']);
  });

  it('ignores a button name this version does not know, and repeats', () => {
    const described = describeWebchatSettings(
      { ...stored, buttonOrder: ['chat', 'sms', 'chat'] },
      'https://api.example',
    );
    expect(described.buttonOrder).toEqual(['chat']);
  });

  it('says where and when the bubble was last seen, or null', () => {
    expect(describeWebchatSettings(stored, 'https://api.example').lastSeen).toBeNull();
    const seen = describeWebchatSettings(
      { ...stored, lastSeenWebsite: 'https://nairstays.example', lastSeenAt: new Date('2026-11-16T04:00:00Z') },
      'https://api.example',
    );
    expect(seen.lastSeen).toEqual({ website: 'https://nairstays.example', at: '2026-11-16T04:00:00.000Z' });
  });

  it('gives the one line of code to paste', () => {
    expect(describeWebchatSettings(stored, 'https://api.example').snippet).toBe(
      '<script src="https://api.example/widget/loader.js" data-key="wk_abcdefghijklmnopqrstuvwxyz012345" async></script>',
    );
    expect(makeSnippet('http://localhost:4000', 'wk_x')).toContain('http://localhost:4000/widget/loader.js');
  });
});
