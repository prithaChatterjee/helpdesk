import { expect, type Page, test } from '@playwright/test';
import { E2E_WEB_URL, TEST_USERS } from '../test-env';
import { userExists } from './db';
import { getSessionCookie, signIn, submitSignIn, welcomeHeading } from './helpers';

/** Asserts the browser has no usable session: no cookie and `/api/me` refuses. */
async function expectSignedOut(page: Page) {
  expect(await getSessionCookie(page.context())).toBeUndefined();
  const me = await page.request.get('/api/me');
  expect(me.status()).toBe(401);
}

test.describe('sign in with valid credentials', () => {
  test('Admin lands on home, sees their name and the Users link, and can open Users', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign in to Helpdesk')).toBeVisible();
    await submitSignIn(page, TEST_USERS.admin);

    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.admin)).toBeVisible();
    await expect(page.getByText(`Signed in as ${TEST_USERS.admin.email} (Admin)`)).toBeVisible();
    await expect(
      page.getByRole('banner').getByText(TEST_USERS.admin.name, { exact: true }),
    ).toBeVisible();

    const usersLink = page.getByRole('link', { name: 'Users' });
    await expect(usersLink).toBeVisible();
    await usersLink.click();
    await expect(page).toHaveURL('/users');
    await expect(page.getByRole('cell', { name: TEST_USERS.admin.email })).toBeVisible();
  });

  test('Agent lands on home without the Users link', async ({ page }) => {
    await page.goto('/login');
    await submitSignIn(page, TEST_USERS.agent);

    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
    await expect(page.getByText(`Signed in as ${TEST_USERS.agent.email} (Agent)`)).toBeVisible();
    await expect(
      page.getByRole('banner').getByText(TEST_USERS.agent.name, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  });
});

test.describe('sign in with invalid credentials', () => {
  test('wrong password shows an error, stays on /login and creates no session', async ({
    page,
  }) => {
    await page.goto('/login');
    await submitSignIn(page, { email: TEST_USERS.agent.email, password: 'wrong-password' });

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    await expectSignedOut(page);
  });

  test('unknown email shows the same error as a wrong password', async ({ page }) => {
    await page.goto('/login');
    await submitSignIn(page, { email: TEST_USERS.agent.email, password: 'wrong-password' });
    const wrongPasswordAlert = page.getByRole('alert');
    await expect(wrongPasswordAlert).toBeVisible();
    const wrongPasswordMessage = await wrongPasswordAlert.textContent();

    await page.goto('/login');
    await submitSignIn(page, {
      email: `nobody-${Date.now()}@e2e.test`,
      password: TEST_USERS.agent.password,
    });

    await expect(page.getByRole('alert')).toHaveText(wrongPasswordMessage ?? '');
    await expect(page).toHaveURL('/login');
    await expectSignedOut(page);
  });

  test('deactivated user cannot sign in', async ({ page }) => {
    await page.goto('/login');
    await submitSignIn(page, TEST_USERS.inactive);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    await expectSignedOut(page);
  });
});

test.describe('client-side validation', () => {
  test('empty and malformed input show field errors without sending a sign-in request', async ({
    page,
  }) => {
    const signInRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/sign-in')) signInRequests.push(request.url());
    });

    await page.goto('/login');
    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    const submit = page.getByRole('button', { name: 'Sign in' });

    await submit.click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toHaveAttribute('aria-invalid', 'true');

    await email.fill('not-an-email');
    await password.fill('some-password');
    await submit.click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toHaveCount(0);

    await expect(page).toHaveURL('/login');
    expect(signInRequests).toEqual([]);
  });
});

test.describe('already signed in', () => {
  test('visiting /login redirects to home', async ({ page }) => {
    await signIn(page, TEST_USERS.agent);

    await page.goto('/login');
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
  });
});

test.describe('public sign-up', () => {
  test('is rejected by the API and creates no user', async ({ page }) => {
    const user = {
      email: `signup-${Date.now()}@e2e.test`,
      password: 'signup-password-123',
      name: 'Sign Up',
    };

    // Send the web origin so the request passes Better Auth's origin check and reaches sign-up
    const response = await page.request.post('/api/auth/sign-up/email', {
      data: user,
      headers: { Origin: E2E_WEB_URL },
    });
    expect(response.ok()).toBe(false);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(await userExists(user.email)).toBe(false);
    expect(await getSessionCookie(page.context())).toBeUndefined();

    await page.goto('/login');
    await submitSignIn(page, user);
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expectSignedOut(page);
  });
});
