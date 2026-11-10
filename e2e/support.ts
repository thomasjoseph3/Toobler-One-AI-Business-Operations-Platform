import { test as base, expect } from '@playwright/test';

// Every test fails if the page writes an error to the browser console or throws: the cheapest way to catch real breakage.
export const test = base.extend<{ consoleProblems: string[] }>({
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`));
      await use(problems);
      expect(problems, 'the page wrote errors to the console').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The pages of the staff app: the menu text and the address of each. */
export const PAGES = [
  { label: 'Today', path: '/', isInPhoneBar: true },
  { label: 'Leads', path: '/leads', isInPhoneBar: true },
  { label: 'Contacts', path: '/contacts', isInPhoneBar: false },
  { label: 'Companies', path: '/companies', isInPhoneBar: false },
  { label: 'Inbox', path: '/inbox', isInPhoneBar: true },
  { label: 'Tasks', path: '/tasks', isInPhoneBar: true },
  { label: 'Tickets', path: '/tickets', isInPhoneBar: false },
  { label: 'Reports', path: '/reports', isInPhoneBar: false },
  { label: 'Knowledge base', path: '/knowledge', isInPhoneBar: false },
  { label: 'Channels', path: '/channels', isInPhoneBar: false },
  { label: 'Settings', path: '/settings', isInPhoneBar: false },
] as const;
