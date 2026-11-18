import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Settings → Fields in a real browser, at phone and desktop size, against the pretend API (e2e/pretend-fields.ts).

test.describe('Settings: Fields', () => {
  test('opens on Contacts and lists that object’s fields; each tab lists its own', async ({ page }) => {
    await page.goto('/settings/fields');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Fields' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Birthday', level: 3 })).toBeVisible();
    await expect(page.getByText('Date', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Car model' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Leads' }).click();
    await expect(page.getByRole('heading', { name: 'Car model', level: 3 })).toBeVisible();
    await expect(page.getByText('Choices: Swift, Baleno, Brezza')).toBeVisible();
    // What the field is for is said in words, not only in a colour
    await expect(page.getByText('The AI asks')).toBeVisible();
    await expect(page.getByText('Required before Won')).toBeVisible();
    await page.getByRole('button', { name: 'Companies' }).click();
    await expect(page.getByText('No fields here yet.')).toBeVisible();
  });

  test('adds a dropdown field to leads with its choices, sending the object of the tab', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/settings/fields');
    await page.getByRole('button', { name: 'Leads' }).click();
    await page.getByRole('button', { name: 'Add a field' }).click();
    await page.getByLabel('Field name').fill('Fuel type');
    await page.getByLabel('Type').selectOption('dropdown');
    await page.getByLabel('Choices').fill('Petrol\nDiesel\n\nPetrol');
    await page.getByLabel('The AI should ask for this').check();
    await page.getByLabel('Required before Won').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Add field' }).click();

    await expect(page.getByText('The field Fuel type was added.')).toBeVisible();
    expect(pretendApi.fields.postedFields).toEqual([
      {
        object: 'lead',
        label: 'Fuel type',
        type: 'dropdown',
        options: ['Petrol', 'Diesel'],
        aiAsks: true,
        requiredForWon: true,
      },
    ]);
    await expect(page.getByRole('heading', { name: 'Fuel type', level: 3 })).toBeVisible();
  });

  test('offers "Required before Won" for leads only, and choices for dropdowns only', async ({ page }) => {
    await page.goto('/settings/fields');
    await page.getByRole('button', { name: 'Add a field' }).click();
    await expect(page.getByLabel('Required before Won')).toHaveCount(0);
    await expect(page.getByLabel('Choices')).toHaveCount(0);
    await page.getByLabel('Type').selectOption('dropdown');
    await expect(page.getByLabel('Choices')).toBeVisible();
  });

  test('checks the form on the device, and keeps what was typed when the API refuses', async ({ page, pretendApi }) => {
    await page.goto('/settings/fields');
    await page.getByRole('button', { name: 'Add a field' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByText('Enter a name for the field.')).toBeVisible();
    await page.getByLabel('Field name').fill('Notes');
    await page.getByLabel('Type').selectOption('dropdown');
    await page.getByRole('dialog').getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByText('Add at least one choice.')).toBeVisible();
    expect(pretendApi.fields.postedFields).toEqual([]);

    pretendApi.fields.refusal = {
      status: 409,
      code: 'FIELD_LIMIT',
      message: 'You can have at most 50 fields here. Remove one you do not use first.',
    };
    await page.getByLabel('Type').selectOption('text');
    await page.getByRole('dialog').getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByRole('alert')).toContainText('You can have at most 50 fields here.');
    await expect(page.getByLabel('Field name')).toHaveValue('Notes');
  });

  test('changes a field: the type is fixed, and only the changes are saved', async ({ page, pretendApi }) => {
    await page.goto('/settings/fields');
    await page.getByRole('button', { name: 'Leads' }).click();
    await page.getByRole('button', { name: 'Change Car model' }).click();
    await expect(page.getByLabel('Type')).toBeDisabled();
    await expect(page.getByLabel('Field name')).toHaveValue('Car model');
    await expect(page.getByLabel('Choices')).toHaveValue('Swift\nBaleno\nBrezza');
    await page.getByLabel('Field name').fill('Vehicle');
    await page.getByLabel('Choices').fill('Swift\nBaleno');
    await page.getByLabel('The AI should ask for this').uncheck();
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('The field Vehicle was changed.')).toBeVisible();
    expect(pretendApi.fields.patchedFields).toEqual([
      { id: 'field-1', body: { label: 'Vehicle', options: ['Swift', 'Baleno'], aiAsks: false, requiredForWon: true } },
    ]);
    await expect(page.getByRole('heading', { name: 'Vehicle', level: 3 })).toBeVisible();
  });

  test('removes a field only after "Are you sure?" names it', async ({ page, pretendApi }) => {
    await page.goto('/settings/fields');
    await page.getByRole('button', { name: 'Remove Birthday' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Remove the field Birthday?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.fields.removedFieldIds).toEqual([]);
    await expect(page.getByRole('heading', { name: 'Birthday', level: 3 })).toBeVisible();

    await page.getByRole('button', { name: 'Remove Birthday' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove field' }).click();
    await expect(page.getByText('The field Birthday was removed.')).toBeVisible();
    expect(pretendApi.fields.removedFieldIds).toEqual(['field-2']);
    await expect(page.getByRole('heading', { name: 'Birthday', level: 3 })).toHaveCount(0);
  });

  test('shows an error with a retry when the fields cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.fields.fails = true;
    await page.goto('/settings/fields');
    await expect(page.getByText('We could not load your fields')).toBeVisible();
    pretendApi.fields.fails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Birthday', level: 3 })).toBeVisible();
  });

  test('staff do not see the Fields tab', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/settings');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Fields' }),
    ).toHaveCount(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/settings/fields');
    await expect(page.getByRole('heading', { name: 'Birthday', level: 3 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
