import { describe, expect, it } from 'vitest';
import { factsToAnswers } from './facts-to-answers';

describe('factsToAnswers', () => {
  it('gives the name, the address in one line, and every phone and email once', () => {
    const answers = factsToAnswers({
      facts: {
        name: 'Nair Stays',
        phone: '+91 98470 12345',
        address: { line1: 'Beach Road', city: 'Kovalam', state: 'Kerala', postalCode: '695527' },
      },
      phones: ['+91 98470 12345', '+919847099999'],
      emails: ['hello@nairstays.example'],
    });
    expect(answers).toEqual([
      { questionKey: 'business_name', value: 'Nair Stays' },
      { questionKey: 'address', value: 'Beach Road, Kovalam, Kerala, 695527' },
      {
        questionKey: 'contact_details',
        value: {
          rows: [
            { kind: 'Phone', value: '+91 98470 12345' },
            { kind: 'Phone', value: '+919847099999' },
            { kind: 'Email', value: 'hello@nairstays.example' },
          ],
        },
      },
    ]);
  });

  it('gives nothing when the page states nothing, and at most ten contact rows', () => {
    expect(factsToAnswers({ facts: {}, phones: [], emails: [] })).toEqual([]);
    const many = Array.from({ length: 30 }, (_, number) => `+91 90000 000${String(number).padStart(2, '0')}`);
    const rows = (factsToAnswers({ facts: {}, phones: many, emails: [] })[0]!.value as { rows: unknown[] }).rows;
    expect(rows).toHaveLength(10);
  });
});
