import { expect, test } from '@playwright/test';
import { TEST_USERS } from '../test-env';
import { expireSession, setUserActive } from './db';
import {
  getSessionCookie,
  getSessionToken,
  SESSION_COOKIE,
  signIn,
  signOut,
  welcomeHeading,
} from './helpers';

test.describe('session persistence', () => {
  test('survives a reload and is shared with a new page in the same context', async ({
    page,
    context,
  }) => {
    await signIn(page, TEST_USERS.agent);

    await page.reload();
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();

    const secondPage = await context.newPage();
    await secondPage.goto('/');
    await expect(secondPage).toHaveURL('/');
    await expect(welcomeHeading(secondPage, TEST_USERS.agent)).toBeVisible();
    expect((await secondPage.request.get('/api/me')).status()).toBe(200);
  });
});

test.describe('session cookie', () => {
  test('is httpOnly, SameSite=Lax and hidden from document.cookie', async ({ page, context }) => {
    await signIn(page, TEST_USERS.agent);

    const cookie = await getSessionCookie(context);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');

    const documentCookie = await page.evaluate<string>('document.cookie');
    expect(documentCookie).not.toContain(SESSION_COOKIE);
  });
});

test.describe('sign out', () => {
  test('revokes the session on the server and protected pages stay closed', async ({
    page,
    context,
    request,
  }) => {
    await signIn(page, TEST_USERS.admin);
    // Build some history inside the app so "back" has a protected page to return to
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL('/users');
    const cookie = await getSessionCookie(context);
    expect(cookie).toBeDefined();

    await signOut(page);

    expect((await page.request.get('/api/me')).status()).toBe(401);
    // Replaying the old cookie from a separate client proves the session was revoked, not just
    // dropped from the browser
    const replay = await request.get('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE}=${cookie?.value ?? ''}` },
    });
    expect(replay.status()).toBe(401);

    await page.goBack();
    await expect(page).toHaveURL('/login');
    await expect(welcomeHeading(page, TEST_USERS.admin)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('expired session', () => {
  test('is refused by the API and sends the user to /login on reload', async ({
    page,
    context,
  }) => {
    await signIn(page, TEST_USERS.agent);
    expect((await page.request.get('/api/me')).status()).toBe(200);

    await expireSession(await getSessionToken(context));

    expect((await page.request.get('/api/me')).status()).toBe(401);
    await page.reload();
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Sign in to Helpdesk')).toBeVisible();
  });
});

test.describe('user deactivated mid-session', () => {
  // Only this test uses TEST_USERS.cutoff; make sure it starts and ends active
  test.beforeEach(async () => {
    await setUserActive(TEST_USERS.cutoff.email, true);
  });
  test.afterEach(async () => {
    await setUserActive(TEST_USERS.cutoff.email, true);
  });

  test('is refused by the API and sent to /login on the next session check', async ({ page }) => {
    await signIn(page, TEST_USERS.cutoff);
    expect((await page.request.get('/api/me')).status()).toBe(200);

    await setUserActive(TEST_USERS.cutoff.email, false);

    expect((await page.request.get('/api/me')).status()).toBe(401);
    await page.reload();
    await expect(page).toHaveURL('/login');
    await expect(welcomeHeading(page, TEST_USERS.cutoff)).toHaveCount(0);
  });
});
