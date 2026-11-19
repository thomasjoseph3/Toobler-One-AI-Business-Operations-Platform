import { expect, PAGES, test } from './support';

test.describe('navigation', () => {
  test('desktop and tablet show the sidebar and not the bottom bar; phone shows the opposite', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    // Only the visible navigation is in the accessibility tree: the other one is display:none.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(1);
    if (testInfo.project.name === 'phone') {
      await expect(page.getByRole('link', { name: 'Leads' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('link', { name: 'Companies' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More', exact: true })).toHaveCount(0);
    }
  });

  test('every page opens from the menu with its own heading and a marked current item', async ({ page }, testInfo) => {
    const isPhone = testInfo.project.name === 'phone';
    await page.goto('/');
    for (const pageEntry of PAGES) {
      if (isPhone && !pageEntry.isInPhoneBar) {
        await page.getByRole('button', { name: 'More', exact: true }).click();
        await page.getByRole('dialog').getByRole('link', { name: pageEntry.label }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0); // choosing a page closes the sheet
      } else {
        await page
          .getByRole('navigation', { name: 'Main navigation' })
          .getByRole('link', { name: pageEntry.label, exact: true })
          .click();
      }
      await expect(page).toHaveURL(pageEntry.path === '/' ? /\/$/ : new RegExp(`${pageEntry.path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (!isPhone || pageEntry.isInPhoneBar) {
        await expect(
          page.getByRole('navigation', { name: 'Main navigation' }).locator('[aria-current="page"]'),
        ).toHaveCount(1);
      }
    }
  });

  test('an unknown address shows the not-found page with a way back', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to Today' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the More sheet closes with Escape and returns focus to the button that opened it', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'The More sheet exists on phones only');
    await page.goto('/');
    const moreButton = page.getByRole('button', { name: 'More', exact: true });
    await moreButton.click();
    await expect(page.getByRole('dialog', { name: 'More pages' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(moreButton).toBeFocused();
  });

  test('the skip link is the first thing a keyboard reaches and jumps to the content', async ({ page }) => {
    await page.goto('/');
    // The page frame appears once the app knows who is signed in, so wait for it before pressing Tab
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator('#main-content')).toBeFocused();
  });
});

test.describe('layout', () => {
  for (const pageEntry of PAGES) {
    test(`${pageEntry.label} has no sideways scrolling`, async ({ page }) => {
      await page.goto(pageEntry.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const hasSidewaysScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasSidewaysScroll).toBe(false);
    });
  }

  test('touch targets in the phone bar are at least 44 px high', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only');
    await page.goto('/');
    const bar = page.getByRole('navigation', { name: 'Main navigation' });
    for (const control of await bar.locator('a, button').all()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('shell (as in the Figma frame)', () => {
  test('the top bar shows the page title as the one h1', async ({ page }) => {
    await page.goto('/leads');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leads');
  });

  test('the sidebar has the Figma groups, Settings and the signed-in person at the bottom, and it can collapse', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The sidebar is not shown on a phone');
    await page.goto('/leads');
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(sidebar.getByText('CRM', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('AI & communication', { exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(sidebar.getByText('Anita Nair', { exact: true })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Collapse the sidebar' }).click();
    await expect(sidebar.getByText('CRM', { exact: true })).toBeHidden();
    expect((await sidebar.boundingBox())?.width).toBeCloseTo(68, 0);
    await sidebar.getByRole('button', { name: 'Expand the sidebar' }).click();
    expect((await sidebar.boundingBox())?.width).toBeCloseTo(256, 0);
  });

  test('the account menu opens with Sign out and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const accountButton = page.getByRole('button', { name: /Account menu/ });
    await accountButton.click();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveCount(0);
  });
});

test.describe('theme', () => {
  const canvasColor = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test("one button cycles System, Light, Dark and the designer's colours apply", async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const button = page.getByRole('button', { name: /^Theme:/ });
    await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveCount(1);
    await expect(button).toHaveAccessibleName('Theme: System. Click to change');

    await button.click();
    await expect(button).toHaveAccessibleName('Theme: Light. Click to change');
    expect(await canvasColor(page)).toBe('rgb(237, 237, 237)'); // designer v1.3: color.light.bg.canvas #EDEDED

    await button.click();
    await expect(button).toHaveAccessibleName('Theme: Dark. Click to change');
    expect(await canvasColor(page)).toBe('rgb(17, 18, 16)'); // designer v1.3: color.dark.bg.canvas #111210

    await button.click();
    await expect(button).toHaveAccessibleName('Theme: System. Click to change');
  });

  test('System follows the device setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await canvasColor(page)).toBe('rgb(17, 18, 16)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await canvasColor(page)).toBe('rgb(237, 237, 237)');
  });

  test('the chosen theme is remembered and applied before the page is drawn', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Theme:/ }).click(); // System to Light
    await page.getByRole('button', { name: /^Theme:/ }).click(); // Light to Dark
    await page.reload();
    // Read the attribute as soon as the document exists: the external script must already have set it (no flash).
    const attributeAtStart = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(attributeAtStart).toBe('dark');
    await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveAccessibleName('Theme: Dark. Click to change');
  });

  test('the page still works when browser storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage is blocked');
        },
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /^Theme:/ }).click();
    expect(await canvasColor(page)).toBe('rgb(237, 237, 237)');
  });
});

test.describe('developer gallery', () => {
  test('/dev/ui shows the design system pieces', async ({ page }) => {
    await page.goto('/dev/ui');
    await expect(page.getByRole('heading', { name: 'UI gallery' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Buttons' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Badges' })).toBeVisible();
  });
});

test.describe('sidebar height', () => {
  test('fits a short window without a scrollbar, and still scrolls if it ever has more than fits', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The sidebar is not shown on a phone');
    for (const height of [640, 720, 900]) {
      await page.setViewportSize({ width: 1280, height });
      await page.goto('/leads');
      const sidebarInLoop = page.getByRole('navigation', { name: 'Main navigation' });
      await expect(sidebarInLoop).toBeVisible();
      const overflow = await sidebarInLoop.evaluate((element) => element.scrollHeight - element.clientHeight);
      expect(overflow, `the sidebar overflows by ${overflow}px at a window height of ${height}px`).toBeLessThanOrEqual(
        0,
      );
    }
    // Even when it does overflow (a very short window) there is no visible scrollbar: its scrollbar is hidden
    await page.setViewportSize({ width: 1280, height: 420 });
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    const scrollbarWidth = await sidebar.evaluate(
      (element) => (element as HTMLElement).offsetWidth - element.clientWidth,
    );
    expect(scrollbarWidth).toBe(0);
  });
});

test.describe('collapsed sidebar (Figma "Sidebar Minimised")', () => {
  test('on a tablet it is 68 px wide, icon only, every link keeps its name, and the account menu opens in full', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Uses the desktop browser at a tablet width');
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/leads');
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBeCloseTo(68, 0);
    // Icon only: no words on screen, but each link has its name for screen readers and a tooltip
    await expect(sidebar.getByText('CRM', { exact: true })).toBeHidden();
    for (const name of [
      'Today',
      'Reports',
      'Leads',
      'Contacts',
      'Companies',
      'Inbox',
      'Tasks',
      'Tickets',
      'Settings',
    ]) {
      await expect(sidebar.getByRole('link', { name })).toBeVisible();
    }
    await expect(sidebar.getByRole('link', { name: 'Leads' })).toHaveAttribute('aria-current', 'page');
    // No expand button where the full sidebar would not fit
    await expect(sidebar.getByRole('button', { name: 'Expand the sidebar' })).toHaveCount(0);
    // The account button has a name, and its menu opens beside the sidebar instead of being cut off by it
    const account = sidebar.getByRole('button', { name: /Anita Nair Nair Stays, Account menu/ });
    await account.click();
    const signOut = page.getByRole('menuitem', { name: 'Sign out' });
    await expect(signOut).toBeVisible();
    const box = (await signOut.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(68);
    expect(box.x + box.width).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
    await expect(signOut).toHaveCount(0);
  });

  test('on a desktop the collapse button makes it the same icon-only sidebar, and Expand brings the full one back', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The sidebar is not shown on a phone');
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Collapse the sidebar' }).click();
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(sidebar.getByRole('link', { name: 'Contacts' })).toBeVisible();
    await expect(sidebar.getByText('CRM', { exact: true })).toBeHidden();
    await sidebar.getByRole('button', { name: 'Expand the sidebar' }).click();
    await expect(sidebar.getByText('CRM', { exact: true })).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBeCloseTo(256, 0);
  });
});
