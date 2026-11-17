import { describe, expect, it } from 'vitest';
import type { KnowledgeQuestion } from '@toobler-one/shared';
import { draftToValue, emptyListRow, formatAnswer, paiseToRupeesText, rupeesTextToPaise, startDraft } from './answer-draft';

/** A question with sensible defaults; a test changes what it needs. */
const question = (changes: Partial<KnowledgeQuestion>): KnowledgeQuestion => ({
  key: 'q',
  section: 'B',
  text: 'A question?',
  type: 'short_text',
  options: null,
  allowOther: false,
  maxChoices: null,
  yesDetail: null,
  rowFields: null,
  maxRows: null,
  neededToGoLive: false,
  handledElsewhere: null,
  elsewhereStatus: null,
  usedFor: null,
  answer: null,
  ...changes,
});

describe('rupees and paise', () => {
  it('shows whole paise as rupees and reads typed rupees as whole paise', () => {
    expect(paiseToRupeesText(250000)).toBe('2500');
    expect(paiseToRupeesText(250050)).toBe('2500.50');
    expect(paiseToRupeesText(5)).toBe('0.05');
    expect(rupeesTextToPaise('2,500')).toBe(250000);
    expect(rupeesTextToPaise('₹ 2500.5')).toBe(250050);
    expect(rupeesTextToPaise('0.05')).toBe(5);
  });

  it('refuses what is not a price, and never rounds a part of a paisa', () => {
    for (const text of ['', 'abc', '-5', '12.345', '1e3', '2500.']) expect(rupeesTextToPaise(text), text).toBeNull();
  });
});

describe('text and link questions', () => {
  it('saves trimmed text and refuses an empty answer', () => {
    const textQuestion = question({});
    expect(draftToValue(textQuestion, { kind: 'text', text: '  Nair Stays ' })).toEqual({ ok: true, value: 'Nair Stays' });
    expect(draftToValue(textQuestion, { kind: 'text', text: '   ' }).ok).toBe(false);
  });

  it('wants a full link for a link question', () => {
    const linkQuestion = question({ type: 'link' });
    expect(draftToValue(linkQuestion, { kind: 'text', text: 'nairstays.example' }).ok).toBe(false);
    expect(draftToValue(linkQuestion, { kind: 'text', text: 'https://nairstays.example' }).ok).toBe(true);
    expect(draftToValue(linkQuestion, { kind: 'text', text: 'javascript:alert(1)' }).ok).toBe(false);
  });

  it('starts from the current answer', () => {
    expect(startDraft(question({}), 'Nair Stays')).toEqual({ kind: 'text', text: 'Nair Stays' });
    expect(startDraft(question({}), null)).toEqual({ kind: 'text', text: '' });
  });
});

describe('pick questions', () => {
  const pickOne = question({ type: 'pick_one', options: ['Included', 'Plus GST', 'Other'], allowOther: true });

  it('stores the choice, and the words for Other', () => {
    expect(draftToValue(pickOne, { kind: 'pick_one', choice: 'Included', otherText: '' })).toEqual({ ok: true, value: { choice: 'Included' } });
    expect(draftToValue(pickOne, { kind: 'pick_one', choice: 'Other', otherText: ' Depends ' })).toEqual({
      ok: true,
      value: { choice: 'Other', otherText: 'Depends' },
    });
    expect(draftToValue(pickOne, { kind: 'pick_one', choice: 'Other', otherText: '' }).ok).toBe(false);
    expect(draftToValue(pickOne, { kind: 'pick_one', choice: '', otherText: '' }).ok).toBe(false);
  });

  it('keeps several choices within the most allowed', () => {
    const several = question({ type: 'pick_several', options: ['A', 'B', 'C'], maxChoices: 2 });
    expect(draftToValue(several, { kind: 'pick_several', choices: ['A', 'B'], otherText: '' })).toEqual({ ok: true, value: { choices: ['A', 'B'] } });
    expect(draftToValue(several, { kind: 'pick_several', choices: ['A', 'B', 'C'], otherText: '' }).ok).toBe(false);
    expect(draftToValue(several, { kind: 'pick_several', choices: [], otherText: '' }).ok).toBe(false);
  });

  it('reads the stored shapes back into a draft', () => {
    expect(startDraft(pickOne, { choice: 'Plus GST' })).toEqual({ kind: 'pick_one', choice: 'Plus GST', otherText: '' });
    expect(startDraft(question({ type: 'pick_several' }), { choices: ['A'], otherText: 'x' })).toEqual({
      kind: 'pick_several',
      choices: ['A'],
      otherText: 'x',
    });
  });
});

describe('yes or no questions', () => {
  const withLink = question({ type: 'yes_no', yesDetail: { kind: 'link', required: true, label: 'Website address' } });

  it('needs the extra words for Yes when the question says so, and drops them for No', () => {
    expect(draftToValue(withLink, { kind: 'yes_no', yes: true, detail: '' }).ok).toBe(false);
    expect(draftToValue(withLink, { kind: 'yes_no', yes: true, detail: 'not a link' }).ok).toBe(false);
    expect(draftToValue(withLink, { kind: 'yes_no', yes: true, detail: 'https://a.example' })).toEqual({
      ok: true,
      value: { yes: true, detail: 'https://a.example' },
    });
    expect(draftToValue(withLink, { kind: 'yes_no', yes: false, detail: 'ignored' })).toEqual({ ok: true, value: { yes: false } });
    expect(draftToValue(withLink, { kind: 'yes_no', yes: null, detail: '' }).ok).toBe(false);
  });
});

