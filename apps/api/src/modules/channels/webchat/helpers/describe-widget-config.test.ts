import { describe, expect, it } from 'vitest';
import type { StoredWebchatSettings } from './describe-webchat-settings';
import { describeWidgetConfig } from './describe-widget-config';

const baseSettings: StoredWebchatSettings = {
  widgetKey: 'wk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  colour: '#161715',
  greeting: 'Hello',
  position: 'bottom_right',
  allowedWebsites: [],
  phoneNumber: null,
  whatsappNumber: null,
  whatsappMessage: null,
  buttonOrder: ['chat', 'call', 'whatsapp'],
  lastSeenWebsite: null,
  lastSeenAt: null,
};

describe('describeWidgetConfig', () => {
  it('shows only the chat button when no number is set', () => {
    const config = describeWidgetConfig(baseSettings, 'http://api.example');
    expect(config.buttons).toEqual([{ kind: 'chat', link: null }]);
    expect(config).toMatchObject({ colour: '#161715', greeting: 'Hello', position: 'bottom_right' });
  });

  it('builds a tel: link and a wa.me link with the ready-typed message encoded', () => {
    const config = describeWidgetConfig(
      {
        ...baseSettings,
        phoneNumber: '+919847012345',
        whatsappNumber: '+919847099999',
        whatsappMessage: 'Hi & hello?',
      },
      'http://api.example',
    );
    expect(config.buttons).toEqual([
      { kind: 'chat', link: null },
      { kind: 'call', link: 'tel:+919847012345' },
      { kind: 'whatsapp', link: 'https://wa.me/919847099999?text=Hi%20%26%20hello%3F' },
    ]);
  });

  it('keeps the business’s order and leaves out buttons it did not choose', () => {
    const config = describeWidgetConfig(
      {
        ...baseSettings,
        phoneNumber: '+919847012345',
        whatsappNumber: '+919847099999',
        buttonOrder: ['whatsapp', 'chat'],
      },
      'http://api.example',
    );
    expect(config.buttons.map((button) => button.kind)).toEqual(['whatsapp', 'chat']);
    expect(config.buttons[0]?.link).toBe('https://wa.me/919847099999');
  });
});
