import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// The panels and boxes that open over the page must be seen in both themes, including when the person chose Light with the switch while their
// computer prefers dark (the case the system setting alone does not cover).

for (const [computerPrefers, chosen] of [
  ['dark', 'light'],
  ['light', 'light'],
  ['light', 'dark'],
] as const) {
  test.describe(`computer prefers ${computerPrefers}, the person chose ${chosen}`, () => {
    test.beforeEach(async ({ page, pretendApi }) => {
      pretendApi.tasks.tasks = [];
      await page.emulateMedia({ colorScheme: computerPrefers });
      await page.addInitScript((theme) => {
        try {
          window.localStorage.setItem('toobler-theme', theme);
        } catch {
          // A browser that blocks storage keeps the computer's own setting
        }
      }, chosen);
    });

    test('the Notes panel opens, is drawn on a solid surface and passes the contrast checks', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'The row icon is for tablets and desktops');
      await page.goto('/leads');
      await expect(page.locator('html')).toHaveAttribute('data-theme', chosen);
      await page
        .getByRole('row', { name: /Priya Menon 0/ })
        .getByRole('button', { name: /notes/i })
        .click();
      const panel = page.getByRole('dialog', { name: /Notes/ });
      await expect(panel).toBeVisible();
      await expect(panel.getByText('Great insights on the project')).toBeVisible();
      // The panel's own colour is not see-through: the page behind never shows through the words
      const background = await panel
        .locator('div')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(result.violations).toEqual([]);
    });

    test('the Save view box and the lead page show too', async ({ page }) => {
      await page.goto('/leads');
      await page.getByRole('button', { name: 'Save view' }).click();
      await expect(page.getByRole('dialog', { name: 'Save this view' })).toBeVisible();
      await expect(page.getByLabel('View name')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.goto('/leads/lead-0');
      await expect(
        page.getByRole('heading', { name: 'Notes' }).or(page.getByRole('heading', { name: 'Timeline' })),
      ).toBeVisible();
    });
  });
}
