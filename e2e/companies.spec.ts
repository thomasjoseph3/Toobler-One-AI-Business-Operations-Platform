import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support';

/** The text as it shows on screen: the page holds both the table and the cards, and CSS hides the one that does not fit. */
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).locator('visible=true');

// Companies in a real browser, at phone and desktop size, against the pretend API (e2e/pretend-companies.ts): the list, search, and the Add company form.

test.describe('Companies page', () => {
  test('lists the companies with their numbers', async ({ page }) => {
    await page.goto('/companies');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Companies');
    await expect(shown(page, 'Infosys HR')).toBeVisible();
    await expect(shown(page, 'Nair Travels')).toBeVisible();
    await expect(page.getByText(/Showing 1.2 of 2 companies/)).toBeVisible();
  });

  test('shows contacts, open leads, won value and owner on a desktop table', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The table is checked on desktop');
    await page.goto('/companies');
    const row = page.getByRole('row', { name: /Infosys HR/ });
    await expect(row).toContainText('Bengaluru');
    await expect(row.getByRole('cell').nth(1)).toHaveText('2');
    await expect(row.getByRole('cell').nth(2)).toHaveText('1');
    await expect(row.getByRole('cell').nth(3)).toHaveText('₹1,50,000');
    await expect(row.getByRole('cell').nth(4)).toHaveText('Anita Nair');
    await expect(
      page
        .getByRole('row', { name: /Nair Travels/ })
        .getByRole('cell')
        .nth(4),
    ).toHaveText('Nobody');
  });

  test('shows the same facts as cards on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'The cards are checked on a phone');
    await page.goto('/companies');
    await expect(page.getByText('2 contacts · 1 open lead')).toBeVisible();
    await expect(page.getByText('Won: ₹1,50,000')).toBeVisible();
    await expect(page.getByText('Owner: Anita Nair')).toBeVisible();
    await expect(page.getByText('Owner: Nobody')).toBeVisible();
  });

  test('searches by name, waiting for the typing to stop, and keeps the search in the address', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/companies');
    await page.getByPlaceholder('Search companies').fill('kochi');
    await expect(shown(page, 'Nair Travels')).toBeVisible();
    await expect(shown(page, 'Infosys HR')).toHaveCount(0);
    await expect(page).toHaveURL(/q=kochi/);
    expect(pretendApi.companies.listRequests.at(-1)).toContain('q=kochi');
  });

  test('says when nothing matches, and offers to clear the search', async ({ page }) => {
    await page.goto('/companies?q=zzzz');
    await expect(page.getByText('No company matches')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(shown(page, 'Infosys HR')).toBeVisible();
  });

  test('shows an empty state with an Add company button when there are none', async ({ page, pretendApi }) => {
    pretendApi.companies.companies = [];
    await page.goto('/companies');
    await expect(page.getByText('No companies yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add company' }).last().click();
    await expect(page.getByRole('dialog', { name: 'Add a company' })).toBeVisible();
  });

  test('shows an error with a retry when the list cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.companies.fails = true;
    await page.goto('/companies');
    await expect(page.getByText('We could not load your companies')).toBeVisible();
    pretendApi.companies.fails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(shown(page, 'Infosys HR')).toBeVisible();
  });
});

test.describe('Add company', () => {
  test('adds a company from a pasted web address, and says so', async ({ page, pretendApi }) => {
    await page.goto('/companies');
    await page.getByRole('button', { name: 'Add company' }).first().click();
    await page.getByLabel('Company name').fill('Wipro HR');
    await page.getByLabel('Website or email domain').fill('https://www.wipro.com/careers');
    await page.getByLabel('City').fill('Pune');
    await page.getByRole('dialog').getByRole('button', { name: 'Add company' }).click();

    await expect(page.getByText('The company Wipro HR was added.')).toBeVisible();
    expect(pretendApi.companies.postedCompanies).toEqual([
      { name: 'Wipro HR', domain: 'https://www.wipro.com/careers', city: 'Pune' },
    ]);
    await expect(shown(page, 'Wipro HR')).toBeVisible();
  });

  test('checks the form on the device: a name, and a domain that is not a free email service', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/companies');
    await page.getByRole('button', { name: 'Add company' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add company' }).click();
    await expect(page.getByText('Enter the company’s name.')).toBeVisible();
    await page.getByLabel('Company name').fill('Some Firm');
    await page.getByLabel('Website or email domain').fill('gmail.com');
    await page.getByRole('dialog').getByRole('button', { name: 'Add company' }).click();
    await expect(page.getByText(/This is a free email service/)).toBeVisible();
    expect(pretendApi.companies.postedCompanies).toEqual([]);
  });

  test('says in plain words when the name is already used, and keeps what was typed', async ({ page, pretendApi }) => {
    pretendApi.companies.refusal = {
      status: 409,
      code: 'COMPANY_EXISTS',
      message: 'A company with this name already exists.',
    };
    await page.goto('/companies');
    await page.getByRole('button', { name: 'Add company' }).first().click();
    await page.getByLabel('Company name').fill('infosys hr');
    await page.getByRole('dialog').getByRole('button', { name: 'Add company' }).click();
    await expect(page.getByRole('alert')).toContainText('You already have a company with this name.');
    await expect(page.getByLabel('Company name')).toHaveValue('infosys hr');
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/companies');
    await expect(shown(page, 'Infosys HR')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
