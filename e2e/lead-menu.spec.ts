import { expect, PRETEND_PROFILE, PRETEND_STAGE_IDS, test } from './support';

/** Opens the "…" menu of one lead (named as the screen names it) and returns the menu's list of actions. */
async function openRowMenu(page: import('@playwright/test').Page, leadName: string) {
  await page.getByRole('button', { name: `More actions for ${leadName}` }).click();
  return page.getByRole('group', { name: `Actions for ${leadName}` });
}

test.describe('the lead row menu', () => {
  test('offers every other stage, the owner choices that make sense, and Delete to a manager', async ({ page }) => {
    await page.goto('/leads');
    // Lead 0: in New, owned by the signed-in person
    const menu = await openRowMenu(page, 'Priya Menon 0');
    for (const stage of ['Contacted', 'Quoted', 'Won', 'Lost'])
      await expect(menu.getByRole('button', { name: stage })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'New' })).toHaveCount(0); // it is already there
    await expect(menu.getByRole('button', { name: 'Assign to me' })).toHaveCount(0); // it is already mine
    await expect(menu.getByRole('button', { name: 'Remove owner' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Delete lead' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('a lead somebody else owns can be taken, and one nobody owns has nothing to remove', async ({ page }) => {
    await page.goto('/leads');
    const others = await openRowMenu(page, '+919847010001'); // lead 1: a caller with only a phone, owned by someone else
    await expect(others.getByRole('button', { name: 'Assign to me' })).toBeVisible();
    await expect(others.getByRole('button', { name: 'Remove owner' })).toBeVisible();
    await page.keyboard.press('Escape');
    const nobody = await openRowMenu(page, 'person2@example.com'); // lead 2: no owner
    await expect(nobody.getByRole('button', { name: 'Assign to me' })).toBeVisible();
    await expect(nobody.getByRole('button', { name: 'Remove owner' })).toHaveCount(0);
  });

  test('moves a lead to another stage, says so, and loads the list again', async ({ page, pretendApi }) => {
    await page.goto('/leads');
    const queriesBefore = pretendApi.leadQueries.length;
    const menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Quoted' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Priya Menon 0 moved to Quoted.' })).toBeVisible();
    expect(pretendApi.movedLeads).toEqual([{ leadId: 'lead-0', body: { stageId: PRETEND_STAGE_IDS.quoted } }]);
    await expect.poll(() => pretendApi.leadQueries.length).toBeGreaterThan(queriesBefore);
  });

  test('moving to Lost asks why first, offers the business reasons, and Cancel sends nothing', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads');
    let menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Lost' }).click();
    const dialog = page.getByRole('dialog', { name: 'Why was the lead for Priya Menon 0 lost?' });
    await expect(dialog.getByLabel('Reason').getByRole('option')).toHaveText([
      'Too costly',
      'Went elsewhere',
      'No reply',
    ]);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(pretendApi.movedLeads).toEqual([]);
    menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Lost' }).click();
    await dialog.getByLabel('Reason').selectOption({ label: 'Went elsewhere' });
    await dialog.getByRole('button', { name: 'Mark as lost' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Priya Menon 0 moved to Lost.' })).toBeVisible();
    expect(pretendApi.movedLeads).toEqual([
      { leadId: 'lead-0', body: { stageId: PRETEND_STAGE_IDS.lost, lostReason: 'Went elsewhere' } },
    ]);
  });

  test('takes a lead, and removes the owner', async ({ page, pretendApi }) => {
    await page.goto('/leads');
    let menu = await openRowMenu(page, '+919847010001');
    await menu.getByRole('button', { name: 'Assign to me' }).click();
    await expect(page.getByRole('status').filter({ hasText: '+919847010001 is now yours.' })).toBeVisible();
    menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Remove owner' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'The owner was removed from Priya Menon 0.' }),
    ).toBeVisible();
    expect(pretendApi.assignedLeads).toEqual([
      { leadId: 'lead-1', body: { ownerUserId: PRETEND_PROFILE.user.id } },
      { leadId: 'lead-0', body: { ownerUserId: null } },
    ]);
  });

  test('Delete asks "Are you sure?" naming the lead; Cancel keeps it, Delete lead removes it', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads');
    let menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Delete lead' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete the lead for Priya Menon 0?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(pretendApi.deletedLeadIds).toEqual([]);
    menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Delete lead' }).click();
    await dialog.getByRole('button', { name: 'Delete lead' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'The lead for Priya Menon 0 was deleted.' })).toBeVisible();
    expect(pretendApi.deletedLeadIds).toEqual(['lead-0']);
  });

  test('staff never see Delete', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/leads');
    const menu = await openRowMenu(page, 'Priya Menon 0');
    await expect(menu.getByRole('button', { name: 'Quoted' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Delete lead' })).toHaveCount(0);
  });

  test('shows the refusal in plain words when the API says no', async ({ page, pretendApi }) => {
    pretendApi.leadActionRefusal = { status: 409, code: 'LEAD_OPEN', message: 'This person already has an open lead.' };
    await page.goto('/leads');
    const menu = await openRowMenu(page, 'Priya Menon 0');
    await menu.getByRole('button', { name: 'Contacted' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This person already has an open lead.' })).toBeVisible();
    pretendApi.leadActionRefusal = { status: 404, code: 'NOT_FOUND', message: 'Not found.' };
    const second = await openRowMenu(page, 'Priya Menon 0');
    await second.getByRole('button', { name: 'Quoted' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This lead no longer exists. The list has been updated.' }),
    ).toBeVisible();
  });
});
