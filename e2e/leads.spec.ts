import { expect, test } from './support';

test.describe('Leads list', () => {
  test('shows the open leads with the display rules: name, phone or email as the name, tags, owner, callback date', async ({
    page,
  }, testInfo) => {
    await page.goto('/leads');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leads');
    const isPhone = testInfo.project.name === 'phone';
    // A table on a tablet or desktop, cards on a phone: the same facts either way
    const list = isPhone ? page.getByRole('list').filter({ hasText: 'Priya Menon 0' }) : page.getByRole('table');
    await expect(list).toBeVisible();
    await expect(list.getByText('Priya Menon 0', { exact: true })).toBeVisible();
    await expect(list.getByText('+919847010001').first()).toBeVisible(); // a caller with only a phone: the phone is the name
    await expect(list.getByText('person2@example.com').first()).toBeVisible(); // only an email: the email is the name
    await expect(list.getByText('New', { exact: true })).toBeVisible();
    await expect(list.getByText('Contacted', { exact: true })).toBeVisible();
    await expect(list.getByText('Quoted', { exact: true })).toBeVisible();
    // On a phone the source and owner share one line ("WhatsApp · You"), so these check the words, not whole cells
    for (const words of ['You', 'Team member', 'Unassigned', 'WhatsApp', 'Web chat', '22 Nov']) {
      await expect(list).toContainText(words);
    }
    await expect(page.getByText('Showing 1–3 of 3 open leads').locator('visible=true')).toBeVisible();
  });

  test('table has the Figma columns and lets the person tick rows', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The table is for tablets and desktops');
    await page.goto('/leads');
    const table = page.getByRole('table');
    for (const heading of ['Lead name', 'Email', 'Phone', 'Status', 'Lead source', 'Lead owner', 'Next activity']) {
      await expect(table.getByRole('columnheader', { name: heading })).toBeVisible();
    }
    const firstRowBox = table.getByRole('checkbox', { name: 'Select Priya Menon 0' });
    await firstRowBox.check();
    await expect(firstRowBox).toBeChecked();
    await table.getByRole('checkbox', { name: 'Select all leads on this page' }).check();
    await expect(table.getByRole('checkbox', { name: 'Select +919847010001' })).toBeChecked();
    await table.getByRole('checkbox', { name: 'Select all leads on this page' }).uncheck();
    await expect(firstRowBox).not.toBeChecked();
  });

  test('pages through 25 leads at a time with Previous and Next', async ({ page, pretendApi }) => {
    pretendApi.leadCount = 30;
    await page.goto('/leads');
    const summary = (text: string) => page.getByText(text).locator('visible=true');
    const pagination = page.getByRole('navigation', { name: 'Leads pages' }).locator('visible=true');
    await expect(summary('Showing 1–25 of 30 open leads')).toBeVisible();
    await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(summary('Showing 26–30 of 30 open leads')).toBeVisible();
    await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(pretendApi.calls).toContain('GET /leads');
    await pagination.getByRole('button', { name: 'Previous' }).click();
    await expect(summary('Showing 1–25 of 30 open leads')).toBeVisible();
  });

  test('says what to do next when there are no leads', async ({ page, pretendApi }) => {
    pretendApi.leadCount = 0;
    await page.goto('/leads');
    await expect(page.getByRole('heading', { name: 'No leads yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Set up channels' })).toBeVisible();
  });

  test('shows a plain error with Try again, and recovers', async ({ page, pretendApi }) => {
    pretendApi.leadsFail = true;
    await page.goto('/leads');
    await expect(page.getByRole('heading', { name: 'We could not load your leads' })).toBeVisible();
    pretendApi.leadsFail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Priya Menon 0', { exact: true }).locator('visible=true')).toBeVisible();
  });
});
