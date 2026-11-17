import type { Page } from '@playwright/test';
import { expect, test } from './support';

/** The text as it shows on screen: the page holds both the table and the cards, and CSS hides the one that does not fit. */
const shown = (page: Page, text: string) => page.getByText(text).locator('visible=true');

// Tasks, in a real browser at phone and desktop size, against the pretend API (e2e/pretend-tasks.ts): the Tasks page with its four tabs,
// the Add task form, the Create Task choice in a lead's row, and the tasks on the lead's own page.

test.describe('Tasks page', () => {
  test('opens on Today, shows the tab numbers, and switches tabs', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByRole('button', { name: 'Today 1' })).toHaveAttribute('aria-pressed', 'true');
    await expect(shown(page, 'Send the brochure')).toBeVisible();
    await expect(shown(page, 'Call Priya about the quote')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Overdue 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upcoming 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done 1' })).toBeVisible();

    await page.getByRole('button', { name: 'Overdue 1' }).click();
    await expect(shown(page, 'Call Priya about the quote')).toBeVisible();
    // A late task says so in words, not only colour
    await expect(shown(page, 'Late')).toBeVisible();
    await expect(page).toHaveURL(/tab=overdue/);
  });

  test('shows only my tasks when asked', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The filter popover is checked on desktop');
    await page.goto('/tasks?tab=upcoming');
    await expect(shown(page, 'Check in after the stay')).toBeVisible();
    await page.getByRole('button', { name: /Filter/ }).click();
    await page.getByLabel('Whose tasks').selectOption('me');
    await expect(shown(page, 'Check in after the stay')).toHaveCount(0);
    await expect(shown(page, 'Nothing coming up.')).toBeVisible();
  });

  test('adds a task for a person found by search, due at a date and time in the business’s time zone', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
    const panel = page.getByRole('dialog', { name: 'Add task' });
    await panel.getByRole('button', { name: 'Add task', exact: true }).click();
    await expect(panel.getByText('Choose who the task is about.')).toBeVisible();
    await expect(panel.getByText('Write what needs doing.')).toBeVisible();

    await panel.getByLabel('Who is it about?').fill('Priya');
    await panel
      .getByRole('button', { name: /Priya Menon/ })
      .first()
      .click();
    await panel.getByLabel('Kind of task').selectOption('call');
    await panel.getByLabel('What needs doing?').fill('  Call Priya at nine  ');
    await panel.getByLabel('Due date').fill('2030-03-04');
    await panel.getByLabel('Due time').fill('09:00');
    await panel.getByRole('button', { name: 'Add task', exact: true }).click();
    await expect(page.getByText('Task added: Call Priya at nine')).toBeVisible();
    // 9:00 in India is 03:30 UTC
    expect(pretendApi.tasks.postedTasks).toHaveLength(1);
    expect(pretendApi.tasks.postedTasks[0]).toMatchObject({
      kind: 'call',
      title: 'Call Priya at nine',
      dueAt: '2030-03-04T03:30:00.000Z',
    });
    expect(pretendApi.tasks.postedTasks[0]).toHaveProperty('contactId');
  });

  test('keeps what was typed and says why when a task is refused', async ({ page, pretendApi }) => {
    pretendApi.tasks.refusal = { status: 404, code: 'NOT_FOUND', message: 'That contact was not found.' };
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
    const panel = page.getByRole('dialog', { name: 'Add task' });
    await panel.getByLabel('Who is it about?').fill('Priya');
    await panel
      .getByRole('button', { name: /Priya Menon/ })
      .first()
      .click();
    await panel.getByLabel('What needs doing?').fill('Send the brochure again');
    await panel.getByRole('button', { name: 'Add task', exact: true }).click();
    await expect(panel.getByText('That person or lead is no longer there.')).toBeVisible();
    await expect(panel.getByLabel('What needs doing?')).toHaveValue('Send the brochure again');
  });
});

test.describe('Tasks on a lead', () => {
  test('Create Task in the activity icon of a lead’s row opens the form about that lead', async ({
    page,
    pretendApi,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The row icons are for tablets and desktops');
    await page.goto('/leads');
    const row = page.getByRole('row', { name: /Priya Menon 0/ });
    await row.hover();
    await row.getByRole('button', { name: 'Add something to do for Priya Menon 0' }).click();
    await page.getByRole('button', { name: 'Create Task' }).click();
    const panel = page.getByRole('dialog', { name: 'Add task for Priya Menon 0' });
    await expect(panel).toBeVisible();
    // The person is the lead's: no search box
    await expect(panel.getByLabel('Who is it about?')).toHaveCount(0);
    await panel.getByLabel('What needs doing?').fill('Send the rates');
    await panel.getByRole('button', { name: 'Add task', exact: true }).click();
    await expect(page.getByText('Task added: Send the rates')).toBeVisible();
    expect(pretendApi.tasks.postedTasks[0]).toMatchObject({ leadId: 'lead-0', title: 'Send the rates' });
  });

  test('the lead page lists the lead’s tasks and adds one (this is how a phone adds a task)', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads/lead-0');
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(shown(page, 'Call Priya about the quote')).toBeVisible();
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Add task for Priya Menon 0' });
    await panel.getByLabel('What needs doing?').fill('Follow up on Friday');
    await panel.getByRole('button', { name: 'Add task', exact: true }).click();
    await expect(page.getByText('Follow up on Friday')).toBeVisible();
    expect(pretendApi.tasks.postedTasks[0]).toMatchObject({ leadId: 'lead-0', title: 'Follow up on Friday' });
  });
});
