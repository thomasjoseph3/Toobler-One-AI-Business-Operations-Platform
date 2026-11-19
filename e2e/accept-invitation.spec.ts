import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';
import { GOOD_INVITATION_TOKEN } from './pretend-team';

// The page the emailed invitation link opens, in a real browser at phone and desktop size, against the pretend API (e2e/pretend-team.ts).

test.describe('Accept an invitation', () => {
  test('shows who invited the person and their role, asks only for a password, then points to sign in', async ({
    page,
    pretendApi,
  }) => {
    await page.goto(`/accept-invitation?token=${GOOD_INVITATION_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Join Nair Stays' })).toBeVisible();
    await expect(page.getByText('Anita Nair invited you to Nair Stays as Staff (own leads only).')).toBeVisible();
    // Name and email are fixed by the manager
    await expect(page.getByLabel('Your name')).toHaveValue('Hari Kumar');
    await expect(page.getByLabel('Your name')).toHaveJSProperty('readOnly', true);
    await expect(page.getByLabel('Your email')).toHaveValue('hari@example.com');

    await page.getByRole('button', { name: 'Join the team' }).click();
    await expect(page.getByText('Choose a password.')).toBeVisible();
    await page.getByLabel('Choose a password').fill('short');
    await page.getByRole('button', { name: 'Join the team' }).click();
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
    expect(pretendApi.team.acceptedInvitations).toEqual([]);

    await page.getByLabel('Choose a password').fill('planet-orange-bridge-77');
    await page.getByRole('button', { name: 'Join the team' }).click();
    await expect(page.getByRole('heading', { name: 'You have joined Nair Stays' })).toBeVisible();
    expect(pretendApi.team.acceptedInvitations).toEqual([{ token: GOOD_INVITATION_TOKEN, passwordLength: 23 }]);
    await expect(page.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/sign-in');
  });

  test('says in the API’s words when the password is refused, and keeps what was typed', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.team.refusal = {
      status: 400,
      code: 'WEAK_PASSWORD',
      message: 'That password is too common. Choose another.',
    };
    await page.goto(`/accept-invitation?token=${GOOD_INVITATION_TOKEN}`);
    await page.getByLabel('Choose a password').fill('password12345');
    await page.getByRole('button', { name: 'Join the team' }).click();
    await expect(page.getByRole('alert')).toContainText('That password is too common.');
    await expect(page.getByLabel('Choose a password')).toHaveValue('password12345');
  });

  test('shows one plain message for a link that cannot be used, or no link at all', async ({ page }) => {
    await page.goto('/accept-invitation?token=an-old-invitation-token-123456');
    await expect(page.getByRole('heading', { name: 'This invitation cannot be used' })).toBeVisible();
    await expect(page.getByText('Ask your manager to send a new one.')).toBeVisible();
    await page.goto('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'This invitation cannot be used' })).toBeVisible();
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto(`/accept-invitation?token=${GOOD_INVITATION_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Join Nair Stays' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
