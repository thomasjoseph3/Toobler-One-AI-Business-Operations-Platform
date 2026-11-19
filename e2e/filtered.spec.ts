import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

test.describe('The Filtered tab', () => {
  test('opens from the Leads toolbar and lists what was filtered, with the type, sender and first words', async ({
    page,
  }) => {
    await page.goto('/leads');
    await page.getByRole('link', { name: 'Filtered' }).click();
    await expect(page).toHaveURL(/\/leads\/filtered$/);
    await expect(page.getByRole('heading', { name: 'Filtered', level: 2 })).toBeVisible();
    await expect(page.getByText('Spam', { exact: true })).toBeVisible();
    await expect(page.getByText('+919847099001')).toBeVisible();
    await expect(page.getByText('Win a free prize now')).toBeVisible();
    // A conversation with no words says so
    await expect(page.getByText('No message')).toBeVisible();
    await expect(page.getByText('Showing 1 to 2 of 2')).toBeVisible();
  });

  test('moves one to leads, says so, and the list shows the rest', async ({ page, pretendApi }) => {
    await page.goto('/leads/filtered');
    await page.getByRole('button', { name: 'Move to leads: +919847099001' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Moved to leads' })).toBeVisible();
    expect(pretendApi.filtered.movedIds).toEqual(['filtered-1']);
    await expect(page.getByText('Win a free prize now')).toHaveCount(0);
    await expect(page.getByText('+919847099002')).toBeVisible();
  });

  test('says plainly when a move is refused, and keeps the list', async ({ page, pretendApi }) => {
    pretendApi.filtered.moveRefusal = {
      status: 409,
      code: 'NOT_FILTERED',
      message: 'This conversation is not in the Filtered list.',
    };
    await page.goto('/leads/filtered');
    await page.getByRole('button', { name: 'Move to leads: +919847099001' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'not in the Filtered list' })).toBeVisible();
  });

  test('has an empty state, and an error with a retry', async ({ page, pretendApi }) => {
    pretendApi.filtered.items = [];
    await page.goto('/leads/filtered');
    await expect(page.getByText('Nothing was filtered out')).toBeVisible();

    pretendApi.filtered.listFails = true;
    await page.reload();
    await expect(page.getByText('The filtered list could not be loaded')).toBeVisible();
    pretendApi.filtered.listFails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Nothing was filtered out')).toBeVisible();
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/leads/filtered');
    await expect(page.getByText('Win a free prize now')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });
});
