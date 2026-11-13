import { expect, PRETEND_PROFILE, PRETEND_STAGE_IDS, test } from './support';

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

  test('Filter: one stage, closed leads and only mine are asked of the API, shown in the address, and counted on the button', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Filter' }).click();
    const panel = page.getByRole('dialog', { name: 'Filter leads' });
    await panel.getByLabel('Stage').selectOption({ label: 'Quoted' });
    await expect(page).toHaveURL(new RegExp(`stage=${PRETEND_STAGE_IDS.quoted}`));
    await expect.poll(() => pretendApi.leadQueries.at(-1)).toContain(`stageId=${PRETEND_STAGE_IDS.quoted}`);
    await panel.getByLabel('Owner').selectOption({ label: 'Only mine' });
    await expect(page).toHaveURL(/owner=me/);
    await expect.poll(() => pretendApi.leadQueries.at(-1)).toContain(`ownerUserId=${PRETEND_PROFILE.user.id}`);
    // The button says how many filters are on, in words for screen readers too
    await expect(page.getByRole('button', { name: /Filter.*Filters on: 2/ })).toBeVisible();
    // Closed leads offer Won and Lost, not the open stages, and clear the stage that was picked
    await panel.getByLabel('Show').selectOption({ label: 'Closed leads (won or lost)' });
    await expect(page).toHaveURL(/status=closed/);
    await expect(page).not.toHaveURL(/stage=/);
    await expect(panel.getByLabel('Stage').getByRole('option')).toHaveText(['Any stage', 'Won', 'Lost']);
    await expect(
      page
        .getByText(/closed leads/)
        .locator('visible=true')
        .first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('Sort: the field and its direction are asked of the API and shown in the address', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Sort' }).click();
    const panel = page.getByRole('dialog', { name: 'Sort leads' });
    await panel.getByLabel('Sort by').selectOption({ label: 'Next callback' });
    await expect(page).toHaveURL(/sort=callbackAt/);
    await expect(page).toHaveURL(/order=asc/);
    await expect(panel.getByLabel('Order').getByRole('option')).toHaveText(['Soonest first', 'Latest first']);
    await panel.getByLabel('Order').selectOption({ label: 'Latest first' });
    await expect.poll(() => pretendApi.leadQueries.at(-1)).toContain('sort=callbackAt&order=desc');
    await panel.getByLabel('Sort by').selectOption({ label: 'Date added' });
    await expect(panel.getByLabel('Order').getByRole('option')).toHaveText(['Newest first', 'Oldest first']);
    await expect.poll(() => pretendApi.leadQueries.at(-1)).toContain('sort=createdAt&order=desc');
  });

  test('a link keeps the view: the address is read when the page opens', async ({ page, pretendApi }) => {
    await page.goto(`/leads?stage=${PRETEND_STAGE_IDS.contacted}&sort=callbackAt&order=asc`);
    await expect(page.getByText('Priya Menon 0', { exact: true }).locator('visible=true')).toBeVisible();
    expect(pretendApi.leadQueries[0]).toContain(`stageId=${PRETEND_STAGE_IDS.contacted}`);
    expect(pretendApi.leadQueries[0]).toContain('sort=callbackAt&order=asc');
    await expect(page.getByRole('button', { name: /Filter.*Filters on: 1/ })).toBeVisible();
  });

  test('a link that makes no sense still opens the plain list', async ({ page, pretendApi }) => {
    await page.goto('/leads?status=maybe&stage=banana&sort=name&order=sideways&page=-4');
    await expect(page.getByText('Priya Menon 0', { exact: true }).locator('visible=true')).toBeVisible();
    expect(pretendApi.leadQueries[0]).toBe('?status=open&sort=lastActivity&order=desc&page=1&limit=25');
  });

  test('when no lead matches the filters it says so and Clear filters brings the list back', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.leadCount = 0;
    await page.goto('/leads?owner=me');
    await expect(page.getByRole('heading', { name: 'No leads match these filters' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/owner=/);
    await expect(page.getByRole('heading', { name: 'No leads yet' })).toBeVisible();
  });

  test('the page number is kept in the address, so a refresh stays on the same page', async ({ page, pretendApi }) => {
    pretendApi.leadCount = 30;
    await page.goto('/leads');
    await page
      .getByRole('navigation', { name: 'Leads pages' })
      .locator('visible=true')
      .getByRole('button', { name: 'Next' })
      .click();
    await expect(page).toHaveURL(/page=2/);
    await page.reload();
    await expect(page.getByText('Showing 26–30 of 30 open leads').locator('visible=true')).toBeVisible();
  });

  test('changing a filter goes back to page 1', async ({ page, pretendApi }) => {
    pretendApi.leadCount = 30;
    await page.goto('/leads?page=2');
    await expect(page.getByText('Showing 26–30 of 30 open leads').locator('visible=true')).toBeVisible();
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('dialog', { name: 'Filter leads' }).getByLabel('Owner').selectOption({ label: 'Only mine' });
    await expect(page).not.toHaveURL(/page=/);
  });

  test('on a desktop the page stays still and the table scrolls inside it, with its heading row, toolbar and footer in view', async ({
    page,
    pretendApi,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The fixed frame is for tablets and desktops');
    pretendApi.leadCount = 25;
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto('/leads');
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const windowScrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(windowScrolls, 'the window itself should not scroll').toBe(false);

    // 25 rows are taller than the box, so the box scrolls; the heading row does not move
    const heading = table.getByRole('columnheader', { name: 'Lead name' });
    const headingBefore = (await heading.boundingBox())!.y;
    const boxCanScroll = await page.evaluate(() => {
      const box = document.querySelector('table')!.parentElement!;
      return box.scrollHeight > box.clientHeight;
    });
    expect(boxCanScroll).toBe(true);
    await page.evaluate(() => document.querySelector('table')!.parentElement!.scrollTo(0, 100_000));
    expect((await heading.boundingBox())!.y).toBe(headingBefore);
    // The last row is now in view, and the toolbar and the footer never left
    await expect(page.getByText('Priya Menon 24', { exact: true }).locator('visible=true')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Create lead' })).toBeInViewport();
    await expect(page.getByRole('navigation', { name: 'Leads pages' }).locator('visible=true')).toBeInViewport();

    // A row menu opened on the last row is drawn in full, not cut off by the scrolling box
    await page.getByRole('button', { name: 'More actions for Priya Menon 24' }).click();
    const menu = page.getByRole('group', { name: 'Actions for Priya Menon 24' });
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(640);
    await expect(menu.getByRole('button', { name: 'Delete lead' })).toBeInViewport();
    // Scrolling closes it, because its button moves away
    await page.evaluate(() => document.querySelector('table')!.parentElement!.scrollTo(0, 0));
    await expect(menu).toHaveCount(0);
  });

  test('on a phone the page scrolls as usual', async ({ page, pretendApi }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only');
    pretendApi.leadCount = 25;
    await page.goto('/leads');
    await expect(page.getByText('Priya Menon 0', { exact: true }).locator('visible=true')).toBeVisible();
    const windowScrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(windowScrolls).toBe(true);
  });
});
