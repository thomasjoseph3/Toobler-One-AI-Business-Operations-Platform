import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support';

/** Opens the search box: on a phone the search button in the top bar opens it, on a tablet or desktop it is already there. */
async function openSearchBox(page: Page) {
  // Wait for the page to be drawn before asking whether the phone button is showing
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const phoneButton = page.getByRole('button', { name: 'Search anything' });
  if (await phoneButton.isVisible()) await phoneButton.click();
  return page.getByRole('searchbox', { name: 'Search anything' }).locator('visible=true');
}

test.describe('The search box in the top bar', () => {
  test('finds contacts, companies and leads and opens the one chosen', async ({ page, pretendApi }) => {
    await page.goto('/leads');
    const box = await openSearchBox(page);
    await box.fill('menon');
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Companies' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Leads' })).toBeVisible();
    await expect(results.getByRole('link', { name: /Menon Weddings/ })).toHaveAttribute('href', '/companies/company-1');
    // One request for the finished word, not one per letter
    expect(pretendApi.search.queries).toEqual(['menon']);
    await results.getByRole('link', { name: /Menon Weddings/ }).click();
    await expect(page).toHaveURL(/\/companies\/company-1$/);
    // Choosing a result closes the list and empties the box
    await expect(page.getByRole('region', { name: 'Search results' })).toHaveCount(0);
  });

  test('asks for more letters, says when nothing matches, and closes with Escape', async ({ page }) => {
    await page.goto('/leads');
    const box = await openSearchBox(page);
    await box.fill('m');
    await expect(page.getByText('Keep typing')).toBeVisible();
    await box.fill('zzzz');
    await expect(page.getByText('Nothing matches that.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Search results' })).toHaveCount(0);
  });

  test('says plainly when the search fails', async ({ page, pretendApi }) => {
    pretendApi.search.fails = true;
    await page.goto('/leads');
    const box = await openSearchBox(page);
    await box.fill('menon');
    await expect(page.getByRole('alert').filter({ hasText: 'The search did not work' })).toBeVisible();
  });

  test('has no accessibility problems with results showing', async ({ page }) => {
    await page.goto('/leads');
    const box = await openSearchBox(page);
    await box.fill('menon');
    await expect(page.getByRole('link', { name: /Menon Weddings/ })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });
});
