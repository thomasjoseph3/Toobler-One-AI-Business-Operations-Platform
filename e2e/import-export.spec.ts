import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

const csvFile = {
  name: 'customers.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('Full Name,Mobile\nPriya,98470 12345\n'),
};

test.describe('Import contacts', () => {
  test('opens from Contacts and walks through the file, the columns, the counts, the run and the report', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/contacts');
    await page.getByRole('link', { name: 'Import' }).click();
    await expect(page).toHaveURL(/\/contacts\/import$/);
    await expect(page.getByRole('heading', { name: 'Import contacts', level: 2 })).toBeVisible();

    // Step 1: the file
    await page.getByRole('button', { name: 'Upload file' }).click();
    await expect(page.getByText('Choose a file first.')).toBeVisible();
    await page.getByLabel('Spreadsheet file').setInputFiles(csvFile);
    await page.getByRole('button', { name: 'Upload file' }).click();
    expect(pretendApi.imports.uploads).toEqual(['customers.csv']);

    // Step 2: the guessed columns, with the first rows as examples
    await expect(page.getByText('customers.csv: 1,300 rows.')).toBeVisible();
    await expect(page.getByLabel('What is the column Full Name?')).toHaveValue('name');
    await expect(page.getByLabel('What is the column Mobile?')).toHaveValue('phone');
    await expect(page.getByLabel('What is the column Favourite colour?')).toHaveValue('');
    await expect(page.getByText('Priya Menon · Rahul Nair')).toBeVisible();
    // Import waits until the columns were checked
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Check the columns' }).click();
    await expect(
      page.getByText(
        '1,240 new contacts, 46 match contacts you already have (they will be updated, not added twice), 14 rows will be skipped.',
      ),
    ).toBeVisible();
    expect(pretendApi.imports.mappings).toEqual([['name', 'phone', 'email', 'company', null]]);

    // Changing a column makes the person check again
    await page.getByLabel('What is the column Favourite colour?').selectOption({ label: 'Language' });
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Check the columns' }).click();
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();

    // Step 3: the run shows progress, then the report
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Importing your contacts' })).toBeVisible();
    await expect(page.getByText('The import is finished')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1,240 new contacts were added, 46 matched contacts you already have')).toBeVisible();
    await expect(page.getByText('Row 5: The phone number is not a valid number.')).toBeVisible();
    await expect(page.getByText('13 more rows were skipped.')).toBeVisible();
    expect(pretendApi.imports.runs).toBe(1);
  });

  test('says in words when the file is refused', async ({ page, pretendApi }) => {
    pretendApi.imports.uploadRefusal = {
      status: 400,
      code: 'INVALID_FILE',
      message: 'That file is not a CSV or an Excel (.xlsx) file.',
    };
    await page.goto('/contacts/import');
    await page
      .getByLabel('Spreadsheet file')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]) });
    await page.getByRole('button', { name: 'Upload file' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'not a CSV or an Excel' })).toBeVisible();
  });

  test('is for managers only: staff are told so and see no Import button', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/contacts');
    await expect(page.getByRole('link', { name: 'Import' })).toHaveCount(0);
    await page.goto('/contacts/import');
    await expect(page.getByText('Only managers can import contacts.')).toBeVisible();
  });

  test('has no accessibility problems on the columns step', async ({ page }) => {
    await page.goto('/contacts/import');
    await page.getByLabel('Spreadsheet file').setInputFiles(csvFile);
    await page.getByRole('button', { name: 'Upload file' }).click();
    await expect(page.getByText('customers.csv: 1,300 rows.')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });
});

test.describe('Export a list', () => {
  test('asks for exactly what the list shows, says it is being prepared, then offers the download', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/contacts?q=menon&stage=lead');
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByText('Preparing your export.')).toBeVisible();
    await expect(page.getByText('Your export is ready.')).toBeVisible({ timeout: 10_000 });
    expect(pretendApi.imports.exportRequests).toEqual([{ object: 'contact', query: 'q=menon&lifecycleStage=lead' }]);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('contacts-2026-11-18.csv');
    expect(pretendApi.imports.downloads).toBe(1);
  });

  test('says in words when the file could not be built', async ({ page, pretendApi }) => {
    pretendApi.imports.exportFails = true;
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not be built' })).toBeVisible({ timeout: 10_000 });
  });

  test('is on the Companies and Leads lists for managers, and not for staff', async ({ page, pretendApi }) => {
    await page.goto('/companies');
    await page.getByRole('button', { name: 'Export' }).click();
    await expect.poll(() => pretendApi.imports.exportRequests.at(-1)).toEqual({ object: 'company', query: '' });
    await page.goto('/leads?status=closed&owner=me&layout=pipeline');
    await page.getByRole('button', { name: 'Export' }).click();
    await expect.poll(() => String(pretendApi.imports.exportRequests.at(-1)?.query)).toContain('ownerUserId=');
    expect(pretendApi.imports.exportRequests.at(-1)).toMatchObject({ object: 'lead' });
    pretendApi.role = 'staff';
    await page.goto('/leads');
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await page.goto('/companies');
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
  });

  test('the emailed link opens the export page with the file, its size and when it stops, and downloads it', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.imports.exportAsks = 5;
    await page.goto('/exports/export-1');
    await expect(page.getByText('contacts-2026-11-18.csv', { exact: true })).toBeVisible();
    await expect(page.getByText('Rows')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download contacts-2026-11-18.csv' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('contacts-2026-11-18.csv');
    expect(pretendApi.imports.downloads).toBe(1);
  });

  test('says when the export has expired', async ({ page, pretendApi }) => {
    pretendApi.imports.exportAsks = 5;
    pretendApi.imports.expired = true;
    await page.goto('/exports/export-1');
    await expect(page.getByText('This export has expired.')).toBeVisible();
  });
});
