import { expect, test } from './support';

// Notes on a lead, in a real browser at phone and desktop size, against the pretend API (e2e/pretend-notes.ts): the Notes panel from the
// add-note icon of a row (the Figma "Leads - Note"), and the notes on the lead's own page.

test.describe('Notes: the Notes panel on the Leads list', () => {
  test('opens from the row icon, shows the notes with who wrote them, and saves a new one', async ({
    page,
    pretendApi,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'The row icons are for tablets and desktops (a phone uses the lead page)',
    );
    await page.goto('/leads');
    const row = page.getByRole('row', { name: /Priya Menon 0/ });
    await row.hover();
    await row.getByRole('button', { name: 'Notes for Priya Menon 0' }).click();
    const panel = page.getByRole('dialog', { name: 'Notes' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('@Priya Menon 0');
    await expect(panel).toContainText('Maya Chen');
    await expect(panel).toContainText('Manager');
    await expect(panel).toContainText('Great insights on the project, looking forward to the next steps!');
    await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();

    await panel.getByPlaceholder('Enter here').fill('  Prefers a ground floor room  ');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel).toContainText('Prefers a ground floor room');
    await expect(panel.getByPlaceholder('Enter here')).toHaveValue('');
    expect(pretendApi.notes.postedNotes).toEqual([{ leadId: 'lead-0', body: 'Prefers a ground floor room' }]);
  });

  test('keeps the words and says why when a note is refused', async ({ page, pretendApi }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The row icons are for tablets and desktops');
    pretendApi.notes.refusal = { status: 404, code: 'NOT_FOUND', message: 'That lead was not found.' };
    await page.goto('/leads');
    const row = page.getByRole('row', { name: /Priya Menon 0/ });
    await row.hover();
    await row.getByRole('button', { name: 'Notes for Priya Menon 0' }).click();
    const panel = page.getByRole('dialog', { name: 'Notes' });
    await panel.getByPlaceholder('Enter here').fill('Will not be saved');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel).toContainText('This lead no longer exists.');
    await expect(panel.getByPlaceholder('Enter here')).toHaveValue('Will not be saved');
  });

  test('has Next activity as the first column, right after the select box', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The table is for tablets and desktops');
    await page.goto('/leads');
    const headers = page.getByRole('table').getByRole('columnheader');
    await expect(headers.nth(1)).toHaveText('Next activity');
    await expect(headers.nth(2)).toHaveText('Lead name');
    await expect(
      page
        .getByRole('row', { name: /Priya Menon 0/ })
        .getByRole('cell')
        .nth(1),
    ).toContainText('22 Nov');
  });
});

test.describe('Notes: on the lead page', () => {
  test('shows the notes and adds one (this is how a phone adds a note)', async ({ page, pretendApi }) => {
    await page.goto('/leads/lead-0');
    await expect(page.getByText('Great insights on the project, looking forward to the next steps!')).toBeVisible();
    await page.getByPlaceholder('Enter here').fill('Called back, will confirm Friday');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Called back, will confirm Friday')).toBeVisible();
    expect(pretendApi.notes.postedNotes).toEqual([{ leadId: 'lead-0', body: 'Called back, will confirm Friday' }]);
  });
});
