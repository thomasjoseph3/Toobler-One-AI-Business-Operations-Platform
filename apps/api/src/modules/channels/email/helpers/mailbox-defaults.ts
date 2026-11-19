// Fills in the mail server names a manager has not typed, from the mailbox address. Pure: no network.

/** The IMAP and SMTP servers to try for an address (the manager can always type their own). */
export function guessMailServers(address: string): { imapHost: string; smtpHost: string } {
  const domain = (address.split('@')[1] ?? '').toLowerCase();
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' };
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'office365.com'].includes(domain)) {
    return { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' };
  }
  return { imapHost: `imap.${domain}`, smtpHost: `smtp.${domain}` };
}
