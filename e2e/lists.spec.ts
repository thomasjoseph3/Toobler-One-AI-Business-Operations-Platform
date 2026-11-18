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

test.describe('One contact list', () => {
  const diwali = { id: 'list-1', name: 'Diwali offer 2026', memberCount: 0, createdAt: '2026-11-18T10:00:00.000Z' };

  test('opens from the Lists page, finds a person, adds them, and says when they are already in', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.lists.items = [{ ...diwali }];
    await page.goto('/contacts/lists');
    await page.getByRole('link', { name: 'Diwali offer 2026' }).click();
    await expect(page).toHaveURL(/\/contacts\/lists\/list-1$/);
    await expect(page.getByRole('heading', { name: 'Diwali offer 2026', level: 2 })).toBeVisible();
    await expect(page.getByText('Nobody is in this list yet')).toBeVisible();

    await page.getByLabel('Find a person to add').fill('priya');
    await page.getByRole('button', { name: 'Add Priya Menon to the list' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Priya Menon was added to the list.' })).toBeVisible();
    expect(pretendApi.lists.addedMembers).toEqual([{ listId: 'list-1', contactIds: ['contact-priya'] }]);
    await expect(page.getByRole('cell', { name: 'Priya Menon' })).toBeVisible();

    await page.getByLabel('Find a person to add').fill('priya');
    await page.getByRole('button', { name: 'Add Priya Menon to the list' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'already in the list' })).toBeVisible();
  });

  test('says plainly when the list no longer exists, and when adding is refused', async ({ page, pretendApi }) => {
    await page.goto('/contacts/lists/list-missing');
    await expect(page.getByText('That list does not exist')).toBeVisible();
    pretendApi.lists.items = [{ ...diwali }];
    pretendApi.lists.addRefusal = { status: 409, code: 'LIST_FULL', message: 'A list holds at most 5000 contacts.' };
    await page.goto('/contacts/lists/list-1');
    await page.getByLabel('Find a person to add').fill('priya');
    await page.getByRole('button', { name: 'Add Priya Menon to the list' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'at most 5000' })).toBeVisible();
  });
});
