import AxeBuilder from '@axe-core/playwright';
import { twinContacts } from './pretend-duplicates';
import { expect, test } from './support';

test.describe('Possible duplicates', () => {
  test('opens from Contacts, shows the pair side by side with why they match, and is accessible', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.duplicates.items = [twinContacts()];
    await page.goto('/contacts');
    await page.getByRole('link', { name: 'Possible duplicates' }).click();
    await expect(page).toHaveURL(/\/contacts\/duplicates$/);
    await expect(page.getByRole('heading', { name: 'Possible duplicates', level: 2 })).toBeVisible();
    await expect(page.getByText('Same name and a similar phone number')).toBeVisible();
    await expect(page.getByRole('cell', { name: '+971501234567' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '+971501234568' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });

  test('a manager picks values, is asked "Are you sure?" naming both, and merges', async ({ page, pretendApi }) => {
    pretendApi.duplicates.items = [twinContacts()];
    await page.goto('/contacts/duplicates');
    await page.getByRole('radio', { name: 'Keep +971501234568 as the Phone' }).check();
    await page.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Merge Anil Kumar and Anil Kumar?')).toBeVisible();
    // Not merged until the question is answered
    expect(pretendApi.duplicates.merges).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Merged. Everything is now on Anil Kumar.' }),
    ).toBeVisible();
    expect(pretendApi.duplicates.merges).toEqual([{ id: 'pair-1', body: { keep: 'a', take: { phone: 'b' } } }]);
    await expect(page.getByText('No possible duplicates')).toBeVisible();
  });

  test('"Not the same" removes the pair', async ({ page, pretendApi }) => {
    pretendApi.duplicates.items = [twinContacts()];
    await page.goto('/contacts/duplicates');
    await page.getByRole('button', { name: 'Not the same' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'are not the same' })).toBeVisible();
    expect(pretendApi.duplicates.dismissed).toEqual(['pair-1']);
  });

  test('staff cannot merge but can say "Not the same"', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    pretendApi.duplicates.items = [twinContacts()];
    await page.goto('/contacts/duplicates');
    await expect(page.getByRole('button', { name: 'Merge', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Not the same' })).toBeVisible();
  });

  test('says in words when a merge is refused', async ({ page, pretendApi }) => {
    pretendApi.duplicates.items = [twinContacts()];
    pretendApi.duplicates.mergeRefusal = {
      status: 409,
      code: 'BOTH_HAVE_OPEN_LEADS',
      message: 'Both people have an open lead. Close or delete one of the two leads first, then merge.',
    };
    await page.goto('/contacts/duplicates');
    await page.getByRole('button', { name: 'Merge', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Both people have an open lead' })).toBeVisible();
  });

  test('has an empty state, and an error with a retry', async ({ page, pretendApi }) => {
    await page.goto('/contacts/duplicates');
    await expect(page.getByText('No possible duplicates')).toBeVisible();
    pretendApi.duplicates.listFails = true;
    await page.reload();
    await expect(page.getByText('We could not load the possible duplicates')).toBeVisible();
    pretendApi.duplicates.listFails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No possible duplicates')).toBeVisible();
  });

  test('works on a phone and the companies page links to its own duplicates', async ({ page, pretendApi }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    pretendApi.duplicates.items = [twinContacts()];
    await page.goto('/contacts/duplicates');
    const hasSideScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasSideScroll).toBe(false);
    await page.goto('/companies');
    await page.getByRole('link', { name: 'Possible duplicates' }).click();
    await expect(page).toHaveURL(/\/companies\/duplicates$/);
  });
});
