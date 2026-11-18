import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Knowledge base → FAQs in a real browser, at phone and desktop size, against a pretend API (e2e/pretend-faqs.ts).

const POOL_ID = '0191f0a0-0000-7000-8000-000000000b01';
const EV_ID = '0191f0a0-0000-7000-8000-000000000b02';
const PARKING_ID = '0191f0a0-0000-7000-8000-000000000a01';

test.describe('FAQs: questions the AI could not answer', () => {
  test('lists the open questions most asked first, with how often and when', async ({ page }) => {
    await page.goto('/knowledge/faqs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('FAQs');
    await expect(
      page.getByRole('navigation', { name: 'Knowledge base sections' }).getByRole('link', { name: 'FAQs' }),
    ).toHaveAttribute('aria-current', 'page');
    const unanswered = page.getByRole('heading', { name: 'Questions the AI could not answer' }).locator('..');
    const questions = unanswered.getByRole('listitem');
    await expect(questions).toHaveCount(2);
    await expect(questions.first()).toContainText('Is there an EV charger?'); // asked 3 times, so first
    await expect(questions.first()).toContainText('Asked 3 times');
    await expect(questions.first()).toContainText('Last asked 17 Nov 2026'); // 20:00 UTC on the 16th is already the 17th in India
    await expect(questions.nth(1)).toContainText('Asked once');
    await expect(unanswered.getByText('Do you take Amex?')).toHaveCount(0); // answered ones are history
  });

  test('answers a question: it becomes an FAQ, and leaves the list', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Answer: Is there an EV charger?' }).click();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Is there an EV charger?');
    await page.getByLabel('Answer', { exact: true }).fill('Yes, two chargers in the car park.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Answer: Is there an EV charger?' })).toHaveCount(0);
    expect(pretendApi.faqs.answered).toEqual([{ id: EV_ID, body: { answer: 'Yes, two chargers in the car park.' } }]); // the question was not reworded
    await expect(page.getByRole('heading', { name: 'Is there an EV charger?', level: 3 })).toBeVisible();
    await expect(page.getByText('From a customer question')).toBeVisible();
  });

  test('lets the owner reword the question when answering, and sends the new wording', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Answer: Do you have a swimming pool?' }).click();
    await page.getByLabel('Question', { exact: true }).fill('Is there a  swimming pool\nat the property?');
    await page.getByLabel('Answer', { exact: true }).fill('Yes, open 7 to 7.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByRole('heading', { name: 'Is there a swimming pool at the property?', level: 3 }),
    ).toBeVisible();
    expect(pretendApi.faqs.answered[0]).toEqual({
      id: POOL_ID,
      body: { answer: 'Yes, open 7 to 7.', question: 'Is there a swimming pool at the property?' },
    });
  });

  test('checks the form first: an answer is needed', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Answer: Is there an EV charger?' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Type the answer.')).toBeVisible();
    expect(pretendApi.faqs.answered).toEqual([]);
  });

  test('ignores a question', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Ignore: Do you have a swimming pool?' }).click();
    await expect(page.getByRole('button', { name: 'Ignore: Do you have a swimming pool?' })).toHaveCount(0);
    expect(pretendApi.faqs.dismissedIds).toEqual([POOL_ID]);
  });

  test('shows answered and ignored questions only when asked', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('checkbox', { name: 'Show answered and ignored questions' }).check();
    await expect(page.getByText('Do you take Amex?')).toBeVisible();
    await expect(page.getByText('Can I bring a drone?')).toBeVisible();
    await expect(page.getByText('Answered', { exact: true })).toBeVisible();
    await expect(page.getByText('Ignored', { exact: true })).toBeVisible();
    expect(pretendApi.faqs.unansweredQueries.some((query) => query.includes('include=history'))).toBe(true);
  });

  test('shows an empty state when nothing is waiting', async ({ page, pretendApi }) => {
    pretendApi.faqs.unanswered = [];
    await page.goto('/knowledge/faqs');
    await expect(page.getByText('Nothing waiting')).toBeVisible();
  });
});

