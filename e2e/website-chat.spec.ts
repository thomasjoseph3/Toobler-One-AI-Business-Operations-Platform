import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The website chat in a real browser: the loader on a customer's page, the chat window in its iframe, at phone and desktop size. The chat
// service behind it is pretend (e2e/widget-fixture/server.ts); the real service's rules are tested in apps/api.

const SERVICE = 'http://127.0.0.1:3200';
const ALLOWED_WEBSITE = 'http://127.0.0.1:3201';
const OTHER_WEBSITE = 'http://127.0.0.1:3202';
const WIDGET_KEY = 'wk_abcdefghijklmnopqrstuvwxyz012345';

/** The chat window inside the bubble's iframe, after opening it. */
async function openChat(page: Page) {
  await page.goto(ALLOWED_WEBSITE);
  await page.getByRole('button', { name: 'Chat with us' }).click();
  return page.frameLocator('iframe[title="Chat with our AI assistant"]');
}

test('the bubble appears on an allowed website, with the Call and WhatsApp links', async ({ page }) => {
  await page.goto(ALLOWED_WEBSITE);
  await expect(page.getByRole('button', { name: 'Chat with us' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919847012345');
  const whatsapp = page.getByRole('link', { name: 'Chat with us on WhatsApp' });
  await expect(whatsapp).toHaveAttribute('href', 'https://wa.me/919847099999?text=Hello');
  await expect(whatsapp).toHaveAttribute('target', '_blank');
  await expect(whatsapp).toHaveAttribute('rel', /noopener/);
});

test('the bubble does not appear on a website that is not allowed', async ({ page }) => {
  await page.goto(OTHER_WEBSITE);
  // The loader asks the chat service, is refused (the website is not on the list), and so adds nothing to the page
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Chat with us' })).toHaveCount(0);
  await expect(page.locator('[data-toobler-chat]')).toHaveCount(0);
});

test('the chat opens with the greeting and says it is an AI assistant', async ({ page }) => {
  const chat = await openChat(page);
  await expect(chat.getByText('AI assistant')).toBeVisible();
  await expect(chat.getByText('Welcome to Nair Stays! Ask me anything.')).toBeVisible();
});

test('a message gets a reply', async ({ page }) => {
  const chat = await openChat(page);
  await chat.getByLabel('Your message').fill('Do you have parking?');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByText('You said: Do you have parking?')).toBeVisible();
  await expect(chat.getByLabel('Your message')).toHaveValue('');
});

test('Enter sends and Shift+Enter makes a new line', async ({ page }) => {
  const chat = await openChat(page);
  const box = chat.getByLabel('Your message');
  await box.fill('first line');
  await box.press('Shift+Enter');
  await box.pressSequentially('second line');
  await box.press('Enter');
  await expect(chat.getByText('You said: first line', { exact: false })).toBeVisible();
});

test('a reload carries on the same chat', async ({ page }) => {
  const chat = await openChat(page);
  await chat.getByLabel('Your message').fill('Remember me');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByText('You said: Remember me')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Chat with us' }).click();
  const reopened = page.frameLocator('iframe[title="Chat with our AI assistant"]');
  await expect(reopened.locator('.chat-bubble-customer')).toContainText('Remember me');
  await expect(reopened.getByText('You said: Remember me')).toBeVisible();
});

test('"End chat" starts a clean chat', async ({ page }) => {
  const chat = await openChat(page);
  await chat.getByLabel('Your message').fill('Old words');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByText('You said: Old words')).toBeVisible();
  await chat.getByRole('button', { name: 'End chat' }).click();
  await expect(chat.getByText('You said: Old words')).toHaveCount(0);
  await expect(chat.getByText('Welcome to Nair Stays! Ask me anything.')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Chat with us' }).click();
  const reopened = page.frameLocator('iframe[title="Chat with our AI assistant"]');
  await expect(reopened.getByText('Welcome to Nair Stays! Ask me anything.')).toBeVisible();
  await expect(reopened.getByText('Old words')).toHaveCount(0);
});

test('the close button and Escape hide the window', async ({ page }) => {
  const chat = await openChat(page);
  await chat.getByRole('button', { name: 'Close chat window' }).click();
  await expect(page.locator('iframe[title="Chat with our AI assistant"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Chat with us' })).toBeVisible();

  await page.getByRole('button', { name: 'Chat with us' }).click();
  const reopened = page.frameLocator('iframe[title="Chat with our AI assistant"]');
  await reopened.getByLabel('Your message').press('Escape');
  await expect(page.locator('iframe[title="Chat with our AI assistant"]')).toBeHidden();
});

test('a failed reply is said in plain words, and the message is given back to send again', async ({ page }) => {
  const chat = await openChat(page);
  await chat.getByLabel('Your message').fill('FAIL-Will this work?');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByRole('alert')).toHaveText("Sorry, I can't answer right now. Please try again in a moment.");
  await expect(chat.getByRole('alert')).not.toContainText('Technical words');
  await expect(chat.getByLabel('Your message')).toHaveValue('FAIL-Will this work?');
  // Sending the same words again fails again the same way, so the visitor can also change them and send
  await chat.getByLabel('Your message').fill('Will this work now?');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByText('You said: Will this work now?')).toBeVisible();
});

test('the window fits the screen: full screen on a phone, a corner window on a desktop', async ({ page }, testInfo) => {
  await openChat(page);
  const frameBox = await page.locator('iframe[title="Chat with our AI assistant"]').boundingBox();
  const viewport = page.viewportSize();
  expect(frameBox).not.toBeNull();
  if (testInfo.project.name === 'phone') {
    expect(frameBox?.width).toBe(viewport?.width);
    expect(frameBox?.height).toBe(viewport?.height);
  } else {
    expect(frameBox?.width).toBe(380);
    expect((frameBox?.x ?? 0) + (frameBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) - 16);
  }
});

test('the chat window has no accessibility violations', async ({ page }) => {
  await page.goto(`${SERVICE}/widget/chat?key=${WIDGET_KEY}`);
  await expect(page.getByText('Welcome to Nair Stays! Ask me anything.')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
