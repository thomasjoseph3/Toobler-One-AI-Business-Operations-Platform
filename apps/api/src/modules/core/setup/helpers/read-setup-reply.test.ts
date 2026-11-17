import { describe, expect, it } from 'vitest';
import type { KnowledgeQuestion } from '@toobler-one/shared';
import { readAiReply, readReplyWithoutAi, type SetupReplyOutput } from './read-setup-reply';

function question(overrides: Partial<KnowledgeQuestion>): KnowledgeQuestion {
  return {
    key: 'q',
    section: 'A',
    text: 'A question',
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
    ...overrides,
  };
}

const pickOne = question({ type: 'pick_one', options: ['Plus GST', 'Including GST', 'No GST'] });
const pickSeveral = question({ type: 'pick_several', options: ['Cash', 'UPI', 'Card'] });
const output = (changes: Partial<SetupReplyOutput>): SetupReplyOutput => ({ understood: true, choice: null, choices: [], otherText: null, yes: null, detail: null, ...changes });

describe('readReplyWithoutAi', () => {
  it('takes plain text and links as typed (trimmed)', () => {
    expect(readReplyWithoutAi(question({ type: 'short_text' }), '  Nair Stays ')).toBe('Nair Stays');
    expect(readReplyWithoutAi(question({ type: 'link' }), 'https://x.com')).toBe('https://x.com');
    expect(readReplyWithoutAi(question({ type: 'long_text' }), '   ')).toBeNull();
  });

  it('reads yes and no words, ignoring capitals and a full stop, and leaves anything else for the AI', () => {
    const yesNo = question({ type: 'yes_no' });
    expect(readReplyWithoutAi(yesNo, ' Yes. ')).toEqual({ yes: true });
    expect(readReplyWithoutAi(yesNo, 'NOPE')).toEqual({ yes: false });
    expect(readReplyWithoutAi(yesNo, 'yes, https://x.com')).toBeNull();
    expect(readReplyWithoutAi(yesNo, 'maybe')).toBeNull();
  });

  it('reads an option by its words or its number', () => {
    expect(readReplyWithoutAi(pickOne, 'including gst')).toEqual({ choice: 'Including GST' });
    expect(readReplyWithoutAi(pickOne, '3')).toEqual({ choice: 'No GST' });
    expect(readReplyWithoutAi(pickOne, '9')).toBeNull();
    expect(readReplyWithoutAi(pickOne, 'whatever suits')).toBeNull();
  });

  it('reads several options separated by commas, "and" or new lines, and refuses the whole reply if one piece is not an option', () => {
    expect(readReplyWithoutAi(pickSeveral, 'cash, upi')).toEqual({ choices: ['Cash', 'UPI'] });
    expect(readReplyWithoutAi(pickSeveral, '1 and 3')).toEqual({ choices: ['Cash', 'Card'] });
    expect(readReplyWithoutAi(pickSeveral, 'cash, bitcoin')).toBeNull();
  });

  it('cannot read the types the chat does not ask', () => {
    expect(readReplyWithoutAi(question({ type: 'weekly_hours' }), 'Mon to Fri 9 to 5')).toBeNull();
  });
});

describe('readAiReply', () => {
  it('gives null when the AI did not understand the reply', () => {
    expect(readAiReply(pickOne, output({ understood: false, choice: 'Plus GST' }))).toBeNull();
  });

  it('builds a yes or no, with the detail only for a yes', () => {
    const yesNo = question({ type: 'yes_no' });
    expect(readAiReply(yesNo, output({ yes: true, detail: 'https://x.com' }))).toEqual({ yes: true, detail: 'https://x.com' });
    expect(readAiReply(yesNo, output({ yes: false, detail: 'ignored' }))).toEqual({ yes: false });
    expect(readAiReply(yesNo, output({ yes: null }))).toBeNull();
  });

  it('builds a pick one and a pick several, with the owner’s own words for "Other"', () => {
    expect(readAiReply(pickOne, output({ choice: 'Plus GST' }))).toEqual({ choice: 'Plus GST' });
    expect(readAiReply(pickOne, output({ choice: 'Other', otherText: 'Depends' }))).toEqual({ choice: 'Other', otherText: 'Depends' });
    expect(readAiReply(pickSeveral, output({ choices: ['Cash', 'UPI'] }))).toEqual({ choices: ['Cash', 'UPI'] });
    expect(readAiReply(pickSeveral, output({ choices: [] }))).toBeNull();
  });
});