describe('opening hours', () => {
  const hours = question({ type: 'weekly_hours' });

  it('writes the open days only, and refuses a closing time that is not after the opening time', () => {
    const draft = startDraft(hours, null);
    if (draft.kind !== 'weekly_hours') throw new Error('expected hours');
    draft.days.mon = { isOpen: true, from: '09:00', to: '18:30' };
    expect(draftToValue(hours, draft)).toEqual({ ok: true, value: { days: { mon: { open: '09:00', close: '18:30' } } } });
    draft.days.tue = { isOpen: true, from: '10:00', to: '10:00' };
    expect(draftToValue(hours, draft).ok).toBe(false);
  });

  it('needs at least one open day, or open all day', () => {
    const draft = startDraft(hours, null);
    if (draft.kind !== 'weekly_hours') throw new Error('expected hours');
    expect(draftToValue(hours, draft).ok).toBe(false);
    expect(draftToValue(hours, { ...draft, isOpenAllDay: true })).toEqual({ ok: true, value: { allDay: true } });
  });

  it('reads stored hours back and shows them day by day', () => {
    const stored = { days: { mon: { open: '09:00', close: '18:00' }, sat: { open: '10:00', close: '14:00' } } };
    const draft = startDraft(hours, stored);
    expect(draft).toMatchObject({ kind: 'weekly_hours', isOpenAllDay: false });
    expect(formatAnswer(hours, stored)).toEqual([
      'Mon: 09:00 to 18:00',
      'Tue: closed',
      'Wed: closed',
      'Thu: closed',
      'Fri: closed',
      'Sat: 10:00 to 14:00',
      'Sun: closed',
    ]);
    expect(formatAnswer(hours, { allDay: true })).toEqual(['Open all day, every day']);
  });
});

describe('list questions', () => {
  const contacts = question({
    type: 'list',
    maxRows: 3,
    rowFields: [
      { key: 'kind', label: 'Kind', kind: 'pick', options: ['Phone', 'Email'], required: true },
      { key: 'value', label: 'Number or address', kind: 'text', options: null, required: true },
    ],
  });

  it('turns rows into the stored shape, skipping empty rows and checking required columns', () => {
    expect(
      draftToValue(contacts, {
        kind: 'list',
        rows: [{ kind: 'Phone', value: ' +91 98470 12345 ' }, { kind: 'Phone', value: '' }],
      }).ok,
    ).toBe(false); // a half-filled row: the value is needed
    expect(draftToValue(contacts, { kind: 'list', rows: [{ kind: 'Phone', value: '+91 98470 12345' }] })).toEqual({
      ok: true,
      value: { rows: [{ kind: 'Phone', value: '+91 98470 12345' }] },
    });
    expect(draftToValue(contacts, { kind: 'list', rows: [] }).ok).toBe(false);
  });

  it('keeps within the most rows', () => {
    const rows = Array.from({ length: 4 }, (_, number) => ({ kind: 'Phone', value: `+91 90000 0000${number}` }));
    expect(draftToValue(contacts, { kind: 'list', rows }).ok).toBe(false);
  });

  it('starts a new row on the first option of a pick column, and shows rows on one line each', () => {
    expect(emptyListRow(contacts.rowFields!)).toEqual({ kind: 'Phone', value: '' });
    expect(formatAnswer(contacts, { rows: [{ kind: 'Phone', value: '+91 98470 12345' }] })).toEqual(['Phone · +91 98470 12345']);
  });

  it('writes a price column as whole paise and shows it as rupees', () => {
    const offerings = question({
      type: 'list',
      rowFields: [
        { key: 'name', label: 'Name', kind: 'text', options: null, required: true },
        { key: 'from', label: 'From price', kind: 'price', options: null, required: false },
      ],
    });
    expect(draftToValue(offerings, { kind: 'list', rows: [{ name: 'Room', from: '2,500' }] })).toEqual({
      ok: true,
      value: { rows: [{ name: 'Room', from: 250000 }] },
    });
    expect(draftToValue(offerings, { kind: 'list', rows: [{ name: 'Room', from: 'cheap' }] }).ok).toBe(false);
    expect(formatAnswer(offerings, { rows: [{ name: 'Room', from: 250000 }] })).toEqual(['Room · ₹2500']);
    expect(startDraft(offerings, { rows: [{ name: 'Room', from: 250000 }] })).toEqual({ kind: 'list', rows: [{ name: 'Room', from: '2500' }] });
  });
});

describe('questions that cannot be answered here', () => {
  it('has no editor for an upload or a question answered elsewhere', () => {
    expect(startDraft(question({ type: 'file' }), null)).toEqual({ kind: 'not_answerable' });
    expect(startDraft(question({ handledElsewhere: 'offerings' }), null)).toEqual({ kind: 'not_answerable' });
    expect(draftToValue(question({}), { kind: 'not_answerable' }).ok).toBe(false);
  });
});
