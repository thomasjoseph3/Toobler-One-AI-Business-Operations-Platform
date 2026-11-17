import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Settings → AI and Settings → Modules in a real browser, at phone and desktop size, against a pretend API (e2e/pretend-settings.ts).

const GEMINI_KEY_ID = '0191f0a0-0000-7000-8000-0000000000a1';

test.describe('Settings: AI keys and key mode', () => {
  test('shows the key mode, what the platform allows and this month’s use', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'AI' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('radio', { name: /My own keys first, then the platform's/ })).toBeChecked();
    await expect(page.getByText('Allowed 1000 AI calls a month. Used 250 this month, 750 left.')).toBeVisible();
    await expect(page.getByText('Allowed until 31 Dec 2026.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: "Share of this month's allowance used" })).toHaveAttribute('aria-valuenow', '25');
    const usage = page.getByRole('heading', { name: 'AI use this month' }).locator('..');
    await expect(usage.getByText('250', { exact: true })).toBeVisible();
  });

  test('changes the key mode and warns when the choice would leave nothing to answer with', async ({ page, pretendApi }) => {
    pretendApi.settings.platformAccess.enabled = false;
    await page.goto('/settings');
    await expect(page.getByText('Not switched on for your business')).toBeVisible();
    await page.getByRole('radio', { name: /Only the platform's keys/ }).check();
    await expect.poll(() => pretendApi.settings.keyModeChanges).toEqual(['platform']);
    await expect(page.getByText(/The platform's keys are not switched on for your business, so the AI cannot answer in this mode/)).toBeVisible();
    await expect(page.getByText('Saved.')).toBeVisible();
  });

  test('puts the mode back and shows why when the change is refused', async ({ page, pretendApi }) => {
    pretendApi.settings.refusal = { status: 400, code: 'INVALID_MODE', message: 'That mode is not allowed for your business.' };
    await page.goto('/settings');
    // click, not check: the page puts the choice back at once when it is refused, which is what this test is for
    await page.getByRole('radio', { name: /Only my own keys/ }).click();
    await expect(page.getByText('That mode is not allowed for your business.')).toBeVisible();
    await expect(page.getByRole('radio', { name: /My own keys first/ })).toBeChecked();
  });

  test('lists the keys by company, showing only the last four characters and how each is doing', async ({ page }) => {
    await page.goto('/settings');
    const gemini = page.getByRole('region', { name: 'Google Gemini' });
    await expect(gemini.getByText('Main Gemini key')).toBeVisible();
    await expect(gemini.getByText('••••3f9a')).toBeVisible();
    await expect(gemini.getByText('Working')).toBeVisible();
    await expect(gemini.getByText('Answered a real request.')).toBeVisible();
    const openai = page.getByRole('region', { name: 'OpenAI' });
    await expect(openai.getByText('Not tested')).toBeVisible();
  });

  test('tests a key and says in words what was found', async ({ page, pretendApi }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Test the key Main Gemini key' }).click();
    await expect(page.getByText('This key works (gemini-2.5-flash, 413 ms).')).toBeVisible();
    expect(pretendApi.settings.testedKeyIds).toEqual([GEMINI_KEY_ID]);
    pretendApi.settings.nextTestOutcome = 'rejected';
    await page.getByRole('button', { name: 'Test the key Main Gemini key' }).click();
    await expect(page.getByText(/The AI company rejected this key/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Google Gemini' }).getByText('Rejected', { exact: true })).toBeVisible();
  });

  test('adds a key: checks it first, sends it once, and never shows it again', async ({ page, pretendApi }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add a key' }).click();
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('Give the key a name you will recognise, like Main Gemini key.')).toBeVisible();
    await expect(page.getByText('Paste the key from your AI company.')).toBeVisible();
    expect(pretendApi.settings.addedKeys).toEqual([]);
    await page.getByLabel('AI company').selectOption('anthropic');
    await page.getByLabel('A name for this key').fill('Claude key');
    await page.getByLabel('The key', { exact: true }).fill('sk-ant-example-key-1234567890');
    // The key is a password field: it is not readable on screen
    expect(await page.getByLabel('The key', { exact: true }).getAttribute('type')).toBe('password');
    await page.getByRole('button', { name: 'Save key' }).click();
    const claude = page.getByRole('region', { name: 'Anthropic (Claude)' });
    await expect(claude.getByText('Claude key')).toBeVisible();
    await expect(claude.getByText('••••7890')).toBeVisible();
    expect(pretendApi.settings.addedKeys).toEqual([{ provider: 'anthropic', label: 'Claude key', keyLength: 29 }]);
    await expect(page.locator('body')).not.toContainText('sk-ant-example-key');
  });

  test('refuses a key with spaces without asking the server', async ({ page, pretendApi }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add a key' }).click();
    await page.getByLabel('A name for this key').fill('Odd key');
    await page.getByLabel('The key', { exact: true }).fill('this has spaces in it and is long');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText(/A key is one word with no spaces/)).toBeVisible();
    expect(pretendApi.settings.addedKeys).toEqual([]);
  });

  test('shows the API’s own words when it refuses a key, keeping what was typed', async ({ page, pretendApi }) => {
    pretendApi.settings.refusal = { status: 409, code: 'AI_KEY_EXISTS', message: 'You have already saved that key.' };
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Add a key' }).click();
    await page.getByLabel('A name for this key').fill('Duplicate');
    await page.getByLabel('The key', { exact: true }).fill('AIzaSyExampleKeyExample1234567890');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('You have already saved that key.')).toBeVisible();
    await expect(page.getByLabel('A name for this key')).toHaveValue('Duplicate');
  });

  test('asks "Are you sure?" naming the key before deleting it', async ({ page, pretendApi }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete the key Spare OpenAI key' }).click();
    await expect(page.getByRole('dialog').getByText('Delete the key Spare OpenAI key?')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.settings.deletedKeyIds).toEqual([]);
    await page.getByRole('button', { name: 'Delete the key Spare OpenAI key' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete key' }).click();
    await expect(page.getByText('Spare OpenAI key')).toHaveCount(0);
    expect(pretendApi.settings.deletedKeyIds).toEqual(['0191f0a0-0000-7000-8000-0000000000a2']);
  });

  test('has an empty state when there are no keys of your own', async ({ page, pretendApi }) => {
    pretendApi.settings.keys = [];
    await page.goto('/settings');
    await expect(page.getByText('No keys of your own')).toBeVisible();
  });

  test('is for managers: staff are told so and the AI routes are never asked', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/settings');
    await expect(page.getByText('Only managers can change these settings.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a key' })).toHaveCount(0);
    expect(pretendApi.calls.some((call) => call.includes('/ai/'))).toBe(false);
  });

  test('shows an error with a retry when it cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.settings.aiFails = true;
    await page.goto('/settings');
    await expect(page.getByText('We could not load your settings')).toBeVisible();
    pretendApi.settings.aiFails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Main Gemini key')).toBeVisible();
  });
});

test.describe('Settings: modules', () => {
  test('lists every module by kind with its state, what it needs, and the right button', async ({ page }) => {
    await page.goto('/settings/modules');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Modules' })).toHaveAttribute('aria-current', 'page');
    for (const heading of ['Engines', 'Channels', 'Features']) await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    const chat = page.getByRole('listitem').filter({ hasText: 'Website chat' });
    await expect(chat.getByText('On', { exact: true })).toBeVisible();
    await expect(chat.getByText('Needs: Lead engine')).toBeVisible();
    await expect(chat.getByRole('button', { name: 'Switch off Website chat' })).toBeVisible();
    const whatsapp = page.getByRole('listitem').filter({ hasText: 'WhatsApp' });
    await expect(whatsapp.getByText('Not in your plan')).toBeVisible();
    await expect(whatsapp.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: 'Follow-ups' }).getByRole('button', { name: 'Switch on Follow-ups' })).toBeVisible();
  });

  test('switches a module on at once, and off only after a question that says the data is kept', async ({ page, pretendApi }) => {
    await page.goto('/settings/modules');
    await page.getByRole('button', { name: 'Switch on Follow-ups' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Follow-ups' }).getByText('On', { exact: true })).toBeVisible();
    expect(pretendApi.settings.moduleChanges).toEqual([{ id: 'feature.followups', enabled: true }]);

    await page.getByRole('button', { name: 'Switch off Website chat' }).click();
    await expect(page.getByRole('dialog').getByText('Switch off Website chat?')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Its data is kept/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.settings.moduleChanges).toHaveLength(1);
    await page.getByRole('button', { name: 'Switch off Website chat' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Switch off', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Website chat' }).getByText('Switched off')).toBeVisible();
    expect(pretendApi.settings.moduleChanges[1]).toEqual({ id: 'channel.webchat', enabled: false });
  });

  test('shows the API’s own words when it refuses a switch', async ({ page, pretendApi }) => {
    pretendApi.settings.refusal = { status: 409, code: 'MODULE_NEEDED', message: 'Another module needs this one switched on.' };
    await page.goto('/settings/modules');
    await page.getByRole('button', { name: 'Switch on Follow-ups' }).click();
    await expect(page.getByText('Another module needs this one switched on.')).toBeVisible();
  });

  test('staff can read the list and change nothing', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/settings/modules');
    await expect(page.getByText('Only managers can change these settings.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Website chat', level: 3 })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Switch/ })).toHaveCount(0);
  });

  test('shows an error with a retry when it cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.settings.modulesFail = true;
    await page.goto('/settings/modules');
    await expect(page.getByText('We could not load your settings')).toBeVisible();
    pretendApi.settings.modulesFail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Website chat', level: 3 })).toBeVisible();
  });

  test('has no accessibility problems on either page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Main Gemini key')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
    await page.goto('/settings/modules');
    await expect(page.getByRole('heading', { name: 'Website chat', level: 3 })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
