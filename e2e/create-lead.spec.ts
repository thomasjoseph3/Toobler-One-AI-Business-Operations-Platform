import { expect, test } from './support';

/** Opens the Create lead panel and returns it. */
async function openCreateLeadPanel(page: import('@playwright/test').Page) {
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Create lead' }).click();
  const panel = page.getByRole('dialog', { name: 'Create lead' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('Create lead', () => {
  test('finds an existing person, fills the details, creates the lead and shows it', async ({ page, pretendApi }) => {
    const panel = await openCreateLeadPanel(page);
    await panel.getByLabel('Find a person').fill('priya');
    await panel.getByRole('button', { name: /Priya Menon/ }).click();
    await expect(panel.getByText('Priya Menon', { exact: true })).toBeVisible();
    await panel.getByLabel(/What do they want/).fill('  Family room, 3 nights ');
    await panel.getByLabel('From').fill('2026-12-20');
    await panel.getByLabel('To').fill('2026-12-23');
    await panel.getByLabel('Number of people').fill('4');
    await panel.getByLabel('Budget (₹)').fill('45,000');
    await panel.getByLabel(/Call them back on/).fill('2026-11-22T10:00');
    const queriesBefore = pretendApi.leadQueries.length;
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel).toBeHidden();
    // What was sent: the person, trimmed text, paise, and the callback in the business's time zone (India: 10:00 is 04:30 UTC)
    expect(pretendApi.postedContacts).toEqual([]);
    expect(pretendApi.postedLeads).toEqual([
      {
        contactId: 'contact-priya',
        interest: 'Family room, 3 nights',
        dateFrom: '2026-12-20',
        dateTo: '2026-12-23',
        partySize: 4,
        budgetPaise: 4_500_000,
        callbackAt: '2026-11-22T04:30:00.000Z',
      },
    ]);
    await expect(page.getByRole('status').filter({ hasText: 'Lead created for Priya Menon.' })).toBeVisible();
    // The list was loaded again so the new lead shows
    await expect.poll(() => pretendApi.leadQueries.length).toBeGreaterThan(queriesBefore);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Lead created' })).toHaveCount(0);
  });

  test('adds a new person and the lead together, sending only what was filled in', async ({ page, pretendApi }) => {
    const panel = await openCreateLeadPanel(page);
    await panel.getByRole('button', { name: 'Add a new person instead' }).click();
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel.getByText('Enter their name.')).toBeVisible();
    await expect(panel.getByText('Enter a phone number or an email.')).toBeVisible();
    expect(pretendApi.postedContacts).toEqual([]);
    expect(pretendApi.postedLeads).toEqual([]);
    await panel.getByLabel('Name').fill('Deepa Kurian');
    await panel.getByLabel('Email').fill('deepa@example.com');
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel).toBeHidden();
    expect(pretendApi.postedContacts).toEqual([{ name: 'Deepa Kurian', email: 'deepa@example.com' }]);
    expect(pretendApi.postedLeads).toEqual([{ contactId: 'contact-new' }]);
    await expect(page.getByRole('status').filter({ hasText: 'Lead created for Deepa Kurian.' })).toBeVisible();
  });

  test('checks the form before sending anything, with plain messages under the boxes', async ({ page, pretendApi }) => {
    const panel = await openCreateLeadPanel(page);
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel.getByText('Choose a person, or add a new one.')).toBeVisible();
    await panel.getByRole('button', { name: 'Add a new person instead' }).click();
    await panel.getByLabel('Name').fill('Rahul Verma');
    await panel.getByLabel('Phone').fill('98110 66706');
    await panel.getByLabel('From').fill('2026-12-20');
    await panel.getByLabel('To').fill('2026-12-19');
    await panel.getByLabel('Number of people').fill('0');
    await panel.getByLabel('Budget (₹)').fill('lots');
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel.getByText('The end date cannot be before the start date.')).toBeVisible();
    await expect(panel.getByText('Enter a whole number from 1 up.')).toBeVisible();
    await expect(panel.getByText('Enter an amount in rupees, like 45000.')).toBeVisible();
    expect(pretendApi.postedContacts).toEqual([]);
    expect(pretendApi.postedLeads).toEqual([]);
    // What was typed is still there
    await expect(panel.getByLabel('Name')).toHaveValue('Rahul Verma');
  });

  test('keeps the form and explains when the person already has an open lead', async ({ page, pretendApi }) => {
    pretendApi.leadCreateRefusal = { status: 409, code: 'LEAD_OPEN', message: 'This person already has an open lead.' };
    const panel = await openCreateLeadPanel(page);
    await panel.getByLabel('Find a person').fill('arjun');
    await panel.getByRole('button', { name: /Arjun Nair/ }).click();
    await panel.getByLabel(/What do they want/).fill('Two rooms');
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel.getByRole('alert')).toHaveText('This person already has an open lead.');
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel(/What do they want/)).toHaveValue('Two rooms');
  });

  test('when the new person already exists it switches to the search so they can be used', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.contactCreateRefusal = {
      status: 409,
      code: 'CONTACT_EXISTS',
      message: 'A contact with this phone number or email already exists.',
    };
    const panel = await openCreateLeadPanel(page);
    await panel.getByRole('button', { name: 'Add a new person instead' }).click();
    await panel.getByLabel('Name').fill('Priya');
    await panel.getByLabel('Phone').fill('+919847011201');
    await panel.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel.getByRole('alert')).toContainText('already belongs to someone');
    await expect(panel.getByLabel('Find a person')).toHaveValue('+919847011201');
    await expect(panel.getByRole('button', { name: /Priya Menon/ })).toBeVisible();
    expect(pretendApi.postedLeads).toEqual([]);
  });

  test('says when no one is found and still offers to add a new person', async ({ page }) => {
    const panel = await openCreateLeadPanel(page);
    await panel.getByLabel('Find a person').fill('zzzz');
    await expect(panel.getByText('No one found.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Add a new person instead' })).toBeVisible();
  });

  test('closes with Cancel, the close button or Escape, and each opening starts with an empty form', async ({
    page,
  }) => {
    const panel = await openCreateLeadPanel(page);
    await panel.getByLabel(/What do they want/).fill('something');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'Create lead' })).toBeFocused();
    await page.getByRole('button', { name: 'Create lead' }).click();
    await expect(panel.getByLabel(/What do they want/)).toHaveValue('');
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Create lead' }).click();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
  });

  test('is a side panel on a desktop and fills the screen on a phone', async ({ page }, testInfo) => {
    const panel = await openCreateLeadPanel(page);
    const box = await panel.locator('div').first().boundingBox();
    const viewportWidth = page.viewportSize()!.width;
    if (testInfo.project.name === 'phone') {
      expect(box!.width).toBeCloseTo(viewportWidth, 0);
    } else {
      expect(box!.width).toBeCloseTo(480, 0);
      expect(box!.x + box!.width).toBeCloseTo(viewportWidth, 0);
    }
  });
});
