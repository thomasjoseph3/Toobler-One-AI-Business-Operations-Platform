import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// A company's own page and the Company box on a contact's page, in a real browser at phone and desktop size, against the pretend API
// (e2e/pretend-companies.ts).

test.describe('Company page', () => {
  test('opens from the list and shows the details, the numbers, the people and their leads', async ({ page }) => {
    await page.goto('/companies');
    await page.getByRole('link', { name: 'Infosys HR' }).locator('visible=true').click();
    await expect(page).toHaveURL(/\/companies\/company-1$/);
    await expect(page.getByRole('heading', { name: 'Infosys HR', level: 2 })).toBeVisible();
    await expect(page.getByText('infosys.com', { exact: true })).toBeVisible();
    await expect(page.getByText('Bengaluru', { exact: true })).toBeVisible();
    await expect(page.getByText('₹1,50,000', { exact: true })).toBeVisible();

    const people = page.getByRole('region', { name: 'People' });
    await expect(people.getByRole('link', { name: 'Priya Menon 0' })).toBeVisible();
    await expect(people.getByRole('link', { name: 'Rahul Das 1' })).toBeVisible();
    const leads = page.getByRole('region', { name: 'Leads' });
    await expect(leads.getByText('Team offsite · ')).toHaveCount(0);
    await expect(leads.getByText('Team offsite')).toBeVisible();
    await expect(leads.getByText('Conference hall · ₹1,50,000')).toBeVisible();
    // The stage is a word, not only a colour
    await expect(leads.getByText('Won', { exact: true })).toBeVisible();
    await expect(leads.getByText('Contacted', { exact: true })).toBeVisible();
  });

  test('takes a person out of the company, and the leads of that person go with them', async ({ page, pretendApi }) => {
    await page.goto('/companies/company-1');
    await page.getByRole('button', { name: 'Take Rahul Das 1 out of this company' }).click();
    await expect(page.getByText('Rahul Das 1 was taken out of this company.')).toBeVisible();
    expect(pretendApi.companies.linkedContacts).toEqual([{ contactId: 'contact-1', companyId: null }]);
    await expect(page.getByRole('region', { name: 'People' }).getByRole('link', { name: 'Rahul Das 1' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('region', { name: 'Leads' }).getByText('Conference hall')).toHaveCount(0);
  });

  test('puts another contact in the company, found by search', async ({ page, pretendApi }) => {
    await page.goto('/companies/company-2');
    await expect(page.getByText('Nobody is in this company yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Add a person' }).click();
    await page.getByLabel('Find a person').fill('Priya');
    await page.getByRole('button', { name: /Priya Menon/ }).click();
    await expect(page.getByText('Priya Menon is now in this company.')).toBeVisible();
    expect(pretendApi.companies.linkedContacts).toEqual([{ contactId: 'contact-priya', companyId: 'company-2' }]);
    await expect(
      page.getByRole('region', { name: 'People' }).getByRole('link', { name: 'Priya Menon' }),
    ).toBeVisible();
  });

  test('says in plain words when the company is not there', async ({ page }) => {
    await page.goto('/companies/company-missing');
    await expect(page.getByText('Company not found')).toBeVisible();
    await page.getByRole('link', { name: 'Back to companies' }).click();
    await expect(page).toHaveURL(/\/companies$/);
  });

  test('shows an error with a retry when the company cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.companies.fails = true;
    await page.goto('/companies/company-1');
    await expect(page.getByText('We could not load this company')).toBeVisible();
    pretendApi.companies.fails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Infosys HR', level: 2 })).toBeVisible();
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/companies/company-1');
    await expect(page.getByRole('heading', { name: 'Infosys HR', level: 2 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});

test.describe('Company box on a contact', () => {
  test('shows the company the contact is in, with a link to its page', async ({ page }) => {
    await page.goto('/contacts/contact-0');
    const box = page.getByRole('region', { name: 'Company' });
    await expect(box.getByRole('link', { name: 'Infosys HR' })).toBeVisible();
    await expect(box.getByText('infosys.com · Bengaluru')).toBeVisible();
    await box.getByRole('link', { name: 'Infosys HR' }).click();
    await expect(page).toHaveURL(/\/companies\/company-1$/);
  });

  test('takes the contact out of its company', async ({ page, pretendApi }) => {
    await page.goto('/contacts/contact-0');
    await page.getByRole('button', { name: 'Take out of company' }).click();
    await expect(page.getByText('This person is not in a company yet.')).toBeVisible();
    expect(pretendApi.companies.linkedContacts).toEqual([{ contactId: 'contact-0', companyId: null }]);
  });

  test('offers the company whose domain matches a work email, and links it with one press', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.companies.contactCompany['contact-0'] = null;
    pretendApi.companies.companies[0]!['domain'] = 'example.com';
    await page.goto('/contacts/contact-0');
    await expect(page.getByText('Their email ends in example.com, which is Infosys HR.')).toBeVisible();
    await page.getByRole('button', { name: 'Put in Infosys HR' }).click();
    await expect(page.getByRole('link', { name: 'Infosys HR' })).toBeVisible();
    expect(pretendApi.companies.linkedContacts).toEqual([{ contactId: 'contact-0', companyId: 'company-1' }]);
  });

  test('offers nothing when no company has the email’s domain', async ({ page, pretendApi }) => {
    pretendApi.companies.contactCompany['contact-0'] = null;
    await page.goto('/contacts/contact-0');
    await expect(page.getByText('This person is not in a company yet.')).toBeVisible();
    await expect(page.getByText(/Their email ends in/)).toHaveCount(0);
  });

  test('changes the company by searching, and can cancel', async ({ page, pretendApi }) => {
    await page.goto('/contacts/contact-0');
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await page.getByLabel('Find a company').fill('kochi');
    await page.getByRole('button', { name: /Nair Travels/ }).click();
    expect(pretendApi.companies.linkedContacts).toEqual([{ contactId: 'contact-0', companyId: 'company-2' }]);
    await expect(page.getByRole('link', { name: 'Nair Travels' })).toBeVisible();
  });

  test('says in plain words when the change is refused', async ({ page, pretendApi }) => {
    pretendApi.companies.refusal = { status: 404, code: 'NOT_FOUND', message: "That company wasn't found." };
    await page.goto('/contacts/contact-0');
    await page.getByRole('button', { name: 'Take out of company' }).click();
    await expect(page.getByRole('alert')).toContainText('That company is not there any more.');
  });
});
