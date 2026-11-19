import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Channels → Website chat in a real browser, at phone and desktop size, against a pretend API (e2e/pretend-webchat.ts).

const SNIPPET =
  '<script src="https://api.example/widget/loader.js" data-key="wk_abcdefghijklmnopqrstuvwxyz012345" async></script>';

test.describe('Website chat: putting it on your website', () => {
  test('shows the line to paste, the listed websites and the state of the installation', async ({ page }) => {
    await page.goto('/channels');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Channels');
    await expect(page.getByLabel('The line to paste')).toHaveValue(SNIPPET);
    await expect(page.getByText('https://nairstays.example', { exact: true })).toBeVisible();
    await expect(page.getByText(/We have not seen the chat working yet/)).toBeVisible();
    await expect(page.getByText('Email: the AI reads and answers your enquiry mailbox.')).toBeVisible(); // the other channels are listed as coming
  });

  test('copies the line', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/channels');
    await page.getByRole('button', { name: 'Copy the line' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied.' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SNIPPET);
  });

  test('adds a website, tidied to its address, and saves at once', async ({ page, pretendApi }) => {
    await page.goto('/channels');
    await page.getByLabel('Website address').fill('www.nairstays.in/rooms');
    await page.getByRole('button', { name: 'Add a website' }).click();
    await expect(page.getByText('https://www.nairstays.in', { exact: true })).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([
      { allowedWebsites: ['https://nairstays.example', 'https://www.nairstays.in'] },
    ]);
    await expect(page.getByLabel('Website address')).toHaveValue('');
  });

  test('refuses something that is not a website, and one already listed, without asking the server', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/channels');
    await page.getByLabel('Website address').fill('not a website');
    await page.getByRole('button', { name: 'Add a website' }).click();
    await expect(page.getByText('Use the address of your website, like https://www.nairstays.in.')).toBeVisible();
    await page.getByLabel('Website address').fill('nairstays.example');
    await page.getByRole('button', { name: 'Add a website' }).click();
    await expect(page.getByText('That website is already on the list.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([]);
  });

  test('asks "Are you sure?" naming the website before removing it', async ({ page, pretendApi }) => {
    await page.goto('/channels');
    await page.getByRole('button', { name: 'Remove https://nairstays.example' }).click();
    await expect(page.getByRole('dialog').getByText('Remove https://nairstays.example?')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.webchat.patches).toEqual([]);
    await page.getByRole('button', { name: 'Remove https://nairstays.example' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('No website listed yet, so the chat shows nowhere.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([{ allowedWebsites: [] }]);
    await expect(
      page.getByText('Add your website first, then open your website in another tab and check again.'),
    ).toBeVisible();
  });

  test('"Check again" shows where and when the chat was last seen working, in the business’s time zone', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/channels');
    await expect(page.getByText(/We have not seen the chat working yet/)).toBeVisible();
    pretendApi.webchat.settings['lastSeen'] = { website: 'https://nairstays.example', at: '2026-11-17T10:00:00.000Z' };
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText('Seen working on https://nairstays.example on 17 Nov 2026, 15:30.')).toBeVisible();
  });
});

test.describe('Website chat: how it looks and its buttons', () => {
  test('shows the settings with a preview that follows what is typed', async ({ page }) => {
    await page.goto('/channels');
    const preview = page.getByRole('figure', { name: 'How the chat bubble will look' });
    await expect(preview.getByText('Welcome to Nair Stays! Ask me anything.')).toBeVisible();
    await page.getByLabel('Greeting').fill('Hello from the team');
    await expect(preview.getByText('Hello from the team')).toBeVisible();
    await page.getByLabel('Colour code').fill('#E11D48');
    await expect(preview.getByText('Hello from the team')).toHaveCSS('background-color', 'rgb(225, 29, 72)');
  });

  test('saves only what changed', async ({ page, pretendApi }) => {
    await page.goto('/channels');
    await page.getByLabel('Greeting').fill('Hello from the team');
    await page.getByLabel('Where the bubble sits').selectOption('bottom_left');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([{ greeting: 'Hello from the team', position: 'bottom_left' }]);
  });

  test('checks the form on the device first', async ({ page, pretendApi }) => {
    await page.goto('/channels');
    await page.getByLabel('Colour code').fill('blue');
    await page.getByLabel('Greeting').fill('  ');
    await page.getByLabel('Phone number for the Call button').fill('call me');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Use a colour like #1F6FEB.')).toBeVisible();
    await expect(page.getByText('Write a greeting.')).toBeVisible();
    await expect(page.getByText('Use a phone number like +91 98470 12345.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([]);
  });

  test('a button needs its number: WhatsApp is hidden until one is added, and then shows in the preview', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/channels');
    const preview = page.getByRole('figure', { name: 'How the chat bubble will look' });
    await expect(preview.getByText('WhatsApp')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Show the WhatsApp button' }).check();
    await expect(page.getByText('Hidden until you add a number')).toBeVisible();
    await expect(preview.getByText('WhatsApp')).toHaveCount(0);
    await page.getByLabel('WhatsApp number').fill('+91 98470 99999');
    await expect(preview.getByText('WhatsApp')).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([{ whatsappNumber: '+91 98470 99999' }]);
  });

  test('reorders the buttons and sends the new order', async ({ page, pretendApi }) => {
    await page.goto('/channels');
    await expect(page.getByRole('button', { name: 'Move Chat up' })).toBeDisabled();
    await page.getByRole('button', { name: 'Move Call up' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([{ buttonOrder: ['call', 'chat', 'whatsapp'] }]);
  });

  test('clearing a number sends null', async ({ page, pretendApi }) => {
    await page.goto('/channels');
    await page.getByLabel('Phone number for the Call button').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(pretendApi.webchat.patches).toEqual([{ phoneNumber: null }]);
  });

  test('shows the API’s own words when it refuses, and keeps what was typed', async ({ page, pretendApi }) => {
    pretendApi.webchat.refusal = {
      status: 400,
      code: 'INVALID_PHONE',
      message: 'That phone number does not look right.',
    };
    await page.goto('/channels');
    await page.getByLabel('Phone number for the Call button').fill('+91 12345 67890');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('That phone number does not look right.')).toBeVisible();
    await expect(page.getByLabel('Phone number for the Call button')).toHaveValue('+91 12345 67890');
  });
});

test.describe('Website chat: off, staff and problems', () => {
  test('says so when the website chat is switched off for the business', async ({ page, pretendApi }) => {
    pretendApi.webchat.isOff = true;
    await page.goto('/channels');
    await expect(page.getByText('Website chat is switched off')).toBeVisible();
    await expect(page.getByLabel('The line to paste')).toHaveCount(0);
  });

  test('staff can see how it is set up and change nothing', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/channels');
    await expect(page.getByText(/Only managers can change these settings/)).toBeVisible();
    await expect(page.getByLabel('The line to paste')).toHaveValue(SNIPPET);
    await expect(page.getByLabel('Greeting')).toBeDisabled();
    for (const name of [/Save changes/, /Add a website/, /^Remove/])
      await expect(page.getByRole('button', { name })).toHaveCount(0);
  });

  test('shows an error with a retry when it cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.webchat.fails = true;
    await page.goto('/channels');
    await expect(page.getByText('We could not load your channels')).toBeVisible();
    pretendApi.webchat.fails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByLabel('The line to paste')).toBeVisible();
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/channels');
    await expect(page.getByLabel('The line to paste')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
