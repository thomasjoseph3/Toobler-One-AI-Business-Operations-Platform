import { expect, test } from './support';

// F11 slice 4b: the extra filters on the Contacts and Companies lists (the business's own fields).

test.describe('Extra filters on the Contacts list', () => {
  test('filters on a custom contact field: the rows fit the field, only finished rows are sent, the address keeps them, Clear filters removes them', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Filter' }).click();
    const panel = page.getByRole('dialog', { name: /Filter contacts/ });
    await panel.getByRole('button', { name: 'Add a filter' }).click();
    // The only field of a contact in this business is Birthday, a date: it offers date conditions and a date box
    await expect(panel.getByLabel('Field')).toHaveValue('custom.birthday');
    await panel.getByLabel('Condition').selectOption({ label: 'is before' });
    await expect(panel.getByLabel('Value')).toHaveAttribute('type', 'date');
    // Applying a row with no value yet sends nothing
    await panel.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).not.toHaveURL(/filters=/);
    await panel.getByLabel('Value').fill('1990-01-01');
    const request = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/api/v1/contacts?') &&
        decodeURIComponent(candidate.url()).includes(
          'filters=[{"field":"custom.birthday","operator":"before","value":"1990-01-01"}]',
        ),
    );
    await panel.getByRole('button', { name: 'Apply filters' }).click();
    await request;
    await expect(page).toHaveURL(/filters=/);
    await expect(page.getByRole('button', { name: /Filter.*Filters on: 1/ })).toBeVisible();
    await panel.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/filters=/);
  });

  test('"is empty" needs no value and can be applied at once', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Filter' }).click();
    const panel = page.getByRole('dialog', { name: /Filter contacts/ });
    await panel.getByRole('button', { name: 'Add a filter' }).click();
    await panel.getByLabel('Condition').selectOption({ label: 'is empty' });
    await expect(panel.getByLabel('Value')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/filters=/);
  });
});

test.describe('Extra filters on the Companies list', () => {
  test('there is no extra filter button while the business has no company fields of its own', async ({ page }) => {
    await page.goto('/companies');
    await expect(
      page
        .getByRole('textbox', { name: /Search/i })
        .or(page.getByRole('searchbox'))
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Filter/ })).toHaveCount(0);
  });
});
