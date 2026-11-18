import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

test.describe('Saved views of the Leads list', () => {
  test('shows no tabs until a view is saved', async ({ page }) => {
    await page.goto('/leads');
    await expect(page.getByRole('button', { name: 'Save view' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Saved views of the leads' })).toHaveCount(0);
  });

  test('saves the list as it is on screen under a name and shows it as a tab that is on', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads?status=closed&owner=me&sort=createdAt&order=asc');
    await page.getByRole('button', { name: 'Save view' }).click();
    await page.getByLabel('View name').fill('  My closed leads ');
    await page.getByRole('button', { name: 'Save view' }).last().click();
    await expect(page.getByRole('status').filter({ hasText: 'View saved.' })).toBeVisible();
    expect(pretendApi.views.created).toEqual([
      {
        object: 'lead',
        name: 'My closed leads',
        filters: { status: 'closed', owner: 'me' },
        sort: { field: 'createdAt', order: 'asc' },
        layout: 'list',
      },
    ]);
    const tabs = page.getByRole('navigation', { name: 'Saved views of the leads' });
    await expect(tabs.getByRole('link', { name: 'My closed leads' })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: 'All leads' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('a tab opens the list with its filters, and changing the filters turns the tab off', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.views.items = [
      {
        id: 'view-1',
        object: 'lead',
        name: 'My hot leads',
        filters: { owner: 'me' },
        sort: { field: 'callbackAt', order: 'asc' },
        layout: 'list',
        shared: false,
        isMine: true,
      },
    ];
    await page.goto('/leads');
    const tabs = page.getByRole('navigation', { name: 'Saved views of the leads' });
    await expect(tabs.getByRole('link', { name: 'All leads' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'My hot leads' }).click();
    await expect(page).toHaveURL(/owner=me/);
    await expect(page).toHaveURL(/sort=callbackAt/);
    await expect(tabs.getByRole('link', { name: 'My hot leads' })).toHaveAttribute('aria-current', 'page');
    // Changing the list away from the view turns its tab off
    await page.getByRole('button', { name: /^Filter/ }).click();
    await page.getByRole('dialog', { name: 'Filter leads' }).getByLabel('Show').selectOption('closed');
    await expect(tabs.getByRole('link', { name: 'My hot leads' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('asks for a name, and says in words when the API refuses', async ({ page, pretendApi }) => {
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Save view' }).click();
    await page.getByRole('button', { name: 'Save view' }).last().click();
    await expect(page.getByText('Give the view a name.')).toBeVisible();
    pretendApi.views.refusal = {
      status: 409,
      code: 'VIEW_NAME_TAKEN',
      message: 'You already have a view with that name. Choose another name.',
    };
    await page.getByLabel('View name').fill('My hot leads');
    await page.getByRole('button', { name: 'Save view' }).last().click();
    await expect(page.getByRole('alert').filter({ hasText: 'already have a view' })).toBeVisible();
    expect(pretendApi.views.created).toEqual([]);
  });

  test('has no accessibility problems with the tabs showing', async ({ page, pretendApi }) => {
    pretendApi.views.items = [
      {
        id: 'view-1',
        object: 'lead',
        name: 'Mine',
        filters: { owner: 'me' },
        sort: null,
        layout: 'list',
        shared: false,
        isMine: true,
      },
    ];
    await page.goto('/leads');
    await expect(page.getByRole('link', { name: 'Mine' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });
});
