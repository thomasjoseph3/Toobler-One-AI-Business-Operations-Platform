import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Knowledge base → Business profile in a real browser, at phone and desktop size, against a pretend API (e2e/pretend-knowledge.ts).

test.describe('Business profile', () => {
  test('shows how complete the profile is, every section, and the answers with their state', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Knowledge base');
    // 3 of 9 counted questions are confirmed (the website question, the hours and the policy): 33%
    await expect(page.getByText('33% complete')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Profile completeness' })).toHaveAttribute('aria-valuenow', '33');
    await expect(page.getByText('3 of 9 answered')).toBeVisible();
    await expect(page.getByText('Still needed before you can go live:')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: /^What do you sell\?$/ })).toBeVisible();
    for (const heading of ['Where can we learn about you?', 'About your business', 'What you sell', 'Your policies']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(page.getByText('Mon: 09:00 to 18:00')).toBeVisible();
    await expect(page.getByText('Free cancellation up to 48 hours before.')).toBeVisible();
    await expect(page.getByText('Answer this in What you sell')).toBeVisible(); // answered in another feature
    await expect(page.getByRole('link', { name: 'Open What you sell' }).first()).toHaveAttribute('href', '/knowledge/what-you-sell');
  });

  test('marks an answer from the website "Please check" and says where it came from', async ({ page }) => {
    await page.goto('/knowledge');
    const row = page.getByRole('listitem').filter({ hasText: 'What do customers call your business?' });
    await expect(row.getByText('Please check')).toBeVisible();
    await expect(row.getByText('From your website')).toBeVisible();
    await expect(row.getByText('Nair Stays')).toBeVisible();
    await expect(page.getByText('1 answer from your website is waiting for you to check it.')).toBeVisible();
  });

  test('Yes confirms a waiting answer, and the warning goes away', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Yes: What do customers call your business?' }).click();
    await expect(page.getByText('Please check')).toHaveCount(0);
    expect(pretendApi.knowledge.confirmedKeys).toEqual([['business_name']]);
    await expect(page.getByText(/waiting for you to check/)).toHaveCount(0);
    await expect(page.getByText('44% complete')).toBeVisible(); // 4 of 9
  });

  test('"Yes to all" confirms every waiting answer at once', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Yes to all' }).click();
    await expect(page.getByText(/waiting for you to check/)).toHaveCount(0);
    expect(pretendApi.knowledge.confirmedKeys).toEqual([['business_name']]);
  });

  test('Change opens an editor with the current answer, and Save sends the new one', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Change: What do customers call your business?' }).click();
    const box = page.getByLabel('What do customers call your business?', { exact: true });
    await expect(box).toHaveValue('Nair Stays');
    await box.fill('Nair Stays Kovalam');
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('Nair Stays Kovalam')).toBeVisible();
    expect(pretendApi.knowledge.savedAnswers).toEqual([{ key: 'business_name', value: 'Nair Stays Kovalam' }]);
    await expect(page.getByText('Please check')).toHaveCount(0); // a typed answer is confirmed at once
  });

  test('checks on the device first, and shows the API’s own words when it refuses', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Answer: What does your business do, in one or two lines?' }).click();
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('Please type an answer.')).toBeVisible();
    expect(pretendApi.knowledge.savedAnswers).toEqual([]); // nothing was sent

    pretendApi.knowledge.answerRefusal = 'That is too long';
    await page.getByLabel('What does your business do, in one or two lines?', { exact: true }).fill('A homestay');
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('That is too long')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('form')).toHaveCount(0);
  });

  test('opening hours: tick a day, set the times, save', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: "Change: Opening hours, and days you're closed" }).click();
    await page.getByRole('checkbox', { name: 'Tuesday' }).check();
    await page.getByLabel('Tuesday: Opens').fill('10:00');
    await page.getByLabel('Tuesday: Closes').fill('16:30');
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('Tue: 10:00 to 16:30')).toBeVisible();
    expect(pretendApi.knowledge.savedAnswers[0]).toEqual({
      key: 'opening_hours',
      value: { days: { mon: { open: '09:00', close: '18:00' }, tue: { open: '10:00', close: '16:30' } } },
    });
  });

  test('a list answer: add rows, and an incomplete row is refused', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Answer: Phone numbers and email customers can use' }).click();
    await page.getByLabel('Number or address (Row 1)').fill('+91 98470 12345');
    await page.getByRole('button', { name: 'Add a row' }).click();
    await page.getByLabel('Kind (Row 2)').selectOption('Email');
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('Number or address is needed in every row.')).toBeVisible();
    await page.getByLabel('Number or address (Row 2)').fill('hello@nairstays.example');
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('Phone · +91 98470 12345')).toBeVisible();
    expect(pretendApi.knowledge.savedAnswers[0]).toEqual({
      key: 'contact_details',
      value: { rows: [{ kind: 'Phone', value: '+91 98470 12345' }, { kind: 'Email', value: 'hello@nairstays.example' }] },
    });
  });

  test('a pick-several answer', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Answer: Which languages do your customers speak?' }).click();
    await page.getByRole('checkbox', { name: 'English' }).check();
    await page.getByRole('checkbox', { name: 'Hindi' }).check();
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect(page.getByText('English, Hindi')).toBeVisible();
    expect(pretendApi.knowledge.savedAnswers[0]).toEqual({ key: 'customer_languages', value: { choices: ['English', 'Hindi'] } });
  });

  test('only one question is edited at a time', async ({ page }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Answer: What does your business do, in one or two lines?' }).click();
    await page.getByRole('button', { name: 'Answer: Which languages do your customers speak?' }).click();
    await expect(page.getByRole('form')).toHaveCount(1);
    await expect(page.getByRole('form', { name: 'Answer for: Which languages do your customers speak?' })).toBeVisible();
  });
});

