import AxeBuilder from '@axe-core/playwright';
import { expect, test, type PretendApi } from './support';

// The Setup guide and the Today checklist card in a real browser, at phone and desktop size, against a pretend API (e2e/pretend-setup.ts).

/** Makes the pretend business ready to go live: every needed answer confirmed, an offering on, the callback step done, the agent tried. */
function makeReady(pretendApi: PretendApi) {
  for (const question of pretendApi.knowledge.questions) {
    if (question['neededToGoLive'] !== true) continue;
    if (question['handledElsewhere'] !== null) question['elsewhereStatus'] = 'done';
    else
      question['answer'] = {
        value: question['answer'] ? (question['answer'] as { value: unknown }).value : 'x',
        source: 'typed',
        status: 'confirmed',
        confirmedAt: '2026-11-17T10:00:00.000Z',
        updatedAt: '2026-11-17T10:00:00.000Z',
      };
  }
  pretendApi.setup.marked['promises'] = 'done';
  pretendApi.setup.triedTheAgent = true;
}

test.describe('Setup guide', () => {
  test('shows the progress, the two parts and every step with its state', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Setup guide');
    await expect(page.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('Not live yet')).toBeVisible();
    await expect(page.getByText('Next: Read your website')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Part 1: Teach the AI about your business' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Part 2: Get ready to answer customers' })).toBeVisible();
    for (const title of [
      'Read your website',
      'About your business',
      'What you sell',
      'How the AI handles situations',
      'Your goals',
      'How fast you call back',
      'Your leads board',
      'Invite your team',
      'Connect your channels',
      'Try the AI agent',
    ]) {
      await expect(page.getByRole('heading', { name: title, level: 3 })).toBeVisible();
    }
    await expect(page.getByText('To do').first()).toBeVisible();
  });

  test('skips a step and reopens it, sending only what changed', async ({ page, pretendApi }) => {
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Skip for now: Invite your team' }).click();
    await expect.poll(() => pretendApi.setup.patches).toEqual([{ step: 'team', status: 'skipped' }]);
    const row = page.getByRole('listitem').filter({ hasText: 'Invite your team' });
    await expect(row.getByText('Skipped')).toBeVisible();
    await row.getByRole('button', { name: 'Reopen: Invite your team' }).click();
    await expect(row.getByText('To do')).toBeVisible();
    expect(pretendApi.setup.patches[1]).toEqual({ step: 'team', status: 'todo' });
  });

  test('marks a step done; the steps going live needs cannot be skipped', async ({ page, pretendApi }) => {
    await page.goto('/setup');
    await expect(page.getByRole('button', { name: 'Skip for now: How fast you call back' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Skip for now: About your business' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark done: How fast you call back' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'How fast you call back' }).getByText('Done'),
    ).toBeVisible();
    expect(pretendApi.setup.patches).toEqual([{ step: 'promises', status: 'done' }]);
    await expect(page.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '10');
  });

  test('steps the system checks have no Done button and point to where to finish them', async ({ page }) => {
    await page.goto('/setup');
    const about = page.getByRole('listitem').filter({ hasText: 'About your business' });
    await expect(about.getByRole('button')).toHaveCount(0);
    await expect(about.getByRole('link', { name: /Answer in the business profile/ })).toHaveAttribute(
      'href',
      '/knowledge',
    );
    await expect(page.getByRole('link', { name: /Add what you sell/ })).toHaveAttribute(
      'href',
      '/knowledge/what-you-sell',
    );
  });

  test('uses the industry’s words for the leads board and says what changed', async ({ page, pretendApi }) => {
    await page.goto('/setup');
    await page.getByRole('button', { name: "Use my industry's words: Your leads board" }).click();
    await expect(page.getByText("Done. 3 stages now use your industry's words.")).toBeVisible();
    expect(pretendApi.setup.presetCalls).toBe(1);
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Your leads board' }).getByText('Done', { exact: true }).first(),
    ).toBeVisible();
  });

  test('says when nothing needed changing, and which stages were left alone', async ({ page, pretendApi }) => {
    pretendApi.setup.presetResult = { industry: 'hotel_resort', renamedStages: [], leftAloneStages: ['Fresh leads'] };
    await page.goto('/setup');
    await page.getByRole('button', { name: "Use my industry's words: Your leads board" }).click();
    await expect(page.getByText(/Nothing to change/)).toBeVisible();
    await expect(page.getByText('Left as you had them: Fresh leads.')).toBeVisible();
  });
});

