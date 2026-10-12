import { type BrowserContext, expect, type Page } from '@playwright/test';
import type { TestUser } from '../test-env';

// Better Auth's session cookie name (no custom prefix, not __Secure- over http)
export const SESSION_COOKIE = 'better-auth.session_token';

/** Fills the sign-in form on the current page (expected to be /login) and submits it. */
export async function submitSignIn(page: Page, user: { email: string; password: string }) {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Signs in through the login page and waits until the app shows the user as signed in. */
export async function signIn(page: Page, user: TestUser) {
  await page.goto('/login');
  await submitSignIn(page, user);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** Clicks "Sign out" and waits for the login page. */
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByText('Sign in to Helpdesk')).toBeVisible();
}

/** The heading on the home page once a user is signed in. */
export function welcomeHeading(page: Page, user: TestUser) {
  return page.getByText(`Welcome, ${user.name}`);
}

/** The context's Better Auth session cookie, or undefined when there is none. */
export async function getSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === SESSION_COOKIE);
}

/** The session token stored in the database (`sessions.tokenHash`) for the context's cookie. */
export async function getSessionToken(context: BrowserContext) {
  const cookie = await getSessionCookie(context);
  if (!cookie) throw new Error('No session cookie in this browser context');
  // The cookie holds `<token>.<signature>`, URL-encoded
  const token = decodeURIComponent(cookie.value).split('.')[0];
  if (!token) throw new Error(`Unexpected session cookie value: ${cookie.value}`);
  return token;
}