test.describe('Read my website', () => {
  test('starts a reading, says it is working, then shows what it found and the suggestions', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByLabel('Your website address').fill('nairstays.example');
    await page.getByRole('button', { name: 'Read my website' }).click();
    await expect(page.getByText(/Reading your website/)).toBeVisible();
    expect(pretendApi.knowledge.startedReadings).toEqual([{ websiteUrl: 'nairstays.example' }]);
    await expect(page.getByText('Done. We read 3 pages and found 1 answers to check.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1 answers you already confirmed were left as they are.')).toBeVisible();
    // The answer it found now waits for the owner's Yes
    const row = page.getByRole('listitem').filter({ hasText: 'What does your business do, in one or two lines?' });
    await expect(row.getByText('Please check')).toBeVisible();
    await expect(row.getByText('A family homestay by the sea.')).toBeVisible();
    await expect(page.getByText('Things your website seems to sell')).toBeVisible();
    await expect(page.getByText('Sea view room · from ₹2500')).toBeVisible();
    await expect(page.getByText('Yoga class', { exact: true })).toBeVisible();
  });

  test('says why a reading failed, in plain words', async ({ page, pretendApi }) => {
    pretendApi.knowledge.readingOutcome = 'failed';
    await page.goto('/knowledge');
    await page.getByLabel('Your website address').fill('slow.example');
    await page.getByRole('button', { name: 'Read my website' }).click();
    await expect(page.getByText(/We could not read that website. The website took too long to answer./)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Read my website' })).toBeEnabled();
  });

  test('shows the API’s refusal (a private address) and asks for an address when the box is empty', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Read my website' }).click();
    await expect(page.getByText('Enter your website address.')).toBeVisible();
    expect(pretendApi.knowledge.startedReadings).toEqual([]);
    pretendApi.knowledge.readingRefusal = { status: 400, code: 'WEBSITE_NOT_PUBLIC', message: "That address can't be read: it isn't a public website." };
    await page.getByLabel('Your website address').fill('http://localhost');
    await page.getByRole('button', { name: 'Read my website' }).click();
    await expect(page.getByText("That address can't be read: it isn't a public website.")).toBeVisible();
  });
});

test.describe('Settings and situations', () => {
  test('saves only what changed, and checks the callback minutes first', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    const minutes = page.getByLabel('Call a customer back within (minutes)');
    await expect(minutes).toHaveValue('15');
    await minutes.fill('3');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Between 5 and 120/ })).toBeVisible();
    expect(pretendApi.knowledge.savedSettings).toEqual([]);
    await minutes.fill('30');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(pretendApi.knowledge.savedSettings).toEqual([{ callbackPromiseMinutes: 30 }]);
  });

  test('changes how a situation is handled; a fixed one cannot be changed', async ({ page, pretendApi }) => {
    await page.goto('/knowledge');
    await expect(page.getByText('(Ready-picked)')).toBeVisible();
    await page.getByRole('radio', { name: 'Prices are fixed' }).check();
    await expect.poll(() => pretendApi.knowledge.chosenSituations).toEqual([{ key: 'discount_request', choice: 'prices_are_fixed' }]);
    await expect(page.getByText('The same for every business')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Apologise, pass to the manager and raise a ticket' })).toBeDisabled();
  });
});

test.describe('Staff and problems', () => {
  test('staff can read the profile but not change anything', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/knowledge');
    await expect(page.getByText('Only managers can change these answers.')).toBeVisible();
    await expect(page.locator('#main-content').getByText('Nair Stays', { exact: true })).toBeVisible();
    for (const name of ['Change', 'Answer', 'Yes', 'Yes to all', 'Read my website', 'Save']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0);
    }
    await expect(page.getByLabel('Your website address')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Prices are fixed' })).toBeDisabled();
  });

  test('shows an error with a retry when the profile cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.knowledge.questionsFail = true;
    await page.goto('/knowledge');
    await expect(page.getByText('We could not load your business profile')).toBeVisible();
    pretendApi.knowledge.questionsFail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('33% complete')).toBeVisible();
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page.getByText('33% complete')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
