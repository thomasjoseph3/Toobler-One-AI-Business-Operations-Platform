import { describe, expect, it } from 'vitest';
import { parseMetaDelivery } from './parse-meta-delivery';

/** A delivery shaped like Meta's, with the given messages. */
function deliveryWith(messages: unknown[], phoneNumberId = '1234567890') {
  return {
    entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, messages } }] }],
  };
}

describe('parseMetaDelivery', () => {
  it('reads a typed message', () => {
    const found = parseMetaDelivery(
      deliveryWith([{ id: 'wamid.1', from: '919847012345', type: 'text', text: { body: '  Rooms for 4?  ' } }]),
    );
    expect(found).toEqual([
      { messageId: 'wamid.1', fromPhoneKey: '919847012345', phoneNumberId: '1234567890', text: 'Rooms for 4?' },
    ]);
  });
  it('reads a tapped button', () => {
    const found = parseMetaDelivery(
      deliveryWith([
        { id: 'w2', from: '919847012345', type: 'interactive', interactive: { button_reply: { title: 'Yes' } } },
      ]),
    );
    expect(found[0]?.text).toBe('Yes');
  });
  it('keeps a voice note or photo with no text', () => {
    const found = parseMetaDelivery(deliveryWith([{ id: 'w3', from: '919847012345', type: 'audio' }]));
    expect(found[0]?.text).toBeNull();
  });
  it('skips delivery receipts, odd shapes and bad numbers', () => {
    expect(parseMetaDelivery({ entry: [{ changes: [{ field: 'statuses', value: {} }] }] })).toEqual([]);
    expect(parseMetaDelivery('nonsense')).toEqual([]);
    expect(parseMetaDelivery(deliveryWith([{ id: 'w4', from: 'abc', type: 'text', text: { body: 'x' } }]))).toEqual([]);
    expect(parseMetaDelivery(deliveryWith([{ from: '919847012345', type: 'text' }]))).toEqual([]);
    expect(
      parseMetaDelivery(deliveryWith([{ id: 'w5', from: '919847012345', type: 'text', text: { body: 'x' } }], 'abc')),
    ).toEqual([]);
  });
  it('cuts a very long message', () => {
    const found = parseMetaDelivery(
      deliveryWith([{ id: 'w6', from: '919847012345', type: 'text', text: { body: 'a'.repeat(5000) } }]),
    );
    expect(found[0]?.text).toHaveLength(1500);
  });
});
