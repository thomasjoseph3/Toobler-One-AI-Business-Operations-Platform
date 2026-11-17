import { expect, PRETEND_PROFILE, PRETEND_STAGE_IDS, test } from './support';

test.describe('the Pipeline board', () => {
  test('the List / Pipeline switch changes the view, keeps it in the address, and a link opens it', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads');
    const switcher = page.getByRole('group', { name: 'Leads view' });
    await expect(switcher.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await switcher.getByRole('button', { name: 'Pipeline' }).click();
    await expect(page).toHaveURL(/layout=pipeline/);
    await expect(switcher.getByRole('button', { name: 'Pipeline' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => pretendApi.leadQueries.at(-1)).toBe('?view=board');
    await switcher.getByRole('button', { name: 'List' }).click();
    await expect(page).not.toHaveURL(/layout=/);
    // A link straight to the board
    await page.goto('/leads?layout=pipeline');
    await expect(page.getByRole('list', { name: 'Pipeline' })).toBeVisible();
  });

  test('shows a column per stage with its count, and each lead as a card', async ({ page }) => {
    await page.goto('/leads?layout=pipeline');
    const board = page.getByRole('list', { name: 'Pipeline' });
    for (const stage of ['New', 'Contacted', 'Quoted', 'Won', 'Lost']) {
      await expect(board.getByRole('listitem', { name: stage })).toBeVisible();
    }
    // 3 leads: one per open stage
    const newColumn = board.getByRole('listitem', { name: 'New' });
    await expect(newColumn).toContainText('New');
    await expect(newColumn).toContainText(', 1 leads');
    await expect(newColumn.getByText('Priya Menon 0', { exact: true })).toBeVisible();
    await expect(newColumn).toContainText('WhatsApp'); // the source
    await expect(newColumn).toContainText('+919847010000'); // the phone
    await expect(newColumn).toContainText('Owner: You');
    await expect(newColumn).toContainText('22 Nov'); // the callback date chip
    // A stage with nothing in it says so
    await expect(board.getByRole('listitem', { name: 'Won' })).toContainText('No leads here yet');
    await expect(board.getByRole('listitem', { name: 'Lost' })).toContainText('No leads here yet');
    // A card with no callback offers the activity shortcut (not working yet)
    const contactedColumn = board.getByRole('listitem', { name: 'Contacted' });
    await expect(contactedColumn.getByRole('button', { name: 'Log an activity' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test("a card's … menu moves the lead at once, without loading the board again", async ({
    page,
    pretendApi,
  }, testInfo) => {
    // On a phone the card has no menu (the designer's way is: open the lead and press Change status)
    test.skip(testInfo.project.name === 'phone', 'The card menu is for tablets and computers');
    await page.goto('/leads?layout=pipeline');
    // Count the board's requests only once it has loaded
    await expect(page.getByText('Priya Menon 0', { exact: true })).toBeVisible();
    const queriesBefore = pretendApi.leadQueries.length;
    await page.getByRole('button', { name: 'More actions for Priya Menon 0' }).click();
    await page
      .getByRole('group', { name: 'Actions for Priya Menon 0' })
      .getByRole('button', { name: 'Quoted' })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Priya Menon 0 moved to Quoted.' })).toBeVisible();
    expect(pretendApi.movedLeads).toEqual([{ leadId: 'lead-0', body: { stageId: PRETEND_STAGE_IDS.quoted } }]);
    // The board shows the move at once (the server is told in the background), so it is not asked for all the leads again
    const board = page.getByRole('list', { name: 'Pipeline' });
    await expect(board.getByRole('listitem', { name: 'Quoted' })).toContainText('Priya Menon 0');
    await expect(board.getByRole('listitem', { name: 'New' })).not.toContainText('Priya Menon 0');
    expect(pretendApi.leadQueries.length).toBe(queriesBefore);
  });

  test('dragging a card to another column moves it at once', async ({ page, pretendApi }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Cards are dragged on a computer; a phone uses Change status');
    await page.goto('/leads?layout=pipeline');
    const board = page.getByRole('list', { name: 'Pipeline' });
    await page.getByText('Priya Menon 0', { exact: true }).dragTo(board.getByRole('listitem', { name: 'Contacted' }));
    await expect(board.getByRole('listitem', { name: 'Contacted' })).toContainText('Priya Menon 0');
    expect(pretendApi.movedLeads).toEqual([{ leadId: 'lead-0', body: { stageId: PRETEND_STAGE_IDS.contacted } }]);
  });

  test('on the board only the owner filter applies, and Sort is switched off with a reason', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads?layout=pipeline');
    await page.getByRole('button', { name: 'Filter' }).click();
    const panel = page.getByRole('dialog', { name: 'Filter leads' });
    await expect(panel.getByLabel('Owner')).toBeVisible();
    await expect(panel.getByLabel('Show')).toHaveCount(0);
    await expect(panel.getByLabel('Stage')).toHaveCount(0);
    await panel.getByLabel('Owner').selectOption({ label: 'Only mine' });
    await expect.poll(() => pretendApi.leadQueries.at(-1)).toBe(`?view=board&ownerUserId=${PRETEND_PROFILE.user.id}`);
    await expect(page.getByRole('button', { name: /Filter.*Filters on: 1/ })).toBeVisible();
    await page.keyboard.press('Escape');
    const sortButton = page.getByRole('button', { name: 'Sort' });
    await expect(sortButton).toHaveAttribute('aria-disabled', 'true');
    await expect(sortButton).toHaveAttribute('title', 'Sorting is available in the List view.');
  });

  test('says when a column holds more leads than it shows', async ({ page, pretendApi }) => {
    pretendApi.leadCount = 180; // 60 in each open stage, 50 shown
    await page.goto('/leads?layout=pipeline');
    const newColumn = page.getByRole('list', { name: 'Pipeline' }).getByRole('listitem', { name: 'New' });
    await expect(newColumn).toContainText('Showing the newest 50 of 60. Switch to the List view to see them all.');
  });

  test('the board scrolls sideways when the stages do not fit, and the toolbar stays', async ({ page }, testInfo) => {
    await page.goto('/leads?layout=pipeline');
    const board = page.getByRole('list', { name: 'Pipeline' });
    await expect(board).toBeVisible();
    const canScrollSideways = await board.evaluate((element) => element.scrollWidth > element.clientWidth);
    // 5 columns of 296 px need 1,640 px: wider than a phone or a laptop with the sidebar open
    expect(canScrollSideways).toBe(true);
    await expect(page.getByRole('button', { name: 'Create lead' })).toBeInViewport();
    if (testInfo.project.name === 'desktop') {
      const windowScrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
      expect(windowScrolls).toBe(false);
    }
  });

  test('still shows the columns when there are no leads at all (so a manager can set them up), and the list keeps its empty state', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.leadCount = 0;
    await page.goto('/leads?layout=pipeline');
    const board = page.getByRole('list', { name: 'Pipeline' });
    await expect(board.getByRole('listitem', { name: 'New' })).toContainText('No leads here yet');
    await expect(board.getByRole('button', { name: 'Add a column' })).toBeVisible();
    await page.goto('/leads');
    await expect(page.getByRole('heading', { name: 'No leads yet' })).toBeVisible();
    await page.goto('/leads?owner=me');
    await expect(page.getByRole('heading', { name: 'No leads match these filters' })).toBeVisible();
  });
});
