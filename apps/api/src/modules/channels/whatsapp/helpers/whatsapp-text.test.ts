import { describe, expect, it } from 'vitest';
import { buildChatLink, isWithinReplyWindow, toWhatsAppText } from './whatsapp-text';

describe('toWhatsAppText', () => {
  it('turns bold, links and headings into WhatsApp form', () => {
    expect(toWhatsAppText('## Rooms\n**Deluxe** [see](https://x.example/r)')).toBe(
      'Rooms\n*Deluxe* see: https://x.example/r',
    );
  });
  it('writes a link whose label is the address once', () => {
    expect(toWhatsAppText('[https://x.example](https://x.example)')).toBe('https://x.example');
  });
  it('cuts a long reply', () => {
    expect(toWhatsAppText('a'.repeat(9000))).toHaveLength(4000);
  });
});

describe('isWithinReplyWindow', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('is open for 24 hours after the customer wrote', () => {
    expect(isWithinReplyWindow(new Date('2026-11-18T12:00:01Z'), now)).toBe(true);
    expect(isWithinReplyWindow(new Date('2026-11-18T11:59:59Z'), now)).toBe(false);
  });
  it('is closed when the customer never wrote', () => {
    expect(isWithinReplyWindow(null, now)).toBe(false);
  });
});

describe('buildChatLink', () => {
  it('uses the digits of the number', () => {
    expect(buildChatLink('+919847012345')).toBe('https://wa.me/919847012345');
    expect(buildChatLink(null)).toBeNull();
  });
});
