import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Settings → Activity in a real browser, at phone and desktop size, against the pretend API (e2e/pretend-team.ts).

test.describe('Settings: Activity', () => {
  test('shows who did what, when, in words, newest first', async ({ page }) => {
    await page.goto('/settings/activity');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Activity' }),
    ).toHaveAttribute('aria-current', 'page');
    const lines = page.getByRole('listitem').filter({ hasText: /changed a person’s role|added a lead|did something/ });
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('Anita Nair changed a person’s role');
    await expect(lines.nth(0)).toContainText('17 Nov 2026, 15:00');
    await expect(lines.nth(0)).toContainText('Changed: role');
    // A kind with no words yet is shown as it is, and an AI agent is named as one
    await expect(lines.nth(1)).toContainText('The AI agent did something (agent.something_new)');
    await expect(lines.nth(2)).toContainText('Rahul Das added a lead');
    await expect(page.getByText('Showing 1-3 of 3 lines')).toBeVisible();
  });

  test('narrows by person and by what kind of thing', async ({ page, pretendApi }) => {
    await page.goto('/settings/activity');
    await expect(page.getByText('Showing 1-3 of 3 lines')).toBeVisible();
    await page.getByLabel('Person').selectOption({ label: 'Rahul Das' });
    await expect(page.getByText('Showing 1-1 of 1 lines')).toBeVisible();
    await expect(page.getByText('Rahul Das added a lead')).toBeVisible();
    await page.getByLabel('Person').selectOption({ label: 'Anyone' });
    await page.getByLabel('What').selectOption({ label: 'Team and teams' });
    await expect(page.getByText('Showing 1-1 of 1 lines')).toBeVisible();
    await expect(page.getByText('Anita Nair changed a person’s role')).toBeVisible();
    expect(pretendApi.team.auditRequests.at(-1)).toContain('area=team%2Cteams');
  });

  test('reads the days on the business’s own clock', async ({ page, pretendApi }) => {
    await page.goto('/settings/activity');
    await expect(page.getByText('Showing 1-3 of 3 lines')).toBeVisible();
    await page.getByLabel('From', { exact: true }).fill('2026-11-17');
    await page.getByLabel('To', { exact: true }).fill('2026-11-17');
    await expect(async () => {
      const last = decodeURIComponent(pretendApi.team.auditRequests.at(-1) ?? '');
      expect(last).toContain('from=2026-11-16T18:30:00.000Z');
      expect(last).toContain('to=2026-11-17T18:30:00.000Z');
    }).toPass();
  });

  test('says when nothing matches, and offers a retry when the log cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.team.auditLines = [];
    await page.goto('/settings/activity');
    await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
    pretendApi.team.fails = true;
    await page.reload();
    await expect(page.getByText('We could not load the activity')).toBeVisible();
  });

  test('staff do not see the Activity tab', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/settings');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Activity' }),
    ).toHaveCount(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/settings/activity');
    await expect(page.getByText('Showing 1-3 of 3 lines')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
