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

test.describe('Timeline: stage changes beside the notes', () => {
  test('the lead page shows the stage change with the notes, and the chips narrow it down', async ({ page }) => {
    await page.goto('/leads/lead-0');
    await expect(page.getByText('Maya Chen moved it from New to Contacted')).toBeVisible();
    await expect(page.getByText('Great insights on the project, looking forward to the next steps!')).toBeVisible();

    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(page.getByText('Great insights on the project, looking forward to the next steps!')).toBeVisible();
    await expect(page.getByText('Maya Chen moved it from New to Contacted')).toHaveCount(0);

    await page.getByRole('button', { name: 'Stage changes' }).click();
    await expect(page.getByText('Maya Chen moved it from New to Contacted')).toBeVisible();
    await expect(page.getByText('Great insights on the project, looking forward to the next steps!')).toHaveCount(0);
  });

  test('the Notes panel on the list shows notes only, with no stage lines', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The row icons are for tablets and desktops');
    await page.goto('/leads');
    const row = page.getByRole('row', { name: /Priya Menon 0/ });
    await row.hover();
    await row.getByRole('button', { name: 'Notes for Priya Menon 0' }).click();
    const panel = page.getByRole('dialog', { name: 'Notes' });
    await expect(panel).toContainText('Great insights on the project');
    await expect(panel).not.toContainText('moved it from');
  });
});

test.describe('Notes: changing and deleting', () => {
  test('the writer edits their own note in place, and it says Edited', async ({ page, pretendApi }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The row icons are for tablets and desktops');
    await page.goto('/leads');
    const row = page.getByRole('row', { name: /Priya Menon 0/ });
    await row.hover();
    await row.getByRole('button', { name: 'Notes for Priya Menon 0' }).click();
    const panel = page.getByRole('dialog', { name: 'Notes' });
    await panel.getByPlaceholder('Enter here').fill('My own note');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel).toContainText('My own note');
    // Maya's note belongs to someone else: no Edit under it, one Edit under mine
    await expect(panel.getByRole('button', { name: 'Edit' })).toHaveCount(1);
    await panel.getByRole('button', { name: 'Edit' }).click();
    await panel.getByLabel('Change the note').fill('My own note, changed');
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(panel).toContainText('My own note, changed');
    await expect(panel).toContainText('Edited');
    expect(pretendApi.notes.editedNotes).toEqual([{ noteId: 'note-2', body: 'My own note, changed' }]);
  });

  test('Cancel throws an edit away, and an empty note cannot be saved', async ({ page, pretendApi }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The row icons are for tablets and desktops');
    await page.goto('/leads');
    const row = page.getByRole('row', { name: /Priya Menon 0/ });
    await row.hover();
    await row.getByRole('button', { name: 'Notes for Priya Menon 0' }).click();
    const panel = page.getByRole('dialog', { name: 'Notes' });
    await panel.getByPlaceholder('Enter here').fill('Keep me');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await panel.getByRole('button', { name: 'Edit' }).click();
    await panel.getByLabel('Change the note').fill('   ');
    await expect(panel.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await panel.getByLabel('Change the note').fill('Thrown away');
    await panel.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(panel).toContainText('Keep me');
    expect(pretendApi.notes.editedNotes).toEqual([]);
  });

  test('a manager deletes any note after Are you sure? naming the writer; Cancel keeps it', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads/lead-0');
    await expect(page.getByText('Great insights on the project')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete the note by Maya Chen?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Great insights on the project')).toBeVisible();
    expect(pretendApi.notes.deletedNoteIds).toEqual([]);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete the note by Maya Chen?' })
      .getByRole('button', { name: 'Delete note' })
      .click();
    await expect(page.getByText('Great insights on the project')).toHaveCount(0);
    expect(pretendApi.notes.deletedNoteIds).toEqual(['note-1']);
  });

  test('staff see no Delete, and a refused change is said in plain words', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/leads/lead-0');
    await expect(page.getByText('Great insights on the project')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    pretendApi.role = 'manager';
    await page.reload();
    pretendApi.notes.refusal = { status: 404, code: 'NOT_FOUND', message: 'That note was not found.' };
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete the note by Maya Chen?' })
      .getByRole('button', { name: 'Delete note' })
      .click();
    await expect(page.getByText('This lead no longer exists.')).toBeVisible();
  });
});

test.describe('Notes: the orange notes icon and the contact page', () => {
  test('a lead with notes shows the orange icon all the time, and it follows adding and deleting', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The row icons are for tablets and desktops');
    await page.goto('/leads');
    // Lead 0 already has one note: its icon is there without hovering; lead 1 has none
    const icon = page.getByRole('button', { name: 'Notes for Priya Menon 0: 1' });
    await expect(icon).toBeVisible();
    await expect(page.getByRole('button', { name: /Notes for \+919847010001/ })).toBeHidden();
    // Add a note on lead 1 from its hover icon: the orange icon appears
    const row = page.getByRole('row', { name: /\+919847010001/ });
    await row.hover();
    await row.getByRole('button', { name: 'Notes for +919847010001' }).click();
    const panel = page.getByRole('dialog', { name: 'Notes' });
    await panel.getByPlaceholder('Enter here').fill('First note on this lead');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel).toContainText('First note on this lead');
    await panel.getByRole('button', { name: 'Close the notes' }).click();
    await expect(page.getByRole('button', { name: 'Notes for +919847010001: 1' })).toBeVisible();
    // Delete lead 0's only note (a manager): its icon goes away
    await icon.click();
    await page.getByRole('dialog', { name: 'Notes' }).getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete the note by Maya Chen?' })
      .getByRole('button', { name: 'Delete note' })
      .click();
    await page.getByRole('dialog', { name: 'Notes' }).getByRole('button', { name: 'Close the notes' }).click();
    await expect(page.getByRole('button', { name: /Notes for Priya Menon 0: / })).toBeHidden();
  });

  test('the contact page shows the notes on the person and their leads, and adds a note on the person', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/contacts/contact-0');
    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expect(page.getByText('Great insights on the project, looking forward to the next steps!')).toBeVisible();
    await page.getByPlaceholder('Enter here').fill('Regular guest, likes the lake view');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Regular guest, likes the lake view')).toBeVisible();
    expect(pretendApi.notes.postedNotes).toEqual([
      { contactId: 'contact-0', body: 'Regular guest, likes the lake view' },
    ]);
  });
});
