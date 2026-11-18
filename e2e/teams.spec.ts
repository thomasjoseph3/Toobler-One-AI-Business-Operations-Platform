import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Settings → Teams in a real browser, at phone and desktop size, against the pretend API (e2e/pretend-team.ts).

test.describe('Settings: Teams', () => {
  test('lists the teams with their people, and shows each person’s teams on the Team page', async ({ page }) => {
    await page.goto('/settings/teams');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Teams' }),
    ).toHaveAttribute('aria-current', 'page');
    const teams = page.getByRole('region', { name: 'Teams' });
    await expect(teams.getByRole('heading', { name: 'Front office' })).toBeVisible();
    await expect(teams.getByText('Rahul Das')).toBeVisible();

    await page.goto('/settings/team');
    await expect(page.getByText('Teams: Front office')).toBeVisible();
  });

  test('adds a team with a name and ticked people', async ({ page, pretendApi }) => {
    await page.goto('/settings/teams');
    await page.getByRole('button', { name: 'Add a team' }).click();
    await page.getByLabel('Team name').fill('Weekends');
    await page.getByLabel('Rahul Das').check();
    await page.getByLabel('Anita Nair').check();
    await page.getByRole('button', { name: 'Add team' }).click();

    await expect(page.getByText('The team Weekends was added.')).toBeVisible();
    expect(pretendApi.team.postedTeams).toEqual([
      { name: 'Weekends', memberIds: ['member-staff-1', '0191f0a0-0000-7000-8000-000000000001'] },
    ]);
    await expect(page.getByRole('region', { name: 'Teams' }).getByRole('heading', { name: 'Weekends' })).toBeVisible();
  });

  test('asks for a name, and shows the API’s words when the name is already used, keeping what was typed', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/settings/teams');
    await page.getByRole('button', { name: 'Add a team' }).click();
    await page.getByRole('button', { name: 'Add team' }).click();
    await expect(page.getByText('Enter a name for the team.')).toBeVisible();
    expect(pretendApi.team.postedTeams).toEqual([]);

    pretendApi.team.refusal = {
      status: 409,
      code: 'TEAM_NAME_TAKEN',
      message: 'You already have a team with this name. Choose another name.',
    };
    await page.getByLabel('Team name').fill('Front office');
    await page.getByRole('button', { name: 'Add team' }).click();
    await expect(page.getByRole('alert')).toContainText('You already have a team with this name.');
    await expect(page.getByLabel('Team name')).toHaveValue('Front office');
  });

  test('shows an empty state, and an error with a retry', async ({ page, pretendApi }) => {
    pretendApi.team.teams = [];
    await page.goto('/settings/teams');
    await expect(page.getByText('You have no teams yet.')).toBeVisible();
    pretendApi.team.fails = true;
    await page.reload();
    await expect(page.getByText('We could not load your teams')).toBeVisible();
    pretendApi.team.fails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('You have no teams yet.')).toBeVisible();
  });

  test('staff do not see the Teams tab', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/settings');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Teams' }),
    ).toHaveCount(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/settings/teams');
    await expect(page.getByRole('heading', { name: 'Front office' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