test.describe('FAQs: the FAQs the AI uses', () => {
  test('lists each FAQ with where it came from, and marks a drafted one "Please check"', async ({ page }) => {
    await page.goto('/knowledge/faqs');
    const parking = page.getByRole('listitem').filter({ hasText: 'Do you have parking?' });
    await expect(parking.getByText('Yes, free parking for guests.')).toBeVisible();
    await expect(parking.getByText('Typed by your team')).toBeVisible();
    const pets = page.getByRole('listitem').filter({ hasText: 'Do you allow pets?' });
    await expect(pets.getByText('Please check')).toBeVisible();
    await expect(pets.getByText('From your website')).toBeVisible();
    await expect(pets.getByText(/The AI does not use this until you accept it/)).toBeVisible();
  });

  test('adds an FAQ, tidying the spaces in the question', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Add an FAQ' }).click();
    await page.getByLabel('Question', { exact: true }).fill('  What time   is check-in? ');
    await page.getByLabel('Answer', { exact: true }).fill('From 2 PM.\nEarlier on request.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'What time is check-in?', level: 3 })).toBeVisible();
    expect(pretendApi.faqs.createdFaqs).toEqual([
      { question: 'What time is check-in?', answer: 'From 2 PM.\nEarlier on request.' },
    ]);
  });

  test('shows the API’s own words when it refuses (an FAQ that already exists), and keeps what was typed', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.faqs.refusal = {
      status: 409,
      code: 'FAQ_EXISTS',
      message: 'You already have an FAQ with that question.',
    };
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Add an FAQ' }).click();
    await page.getByLabel('Question', { exact: true }).fill('Do you have parking?');
    await page.getByLabel('Answer', { exact: true }).fill('Yes.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('You already have an FAQ with that question.')).toBeVisible();
    await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Yes.');
  });

  test('changes only what changed; saving a drafted FAQ accepts it', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Edit FAQ: Do you have parking?' }).click();
    await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Yes, free parking for guests.');
    await page.getByLabel('Answer', { exact: true }).fill('Yes, free parking and EV charging.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Yes, free parking and EV charging.')).toBeVisible();
    expect(pretendApi.faqs.patchedFaqs).toEqual([
      { id: PARKING_ID, body: { answer: 'Yes, free parking and EV charging.' } },
    ]);

    await page.getByRole('button', { name: 'Edit FAQ: Do you allow pets?' }).click();
    await page.getByLabel('Answer', { exact: true }).fill('Small pets are welcome on a lead.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Please check')).toHaveCount(0);
  });

  test('asks "Are you sure?" naming the FAQ before deleting', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByRole('button', { name: 'Delete FAQ: Do you have parking?' }).click();
    await expect(page.getByRole('dialog').getByText(/"Do you have parking\?" will be removed/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.faqs.deletedFaqIds).toEqual([]);
    await page.getByRole('button', { name: 'Delete FAQ: Do you have parking?' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Do you have parking?', level: 3 })).toHaveCount(0);
    expect(pretendApi.faqs.deletedFaqIds).toEqual([PARKING_ID]);
  });

  test('has an empty state with a way to add the first FAQ', async ({ page, pretendApi }) => {
    pretendApi.faqs.faqs = [];
    await page.goto('/knowledge/faqs');
    await expect(page.getByText('No FAQs yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add an FAQ' })).toBeVisible();
  });
});

test.describe('FAQs: search, staff and problems', () => {
  test('shows which FAQ the AI’s search would find for a customer question', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/faqs');
    await page.getByLabel('A customer question').fill('Is there parking available?');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('The AI would find:')).toBeVisible();
    await expect(
      page.getByRole('region').or(page.locator('li')).filter({ hasText: 'Yes, free parking for guests.' }).first(),
    ).toBeVisible();
    expect(pretendApi.faqs.searches).toEqual(['Is there parking available?']);
    await page.getByLabel('A customer question').fill('Do you arrange helicopter rides?');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });

  test('anyone on the team can use it: staff see every button', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/knowledge/faqs');
    await expect(page.getByRole('button', { name: 'Add an FAQ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Answer: Is there an EV charger?' })).toBeVisible();
  });

  test('shows an error with a retry when it cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.faqs.faqsFail = true;
    await page.goto('/knowledge/faqs');
    await expect(page.getByText('We could not load your FAQs')).toBeVisible();
    pretendApi.faqs.faqsFail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Do you have parking?', level: 3 })).toBeVisible();
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/knowledge/faqs');
    await expect(page.getByRole('heading', { name: 'Do you have parking?', level: 3 })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
