import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Test the agent in a real browser, at phone and desktop size, against a pretend agent (e2e/pretend-agent.ts).

test.describe('Test the agent', () => {
  test('opens with an invitation to chat and nothing the agent has done yet', async ({ page }) => {
    await page.goto('/knowledge/test-agent');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test the agent');
    await expect(page.getByText(/Say hello, or ask something a customer would ask/)).toBeVisible();
    await expect(page.getByText('Send a message and what the agent did will show here.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Back to the business profile' })).toHaveAttribute(
      'href',
      '/knowledge',
    );
  });

  test('sends a message, shows the reply, and shows what the agent did', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('How much is a deluxe room, what is the price?');
    await page.getByRole('button', { name: 'Send' }).click();
    const chat = page.getByRole('log', { name: 'Test chat' });
    await expect(chat.getByText('How much is a deluxe room, what is the price?')).toBeVisible();
    await expect(chat.getByText('A deluxe room is from ₹4,000 a night plus GST.')).toBeVisible();
    await expect(page.getByLabel('Your message as the customer')).toHaveValue('');
    expect(pretendApi.agent.sent).toEqual([{ message: 'How much is a deluxe room, what is the price?' }]);
    // What the agent did: its source (once, even though it was listed twice), its step in words
    await expect(page.getByText('What the customer has told it')).toBeVisible();
    await expect(page.getByText('What you sell: Offerings and offers')).toHaveCount(1);
    await expect(page.getByText('Looked at what you sell')).toBeVisible();
    await expect(page.getByText('No promise yet. It makes one once it can reach the customer.')).toBeVisible();
  });

  test('carries on the same chat, and shows what the customer told it and the one promise with its due time', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('Hello');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
    await page.getByLabel('Your message as the customer').fill('I am Ravi, 98470 12345');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(
      page.getByText('Thank you, Ravi. Our team will call you within 15 minutes.', { exact: true }).first(),
    ).toBeVisible();
    // The second message carries the chat's id, so it is the same chat
    expect(pretendApi.agent.sent[1]?.conversationId).toBeTruthy();
    await expect(page.getByText('Ravi', { exact: true })).toBeVisible(); // what it learned
    await expect(page.getByText('98470 12345', { exact: true })).toBeVisible();
    await expect(page.getByText('“Our team will call you within 15 minutes.”')).toBeVisible();
    await expect(page.getByText('Due: 15:45 on 17 Nov')).toBeVisible(); // 10:15 UTC in the business's time zone (India)
    await expect(page.getByText('Saved what the customer told it')).toBeVisible();
    await expect(page.getByText(/something_new/)).toBeVisible(); // a step with no words is shown by its own name
    await expect(page.getByText('(did not work)')).toBeVisible();
  });

  test('warns about an amount the agent tried to say that nobody confirmed', async ({ page }) => {
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('What is the total for 3 nights?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /₹12000/ })).toBeVisible();
    await expect(page.getByText('FAQ: Do you have parking?')).toBeVisible();
  });

  test('Enter sends, Shift+Enter makes a new line', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/test-agent');
    const box = page.getByLabel('Your message as the customer');
    await box.fill('first line');
    await box.press('Shift+Enter');
    await box.pressSequentially('second line');
    expect(pretendApi.agent.sent).toEqual([]);
    await box.press('Enter');
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
    expect(pretendApi.agent.sent[0]?.message).toBe('first line\nsecond line');
  });

  test('puts the message back in the box when the agent cannot answer, and shows its plain words', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.agent.refusal = {
      status: 503,
      code: 'AI_NOT_AVAILABLE',
      message: 'No AI key is set up for this job yet.',
    };
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('Do you have parking?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('No AI key is set up for this job yet.')).toBeVisible();
    await expect(page.getByLabel('Your message as the customer')).toHaveValue('Do you have parking?');
    await expect(page.getByRole('log', { name: 'Test chat' }).getByText('Do you have parking?')).toHaveCount(0);
    // Trying again works
    pretendApi.agent.refusal = null;
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
  });

  test('says something general for any other failure, never a code', async ({ page, pretendApi }) => {
    pretendApi.agent.refusal = { status: 500, code: 'BOOM', message: 'internal detail' };
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('Hi');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('The agent could not answer just now. Please try again.')).toBeVisible();
    await expect(page.getByText('BOOM')).toHaveCount(0);
  });

  test('starts a new test chat from scratch', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('Hello');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
    await page.getByRole('button', { name: 'Start a new test chat' }).click();
    await expect(page.getByText(/Say hello, or ask something/)).toBeVisible();
    await page.getByLabel('Your message as the customer').fill('Hello again');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
    expect(pretendApi.agent.sent[1]?.conversationId).toBeUndefined(); // a new chat has no id yet
  });

  test('shows the summary the inbox would keep', async ({ page, pretendApi }) => {
    await page.goto('/knowledge/test-agent');
    await expect(page.getByRole('button', { name: 'Show the summary the inbox would keep' })).toHaveCount(0);
    await page.getByLabel('Your message as the customer').fill('Hello');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
    await page.getByRole('button', { name: 'Show the summary the inbox would keep' }).click();
    await expect(
      page.getByText('Ravi asked about a deluxe room and was promised a call within 15 minutes.'),
    ).toBeVisible();
    expect(pretendApi.agent.summariesAskedFor).toHaveLength(1);
  });

  test('having tried the agent finishes the setup step', async ({ page }) => {
    await page.goto('/setup');
    const step = page.getByRole('listitem').filter({ hasText: 'Try the AI agent' });
    await expect(step.getByText('To do')).toBeVisible();
    await step.getByRole('link', { name: /Try the agent now/ }).click();
    await expect(page).toHaveURL(/\/knowledge\/test-agent$/);
    await page.getByLabel('Your message as the customer').fill('Hello');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
    await page.goto('/setup');
    await expect(page.getByRole('listitem').filter({ hasText: 'Try the AI agent' }).getByText('Done')).toBeVisible();
  });

  test('is reachable from the business profile', async ({ page }) => {
    await page.goto('/knowledge');
    await page.getByRole('link', { name: 'Test the agent' }).click();
    await expect(page).toHaveURL(/\/knowledge\/test-agent$/);
  });

  test('has no accessibility problems', async ({ page }) => {
    await page.goto('/knowledge/test-agent');
    await page.getByLabel('Your message as the customer').fill('What is the price?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Looked at what you sell')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