test.describe('Go live', () => {
  test('lists what is still needed in plain words and keeps the button off', async ({ page }) => {
    await page.goto('/setup');
    const card = page.getByRole('heading', { name: 'Go live', level: 2 }).locator('..');
    await expect(card.getByText('Still to do before you can go live:')).toBeVisible();
    for (const words of [
      'What do customers call your business?',
      'What does your business do, in one or two lines?',
      'What do you sell?',
      'How fast you call back',
      'Try the AI agent',
    ]) {
      await expect(
        card.getByRole('listitem').filter({ hasText: new RegExp(`^${words.replace('?', '\\?')}$`) }),
      ).toBeVisible();
    }
    await expect(card.getByRole('button', { name: 'Go live' })).toBeDisabled();
  });

  test('goes live when everything is ready, and then shows it is live', async ({ page, pretendApi }) => {
    makeReady(pretendApi);
    await page.goto('/setup');
    await expect(page.getByText('Everything needed is done. You can go live now.')).toBeVisible();
    await page.getByRole('button', { name: 'Go live' }).click();
    await expect(page.getByText('You are live. Your website chat now answers customers.')).toBeVisible();
    expect(pretendApi.setup.goLiveCalls).toBe(1);
    await expect(page.getByText('Live since 17 Nov 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go live' })).toHaveCount(0);
  });

  test('shows what is left when the server says it is not ready after all', async ({ page, pretendApi }) => {
    makeReady(pretendApi);
    await page.goto('/setup');
    await expect(page.getByRole('button', { name: 'Go live' })).toBeEnabled();
    pretendApi.setup.triedTheAgent = false; // something changed since the page loaded
    await page.getByRole('button', { name: 'Go live' }).click();
    await expect(page.getByText('Not everything is finished yet. The list above says what is left.')).toBeVisible();
    await expect(page.getByText('Still to do before you can go live:')).toBeVisible();
  });
});

test.describe('Staff, problems and the Today card', () => {
  test('staff are told the setup is for managers', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/setup');
    await expect(page.getByText(/Only managers can set up the business/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark done|Skip for now|Go live/ })).toHaveCount(0);
  });

  test('shows an error with a retry when the setup cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.setup.setupFails = true;
    await page.goto('/setup');
    await expect(page.getByText('We could not load your setup')).toBeVisible();
    pretendApi.setup.setupFails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Not live yet')).toBeVisible();
  });

  test('the Today page offers the setup guide until the business is live', async ({ page, pretendApi }) => {
    await page.goto('/');
    await expect(page.getByText('Finish setting up')).toBeVisible();
    await expect(page.getByText('0% done. 6 things still stop you going live.')).toBeVisible();
    await page.getByRole('link', { name: 'Open the setup guide' }).click();
    await expect(page).toHaveURL(/\/setup$/);

    makeReady(pretendApi);
    pretendApi.setup.liveAt = '2026-11-17T10:30:00.000Z';
    await page.goto('/');
    await expect(page.getByText('Good', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Finish setting up')).toHaveCount(0);
  });

  test('the Today page shows no setup card to staff, and does not ask for the setup', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/');
    await expect(page.getByText('Finish setting up')).toHaveCount(0);
    expect(pretendApi.calls).not.toContain('GET /setup');
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.getByText('Not live yet')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
