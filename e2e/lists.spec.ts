import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

test.describe('Contact lists', () => {
  test('Save as list sends the search and filters on screen, names the list and says how many it holds', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/contacts?q=menon&stage=lead');
    await page.getByRole('button', { name: 'Save as list' }).click();
    // Asks for a name first
    await page.getByRole('button', { name: 'Save list' }).click();
    await expect(page.getByText('Give the list a name.')).toBeVisible();
    await page.getByLabel('List name').fill('  Menon leads ');
    await page.getByRole('button', { name: 'Save list' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'The list Menon leads was made with 7 contacts.' }),
    ).toBeVisible();
    expect(pretendApi.lists.created).toEqual([
      { name: 'Menon leads', fromView: { q: 'menon', lifecycleStage: 'lead' } },
    ]);
  });

  test('says in words when the list cannot be saved', async ({ page, pretendApi }) => {
    pretendApi.lists.refusal = {
      status: 409,
      code: 'LIST_NAME_TAKEN',
      message: 'You already have a list with that name. Choose another name.',
    };
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Save as list' }).click();
    await page.getByLabel('List name').fill('Diwali');
    await page.getByRole('button', { name: 'Save list' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'already have a list' })).toBeVisible();
  });

  test('the Lists page opens from Contacts and shows each list with how many contacts it holds', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.lists.items = [
      { id: 'list-1', name: 'Diwali offer 2026', memberCount: 12, createdAt: '2026-11-18T10:00:00.000Z' },
    ];
    await page.goto('/contacts');
    await page.getByRole('link', { name: 'Lists' }).click();
    await expect(page).toHaveURL(/\/contacts\/lists$/);
    await expect(page.getByRole('heading', { name: 'Lists', level: 2 })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Diwali offer 2026' })).toBeVisible();
    await expect(page.getByText('12 contacts')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });

  test('the Lists page has an empty state and an error with a retry', async ({ page, pretendApi }) => {
    await page.goto('/contacts/lists');
    await expect(page.getByText('No lists yet')).toBeVisible();
    pretendApi.lists.listFails = true;
    await page.reload();
    await expect(page.getByText('The lists could not be loaded')).toBeVisible();
    pretendApi.lists.listFails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No lists yet')).toBeVisible();
  });
});
