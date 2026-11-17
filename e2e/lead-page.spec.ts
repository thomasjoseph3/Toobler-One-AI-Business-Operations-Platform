import { expect, PRETEND_STAGE_IDS, test } from './support';

test.describe("a lead's own page", () => {
  test('opens from the lead name in the list, and shows who it is, the stage, the owner and the facts', async ({
    page,
  }) => {
    await page.goto('/leads');
    await page.getByRole('link', { name: 'Priya Menon 0' }).locator('visible=true').first().click();
    await expect(page).toHaveURL(/\/leads\/lead-0$/);
    await expect(page.getByRole('heading', { name: 'Priya Menon 0', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leads');
    await expect(page.getByText('Owner: You')).toBeVisible();
    // The contact card and the facts about the lead
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await expect(page.getByRole('link', { name: '+919847010000' })).toHaveAttribute('href', 'tel:+919847010000');
    await expect(page.getByRole('link', { name: 'person0@example.com' })).toHaveAttribute(
      'href',
      'mailto:person0@example.com',
    );
    const about = page.getByRole('heading', { name: 'About this lead' }).locator('..');
    await expect(about).toContainText('Stage');
    await expect(about).toContainText('New');
    await expect(about).toContainText('WhatsApp');
    await expect(about).toContainText('13 Nov 2026');
    // Call, WhatsApp and email buttons open the right apps
    await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+919847010000');
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/919847010000');
    await expect(page.getByRole('link', { name: 'Email', exact: true })).toHaveAttribute(
      'href',
      'mailto:person0@example.com',
    );
    // Details not given say so, the callback is shown in the business's time zone, and the timeline has its place
    const details = page.getByRole('heading', { name: 'Lead details' }).locator('..').locator('..');
    await expect(details).toContainText('Not set');
    await expect(details).toContainText('22 Nov 2026, 3:30 pm');
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  });

  test('a lead with only a phone has no email button, and one with only an email has no call or WhatsApp button', async ({
    page,
  }) => {
    await page.goto('/leads/lead-1'); // only a phone
    await expect(page.getByRole('link', { name: 'Call' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Email', exact: true })).toHaveCount(0);
    await page.goto('/leads/lead-2'); // only an email
    await expect(page.getByRole('link', { name: 'Email', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Call' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveCount(0);
  });

  test('Back to leads returns to the same view of the list', async ({ page }) => {
    await page.goto('/leads?sort=createdAt&order=asc');
    await page.getByRole('link', { name: 'Priya Menon 0' }).locator('visible=true').first().click();
    await page.getByRole('link', { name: 'Back to leads' }).click();
    await expect(page).toHaveURL(/\/leads\?sort=createdAt&order=asc$/);
  });

  test('edit details: only what changed is sent, the values show afterwards, and it says so', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads/lead-0');
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel(/What do they want/).fill('  Family room, 3 nights ');
    await page.getByLabel('From', { exact: true }).fill('2026-12-20');
    await page.getByLabel('To', { exact: true }).fill('2026-12-23');
    await page.getByLabel('Number of people').fill('4');
    await page.getByLabel('Budget (₹)').fill('60,000');
    await page.getByLabel(/What we promised/).fill('Manager calls by 5 PM');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Details saved.' })).toBeVisible();
    // The callback was not touched, so it is not sent
    expect(pretendApi.patchedLeads).toEqual([
      {
        leadId: 'lead-0',
        body: {
          interest: 'Family room, 3 nights',
          dateFrom: '2026-12-20',
          dateTo: '2026-12-23',
          partySize: 4,
          budgetPaise: 6_000_000,
          promise: 'Manager calls by 5 PM',
        },
      },
    ]);
    const details = page.getByRole('heading', { name: 'Lead details' }).locator('..').locator('..');
    await expect(details).toContainText('Family room, 3 nights');
    await expect(details).toContainText('20 Dec 2026 to 23 Dec 2026');
    await expect(details).toContainText('₹60,000');
    await expect(details).toContainText('Manager calls by 5 PM');
  });

  test('changing the callback sends it in UTC, and emptying a box clears the field', async ({ page, pretendApi }) => {
    await page.goto('/leads/lead-0');
    await page.getByRole('button', { name: 'Edit details' }).click();
    // The callback shows in the business's time zone: 22 Nov 10:00 UTC is 15:30 in India
    await expect(page.getByLabel(/Call them back on/)).toHaveValue('2026-11-22T15:30');
    await page.getByLabel(/Call them back on/).fill('2026-11-25T11:00');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Details saved.' })).toBeVisible();
    expect(pretendApi.patchedLeads.at(-1)).toEqual({
      leadId: 'lead-0',
      body: { callbackAt: '2026-11-25T05:30:00.000Z' },
    });
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel(/Call them back on/).fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => pretendApi.patchedLeads.at(-1)?.body).toEqual({ callbackAt: null });
  });

  test('saving with nothing changed sends nothing, and Cancel throws the edits away', async ({ page, pretendApi }) => {
    await page.goto('/leads/lead-0');
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible();
    expect(pretendApi.patchedLeads).toEqual([]);
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel(/What do they want/).fill('Something I will not save');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Something I will not save')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByLabel(/What do they want/)).toHaveValue('');
    expect(pretendApi.patchedLeads).toEqual([]);
  });

  test('checks the form first, and keeps what was typed when the API says no', async ({ page, pretendApi }) => {
    await page.goto('/leads/lead-0');
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel('From', { exact: true }).fill('2026-12-20');
    await page.getByLabel('To', { exact: true }).fill('2026-12-19');
    await page.getByLabel('Budget (₹)').fill('lots');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('The end date cannot be before the start date.')).toBeVisible();
    await expect(page.getByText('Enter an amount in rupees, like 45000.')).toBeVisible();
    expect(pretendApi.patchedLeads).toEqual([]);
    await page.getByLabel('To', { exact: true }).fill('2026-12-23');
    await page.getByLabel('Budget (₹)').fill('1000');
    pretendApi.leadEditRefusal = {
      status: 409,
      code: 'CONFLICT',
      message: 'Someone else changed this lead. Reload and try again.',
    };
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toHaveText('Someone else changed this lead. Reload and try again.');
    await expect(page.getByLabel('Budget (₹)')).toHaveValue('1000');
  });

  test('the Actions menu moves the lead, and Delete asks first and then returns to the list with a confirmation', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads/lead-0');
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page
      .getByRole('group', { name: 'Actions for Priya Menon 0' })
      .getByRole('button', { name: 'Quoted' })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Priya Menon 0 moved to Quoted.' })).toBeVisible();
    expect(pretendApi.movedLeads).toEqual([{ leadId: 'lead-0', body: { stageId: PRETEND_STAGE_IDS.quoted } }]);
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page
      .getByRole('group', { name: 'Actions for Priya Menon 0' })
      .getByRole('button', { name: 'Delete lead' })
      .click();
    await page
      .getByRole('dialog', { name: 'Delete the lead for Priya Menon 0?' })
      .getByRole('button', { name: 'Delete lead' })
      .click();
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole('status').filter({ hasText: 'The lead for Priya Menon 0 was deleted.' })).toBeVisible();
    expect(pretendApi.deletedLeadIds).toEqual(['lead-0']);
  });

  test('staff never see Delete on the page', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/leads/lead-0');
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    const menu = page.getByRole('group', { name: 'Actions for Priya Menon 0' });
    await expect(menu.getByRole('button', { name: 'Quoted' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Delete lead' })).toHaveCount(0);
  });

  test('a lead that does not exist says so, with a way back', async ({ page, pretendApi }) => {
    pretendApi.missingLeadIds = ['lead-5'];
    await page.goto('/leads/lead-5');
    await expect(page.getByRole('heading', { name: 'This lead does not exist' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to leads' }).last().click();
    await expect(page).toHaveURL(/\/leads$/);
  });
});
