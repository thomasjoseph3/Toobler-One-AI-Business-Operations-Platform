import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Knowledge base → What you sell in a real browser, at phone and desktop size, against a pretend API (e2e/pretend-sales.ts).

const DELUXE_ID = '0191f0a0-0000-7000-8000-0000000000e1';
const YOGA_ID = '0191f0a0-0000-7000-8000-0000000000e2';

test.describe('What you sell: the offerings', () => {
  test('shows each offering with its price in words, its state and its details, and marks the page in the tabs', async ({
    page,
  }) => {
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What you sell');
    await expect(
      page.getByRole('navigation', { name: 'Knowledge base sections' }).getByRole('link', { name: 'What you sell' }),
    ).toHaveAttribute('aria-current', 'page');
    const deluxe = page.getByRole('listitem').filter({ hasText: 'Deluxe room' });
    await expect(deluxe.getByText('from ₹4,500 per night plus GST')).toBeVisible();
    await expect(deluxe.getByText('Sea view')).toBeVisible();
    await expect(deluxe.getByText('Includes: Breakfast')).toBeVisible();
    await expect(deluxe.getByText('Check-in')).toBeVisible();
    await expect(deluxe.getByText('On', { exact: true })).toBeVisible();
    const yoga = page.getByRole('listitem').filter({ hasText: 'Yoga class' });
    await expect(yoga.getByText('Switched off')).toBeVisible();
    await expect(yoga.getByText('No price shared. The AI says the team will confirm.')).toBeVisible();
  });

  test('switches one off and on, sending only that change', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Switch off: Deluxe room' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Deluxe room' }).getByText('Switched off')).toBeVisible();
    expect(pretendApi.sales.patchedOfferings).toEqual([{ id: DELUXE_ID, body: { active: false } }]);
    await page.getByRole('button', { name: 'Switch on: Deluxe room' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Deluxe room' }).getByText('On', { exact: true }),
    ).toBeVisible();
  });

  test('moves an offering up or down by sending the whole new order; the ends cannot move further', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByRole('button', { name: 'Move Deluxe room up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move Yoga class down' })).toBeDisabled();
    await page.getByRole('button', { name: 'Move Yoga class up' }).click();
    await expect.poll(() => pretendApi.sales.reorders).toEqual([[YOGA_ID, DELUXE_ID]]);
    const names = page.getByRole('heading', { level: 3 });
    await expect(names.first()).toHaveText('Yoga class');
  });

  test('adds something you sell with a "from" price, sending whole paise', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Add something you sell' }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Family suite');
    await page.getByRole('checkbox', { name: /I share a "from" price/ }).check();
    await page.getByLabel('From price (₹)').fill('6,000');
    await page.getByLabel('Price is', { exact: true }).selectOption('per person');
    await page.getByLabel('GST', { exact: true }).selectOption('included');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Family suite' })).toBeVisible();
    expect(pretendApi.sales.createdOfferings).toEqual([
      { name: 'Family suite', active: true, fromPricePaise: 600000, priceUnit: 'per person', gstMode: 'included' },
    ]);
    await expect(page.getByText('from ₹6,000 per person including GST')).toBeVisible();
  });

  test('checks the form on the device first: a shared price needs its number, unit and GST note', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Add something you sell' }).first().click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Give it a name.')).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Spa');
    await page.getByRole('checkbox', { name: /I share a "from" price/ }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Use a price like 4500.')).toBeVisible();
    await expect(page.getByText('Say whether the price includes GST.')).toBeVisible();
    expect(pretendApi.sales.createdOfferings).toEqual([]);
  });

  test('changes only what changed, and can take the price away', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Edit Deluxe room' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Deluxe room');
    await expect(page.getByLabel('From price (₹)')).toHaveValue('4500');
    await page.getByLabel('Name', { exact: true }).fill('Deluxe sea-view room');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Deluxe sea-view room' })).toBeVisible();
    expect(pretendApi.sales.patchedOfferings).toEqual([{ id: DELUXE_ID, body: { name: 'Deluxe sea-view room' } }]);

    await page.getByRole('button', { name: 'Edit Deluxe sea-view room' }).click();
    await page.getByRole('checkbox', { name: /I share a "from" price/ }).uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('No price shared. The AI says the team will confirm.').first()).toBeVisible();
    expect(pretendApi.sales.patchedOfferings[1]).toEqual({ id: DELUXE_ID, body: { fromPricePaise: null } });
  });

  test('shows the API’s own words when it refuses (a name already used), and keeps what was typed', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.sales.refusal = {
      status: 409,
      code: 'OFFERING_EXISTS',
      message: 'You already have something with that name.',
    };
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Add something you sell' }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Deluxe room');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('You already have something with that name.')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Deluxe room');
  });

  test('asks "Are you sure?" naming it before deleting, and Cancel keeps it', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Delete Yoga class' }).click();
    await expect(page.getByRole('dialog').getByText('Delete Yoga class?')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.sales.deletedOfferingIds).toEqual([]);
    await page.getByRole('button', { name: 'Delete Yoga class' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Yoga class' })).toHaveCount(0);
    expect(pretendApi.sales.deletedOfferingIds).toEqual([YOGA_ID]);
  });

  test('has an empty state with a way to add the first one', async ({ page, pretendApi }) => {
    pretendApi.sales.offerings = [];
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByText('Nothing added yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add something you sell' }).first()).toBeVisible();
  });
});

