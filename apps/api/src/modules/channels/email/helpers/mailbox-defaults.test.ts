import { describe, expect, it } from 'vitest';
import { guessMailServers } from './mailbox-defaults';

describe('guessMailServers', () => {
  it('knows Gmail and Outlook', () => {
    expect(guessMailServers('a@gmail.com')).toEqual({ imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' });
    expect(guessMailServers('a@hotmail.com')).toEqual({
      imapHost: 'outlook.office365.com',
      smtpHost: 'smtp.office365.com',
    });
  });
  it('guesses imap.<domain> for any other address', () => {
    expect(guessMailServers('enquiries@nairstays.example')).toEqual({
      imapHost: 'imap.nairstays.example',
      smtpHost: 'smtp.nairstays.example',
    });
  });
});
