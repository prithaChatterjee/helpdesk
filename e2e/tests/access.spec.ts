import { expect, test } from '@playwright/test';
import { TEST_USERS } from '../test-env';
import { signIn, submitSignIn, welcomeHeading } from './helpers';

test.describe('unauthenticated access', () => {
  test('home redirects to /login and returns there after sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Sign in to Helpdesk')).toBeVisible();

    await submitSignIn(page, TEST_USERS.agent);
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
  });

  test('/users redirects to /login and an Admin returns to /users after sign-in', async ({
    page,
  }) => {
    await page.goto('/users');
    await expect(page).toHaveURL('/login');

    await submitSignIn(page, TEST_USERS.admin);
    await expect(page).toHaveURL('/users');
    await expect(page.getByRole('cell', { name: TEST_USERS.agent.email })).toBeVisible();
  });

  test('/users redirects an Agent home after sign-in', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL('/login');

    await submitSignIn(page, TEST_USERS.agent);
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
  });

  test('API refuses /api/me and /api/users without a session', async ({ page }) => {
    expect((await page.request.get('/api/me')).status()).toBe(401);
    expect((await page.request.get('/api/users')).status()).toBe(401);
  });
});

test.describe('Admin-only routes', () => {
  test('Agent visiting /users is sent home and the API returns 403', async ({ page }) => {
    await signIn(page, TEST_USERS.agent);

    await page.goto('/users');
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);

    const response = await page.request.get('/api/users');
    expect(response.status()).toBe(403);
  });

  test('Admin can open /users and the API returns the user list', async ({ page }) => {
    await signIn(page, TEST_USERS.admin);

    await page.goto('/users');
    await expect(page).toHaveURL('/users');
    await expect(page.getByRole('cell', { name: TEST_USERS.admin.email })).toBeVisible();

    const response = await page.request.get('/api/users');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { users: { email: string }[] };
    expect(body.users.map((u) => u.email)).toEqual(
      expect.arrayContaining([TEST_USERS.admin.email, TEST_USERS.agent.email]),
    );
  });
});

test.describe('unknown routes', () => {
  test('redirect to /login when signed out', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page).toHaveURL('/login');
  });

  test('redirect home when signed in', async ({ page }) => {
    await signIn(page, TEST_USERS.agent);

    await page.goto('/does-not-exist');
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
  });
});
