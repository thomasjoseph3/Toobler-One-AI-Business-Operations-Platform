import { expect, PAGES, test } from './support';

test.describe('navigation', () => {
  test('desktop and tablet show the side rail and not the bottom bar; phone shows the opposite', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    // Only the visible navigation is in the accessibility tree: the other one is display:none.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(1);
    if (testInfo.project.name === 'phone') {
      await expect(page.getByRole('link', { name: 'Leads' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
    } else {
      await expect(page.getByRole('link', { name: 'Companies' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More' })).toHaveCount(0);
    }
  });

  test('every page opens from the menu with its own heading and a marked current item', async ({ page }, testInfo) => {
    const isPhone = testInfo.project.name === 'phone';
    await page.goto('/');
    for (const pageEntry of PAGES) {
      if (isPhone && !pageEntry.isInPhoneBar) {
        await page.getByRole('button', { name: 'More' }).click();
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
    const moreButton = page.getByRole('button', { name: 'More' });
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
    expect(await canvasColor(page)).toBe('rgb(245, 246, 245)'); // designer: color-canvas #F5F6F5

    await button.click();
    await expect(button).toHaveAccessibleName('Theme: Dark. Click to change');
    expect(await canvasColor(page)).toBe('rgb(21, 26, 23)'); // designer: dark-color-canvas #151A17

    await button.click();
    await expect(button).toHaveAccessibleName('Theme: System. Click to change');
  });

  test('System follows the device setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await canvasColor(page)).toBe('rgb(21, 26, 23)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await canvasColor(page)).toBe('rgb(245, 246, 245)');
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
    expect(await canvasColor(page)).toBe('rgb(245, 246, 245)');
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
