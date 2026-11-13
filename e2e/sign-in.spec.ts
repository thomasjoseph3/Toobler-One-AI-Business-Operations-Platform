import { expect, test } from './support';

test.describe('signed-out visitors', () => {
  test('opening the app while signed out lands on the sign-in page, with no menu', async ({ page, pretendApi }) => {
    pretendApi.signedIn = false;
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  });

  test('the password is hidden as it is typed, and both fields have labels', async ({ page, pretendApi }) => {
    pretendApi.signedIn = false;
    await page.goto('/sign-in');
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
    await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
  });

  test('sending an empty form shows what is missing and does not call the server to sign in', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.signedIn = false;
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('something');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email address, like name@company.com.')).toBeVisible();
    expect(pretendApi.calls.filter((call) => call === 'POST /auth/login')).toHaveLength(0);
  });

  test('a wrong password shows the plain message and stays on the page', async ({ page, pretendApi }) => {
    pretendApi.signedIn = false;
    pretendApi.signInRefusal = {
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is not right.',
    };
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('anita@example.com');
    await page.getByLabel('Password').fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('The email or password is not right.');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled(); // can try again
  });

  test('a locked email and too many tries each get their own plain message', async ({ page, pretendApi }) => {
    pretendApi.signedIn = false;
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('anita@example.com');
    await page.getByLabel('Password').fill('whatever-123');

    pretendApi.signInRefusal = { status: 429, code: 'TOO_MANY_ATTEMPTS', message: 'x' };
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('locked for 15 minutes');

    pretendApi.signInRefusal = { status: 429, code: 'TOO_MANY_REQUESTS', message: 'x' };
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many tries from this device');
  });

  test('signing in sends the safety header, opens Today, and shows who is signed in', async ({
    page,
    pretendApi,
  }, testInfo) => {
    pretendApi.signedIn = false;
    await page.goto('/');
    await page.getByLabel('Email').fill('anita@example.com');
    await page.getByLabel('Password').fill('river-lamp-kettle-42');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    if (testInfo.project.name === 'desktop') {
      await expect(page.getByText('Anita Nair')).toBeVisible();
      await expect(page.getByText('Nair Stays')).toBeVisible();
    }
    expect(pretendApi.lastSignInHeaders['x-requested-with']).toBe('toobler-web');
  });

  test('a link to a page opens that page after signing in, not always Today', async ({ page, pretendApi }) => {
    pretendApi.signedIn = false;
    await page.goto('/contacts');
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByLabel('Email').fill('anita@example.com');
    await page.getByLabel('Password').fill('river-lamp-kettle-42');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/contacts$/);
  });

  test('a person who is already signed in is sent from the sign-in page to Today', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('signed-in people', () => {
  test('signing out returns to the sign-in page, and the back button does not show the app again', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Leads' }).click();
    await expect(page).toHaveURL(/\/leads$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(pretendApi.calls).toContain('POST /auth/logout');
    await page.goBack();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  });

  test('when the access token has run out the page quietly refreshes and carries on', async ({ page, pretendApi }) => {
    pretendApi.accessExpired = true;
    await page.goto('/');
    // /me answered 401; the client refreshed and asked again, so the person never sees the sign-in page. (In development
    // React asks /me twice on purpose, yet both share ONE refresh.)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(pretendApi.calls.filter((call) => call === 'POST /auth/refresh')).toHaveLength(1);
  });

  test('when the session has ended for good the person lands on the sign-in page', async ({ page, pretendApi }) => {
    pretendApi.accessExpired = true;
    pretendApi.refreshWorks = false;
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe('when the server is down', () => {
  test('shows a plain error with a Try again button, and recovers when the server is back', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.serverDown = true;
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'We could not reach the server' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/); // not sent to sign-in: being offline is not being signed out
    pretendApi.serverDown = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});
