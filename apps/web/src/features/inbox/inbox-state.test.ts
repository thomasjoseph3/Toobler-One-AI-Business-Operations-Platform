import { describe, expect, it } from 'vitest';
import { buildInboxApiPath, describeSender, readInboxView, writeInboxView } from './inbox-state';

describe('readInboxView and writeInboxView', () => {
  it('reads the filters from the address and ignores what it does not understand', () => {
    expect(readInboxView(new URLSearchParams('channel=whatsapp&status=done&held=me&needs_person=true&page=3'))).toEqual(
      {
        channel: 'whatsapp',
        status: 'done',
        heldByMe: true,
        needsPerson: true,
        page: 3,
      },
    );
    expect(readInboxView(new URLSearchParams('channel=fax&status=weird&page=-4'))).toEqual({
      channel: null,
      status: 'open',
      heldByMe: false,
      needsPerson: false,
      page: 1,
    });
  });
  it('writes only what differs from the plain open list', () => {
    expect(writeInboxView(readInboxView(new URLSearchParams())).toString()).toBe('');
    expect(
      writeInboxView({ channel: 'email', status: 'done', heldByMe: false, needsPerson: true, page: 2 }).toString(),
    ).toBe('channel=email&status=done&needs_person=true&page=2');
  });
});

describe('buildInboxApiPath', () => {
  it('asks the API for the view, with a status always', () => {
    expect(buildInboxApiPath(readInboxView(new URLSearchParams()), 25)).toBe(
      '/conversations?status=open&page=1&limit=25',
    );
    expect(buildInboxApiPath(readInboxView(new URLSearchParams('held=me&channel=webchat')), 10)).toBe(
      '/conversations?status=open&page=1&limit=10&channel=webchat&held=me',
    );
  });
});

describe('describeSender', () => {
  it('uses the name, then the phone, then the email, then "Unknown visitor"', () => {
    expect(describeSender({ contact: { id: '1', name: 'Priya' }, fromPhone: '+971', fromEmail: null })).toBe('Priya');
    expect(describeSender({ contact: null, fromPhone: '+971501234567', fromEmail: null })).toBe('+971501234567');
    expect(describeSender({ contact: null, fromPhone: null, fromEmail: 'a@b.co' })).toBe('a@b.co');
    expect(describeSender({ contact: null, fromPhone: null, fromEmail: null })).toBe('Unknown visitor');
  });
});
