import AxeBuilder from '@axe-core/playwright';
import { conversationDetail, inboxItem } from './pretend-inbox';
import { PRETEND_PROFILE, expect, test } from './support';

test.describe('Inbox', () => {
  test('lists conversations with needs-a-person marked, filters by channel and "held by me", and is accessible', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.inbox.items = [
      inboxItem({
        id: 'c1',
        needsPerson: true,
        contact: { id: 'k1', name: 'Priya Menon' },
        preview: 'I want to speak to someone',
      }),
      inboxItem({
        id: 'c2',
        channel: 'whatsapp',
        fromPhone: '+971501234567',
        aiUnsure: true,
        type: { key: 'complaint', label: 'Complaint' },
      }),
      inboxItem({
        id: 'c3',
        heldBy: { userId: PRETEND_PROFILE.user.id, name: 'Anita Nair' },
        fromEmail: 'guest@example.com',
        channel: 'email',
      }),
    ];
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: 'Inbox', level: 2 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Priya Menon/ })).toContainText('Needs a person');
    await expect(page.getByRole('link', { name: /\+971501234567/ })).toContainText('AI unsure');
    await expect(page.getByRole('link', { name: /guest@example.com/ })).toContainText('Held by Anita Nair');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);

    await page.getByRole('button', { name: 'WhatsApp' }).click();
    await expect(page).toHaveURL(/channel=whatsapp/);
    await expect(page.getByRole('link', { name: /Priya Menon/ })).toHaveCount(0);
    await page.getByRole('button', { name: /WhatsApp/ }).click();
    await expect(page).not.toHaveURL(/channel=whatsapp/);
    await page.getByRole('button', { name: 'Held by me' }).click();
    await expect(page).toHaveURL(/held=me/);
    await expect(page.getByRole('link', { name: /guest@example.com/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Held by me/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('has an empty state, and an error with a retry', async ({ page, pretendApi }) => {
    await page.goto('/inbox');
    await expect(page.getByText('No conversations here')).toBeVisible();
    pretendApi.inbox.listFails = true;
    await page.reload();
    await expect(page.getByText('We could not load the inbox')).toBeVisible();
    pretendApi.inbox.listFails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No conversations here')).toBeVisible();
  });

  test('catches up by itself when the live stream comes back', async ({ page, pretendApi }) => {
    pretendApi.inbox.items = [inboxItem({ id: 'c1', contact: { id: 'k1', name: 'Priya Menon' } })];
    await page.goto('/inbox');
    await expect(page.getByRole('link', { name: /Priya Menon/ })).toBeVisible();
    // A new conversation arrives; the pretend stream ends and reconnects, and the page refetches without being asked
    pretendApi.inbox.items = [
      ...pretendApi.inbox.items,
      inboxItem({ id: 'c2', contact: { id: 'k2', name: 'Rahul Nair' } }),
    ];
    await expect(page.getByRole('link', { name: /Rahul Nair/ })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('One conversation', () => {
  test('takes over (the reply box appears), replies, and hands back after "Are you sure?"', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.inbox.items = [inboxItem({ id: 'c1' })];
    pretendApi.inbox.details['c1'] = conversationDetail({ id: 'c1' });
    await page.goto('/inbox/c1');
    await expect(page.getByText('Yes, our main hall seats 250.')).toBeVisible();
    await expect(page.getByText('The AI is answering.')).toBeVisible();
    await expect(page.getByLabel('Your reply')).toHaveCount(0);

    await page.getByRole('button', { name: 'I’ll handle this' }).click();
    await expect(page.getByText('You are handling this conversation. The AI is not answering.')).toBeVisible();
    await page.getByLabel('Your reply').fill('I will call you in five minutes.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('I will call you in five minutes.')).toBeVisible();
    expect(pretendApi.inbox.replies).toEqual([{ id: 'c1', body: 'I will call you in five minutes.' }]);

    await page.getByRole('button', { name: 'Hand back to AI' }).click();
    await expect(
      page.getByRole('dialog').getByText('Hand the conversation with Unknown visitor back to the AI?'),
    ).toBeVisible();
    expect(pretendApi.inbox.handbacks).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Hand back to AI' }).click();
    await expect(page.getByText('The AI is answering.')).toBeVisible();
    expect(pretendApi.inbox.handbacks).toEqual(['c1']);
  });

  test('says in words that someone else holds it, and cannot be taken over', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    pretendApi.inbox.details['c1'] = conversationDetail({
      id: 'c1',
      heldBy: { userId: 'someone-else', name: 'Rahul Staff' },
    });
    await page.goto('/inbox/c1');
    await expect(page.getByText('Rahul Staff is handling this conversation. The AI is not answering.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I’ll handle this' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hand back to AI' })).toHaveCount(0);
    await expect(page.getByText('Only the person handling this conversation can reply.')).toBeVisible();
  });

  test("shows the API's own words when a takeover is refused", async ({ page, pretendApi }) => {
    pretendApi.inbox.details['c1'] = conversationDetail({ id: 'c1' });
    pretendApi.inbox.takeoverRefusal = {
      status: 409,
      code: 'HELD_BY_SOMEONE_ELSE',
      message: 'Rahul Staff is already handling this conversation.',
    };
    await page.goto('/inbox/c1');
    await page.getByRole('button', { name: 'I’ll handle this' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Rahul Staff is already handling' })).toBeVisible();
  });

  test('marks it done after "Are you sure?", and shows an error with a retry for a missing conversation', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.inbox.details['c1'] = conversationDetail({ id: 'c1' });
    await page.goto('/inbox/c1');
    await page.getByRole('button', { name: 'Mark as done' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as done' }).click();
    await expect(page.getByText('Done', { exact: true })).toBeVisible();
    expect(pretendApi.inbox.dones).toEqual(['c1']);
    await page.goto('/inbox/missing');
    await expect(page.getByText('We could not load this conversation')).toBeVisible();
  });

  test('works on a phone without sideways scrolling and has no accessibility problems', async ({
    page,
    pretendApi,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    pretendApi.inbox.details['c1'] = conversationDetail({
      id: 'c1',
      heldBy: { userId: PRETEND_PROFILE.user.id, name: 'Anita Nair' },
    });
    await page.goto('/inbox/c1');
    await expect(page.getByLabel('Your reply')).toBeVisible();
    const hasSideScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasSideScroll).toBe(false);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  });
});