test.describe('What you sell: suggestions from the website', () => {
  test('offers what the reading found, fills the form for the owner to check, and adds it', async ({
    page,
    pretendApi,
  }) => {
    // A reading on the profile page (this browser remembers it)
    await page.goto('/knowledge');
    await page.getByLabel('Your website address').fill('nairstays.example');
    await page.getByRole('button', { name: 'Read my website' }).click();
    await expect(page.getByText(/Done. We read 3 pages/)).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('navigation', { name: 'Knowledge base sections' })
      .getByRole('link', { name: 'What you sell' })
      .click();

    await expect(page.getByText('Your website seems to sell these')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Sea view room' })).toBeVisible();
    await expect(page.getByText('from ₹2500').first()).toBeVisible();
    // "Yoga class" is already an offering, so it is not offered again
    await expect(page.getByRole('button', { name: 'Add Yoga class' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add Sea view room' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Sea view room');
    await expect(page.getByLabel('From price (₹)')).toHaveValue('2500');
    // The unit and GST note are left for the owner: nothing is guessed
    await page.getByLabel('Price is', { exact: true }).selectOption('per night');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Say whether the price includes GST.')).toBeVisible();
    await page.getByLabel('GST', { exact: true }).selectOption('plus');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Sea view room' })).toBeVisible();
    expect(pretendApi.sales.createdOfferings[0]).toMatchObject({
      name: 'Sea view room',
      fromPricePaise: 250000,
      priceUnit: 'per night',
      gstMode: 'plus',
    });
    await expect(page.getByText('Your website seems to sell these')).toHaveCount(0); // nothing left to suggest
  });

  test('lets the owner dismiss a suggestion', async ({ page }) => {
    await page.goto('/knowledge');
    await page.getByLabel('Your website address').fill('nairstays.example');
    await page.getByRole('button', { name: 'Read my website' }).click();
    await expect(page.getByText(/Done. We read 3 pages/)).toBeVisible({ timeout: 10_000 });
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Not Sea view room' }).click();
    await expect(page.getByText('Your website seems to sell these')).toHaveCount(0);
  });

  test('offers nothing when no reading was started in this browser', async ({ page }) => {
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByText('Your website seems to sell these')).toHaveCount(0);
  });
});

test.describe('What you sell: the offers', () => {
  test('shows what is on now, and the ended ones only when asked', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/what-you-sell');
    const offers = page.getByRole('heading', { name: 'Offers running now' }).locator('../..');
    await expect(offers.getByText('December: 10% off')).toBeVisible();
    await expect(offers.getByText('Until 31 Dec 2099')).toBeVisible();
    await expect(offers.getByText('Old promotion')).toHaveCount(0);
    await offers.getByRole('checkbox', { name: 'Show offers that have ended' }).check();
    await expect(offers.getByText('Old promotion')).toBeVisible();
    await expect(offers.getByText('Ended', { exact: true })).toBeVisible();
    expect(pretendApi.sales.offerQueries.some((query) => query.includes('include=expired'))).toBe(true);
  });

  test('adds an offer, refuses a last day in the past, and sends the date as a plain date', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Add an offer' }).click();
    await page.getByLabel('What is the offer?').fill('Monsoon: free breakfast');
    await page.getByLabel('Last day').fill('2000-01-01');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('The last day cannot be in the past.')).toBeVisible();
    expect(pretendApi.sales.createdOffers).toEqual([]);
    await page.getByLabel('Last day').fill('2099-09-30');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Monsoon: free breakfast')).toBeVisible();
    expect(pretendApi.sales.createdOffers).toEqual([{ text: 'Monsoon: free breakfast', endsOn: '2099-09-30' }]);
  });

  test('changes the last day of an offer, sending only that, and deletes after "Are you sure?"', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/knowledge/what-you-sell');
    await page.getByRole('button', { name: 'Edit offer: December: 10% off' }).click();
    await page.getByLabel('Last day').fill('2100-01-15');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Until 15 Jan 2100')).toBeVisible();
    expect(pretendApi.sales.patchedOffers).toEqual([
      { id: '0191f0a0-0000-7000-8000-0000000000f1', body: { endsOn: '2100-01-15' } },
    ]);

    await page.getByRole('button', { name: 'Delete offer: December: 10% off' }).click();
    await expect(page.getByRole('dialog').getByText('Delete this offer?')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/December: 10% off/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('December: 10% off')).toHaveCount(0);
    expect(pretendApi.sales.deletedOfferIds).toHaveLength(1);
  });
});

test.describe('What you sell: staff and problems', () => {
  test('staff can read everything and change nothing', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByText('Only managers can change these.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deluxe room' })).toBeVisible();
    for (const name of [/Add something/, /^Edit/, /^Switch/, /^Delete/, /^Move/, /Add an offer/]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });

  test('shows an error with a retry when it cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.sales.offeringsFail = true;
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByText('We could not load what you sell')).toBeVisible();
    pretendApi.sales.offeringsFail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Deluxe room' })).toBeVisible();
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/knowledge/what-you-sell');
    await expect(page.getByRole('heading', { name: 'Deluxe room' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
