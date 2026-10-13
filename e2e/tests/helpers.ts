import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';
import { E2E_API_URL, E2E_INBOUND_EMAIL_SECRET, E2E_WEB_URL } from '../test-env';

// Better Auth's session cookie name (no custom prefix, not __Secure- over http)
export const SESSION_COOKIE = 'better-auth.session_token';

/** Fills the sign-in form on the current page (expected to be /login) and submits it. */
export async function submitSignIn(page: Page, user: { email: string; password: string }) {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Signs in through the login page and waits until the app shows the user as signed in. */
export async function signIn(page: Page, user: { email: string; password: string }) {
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
export function welcomeHeading(page: Page, user: { name: string }) {
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

/** Credentials for a user a test creates; unique per call so tests never share them. */
export interface NewUser {
  name: string;
  email: string;
  password: string;
}

/** A user as returned by `/api/users`. */
export interface ListedUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  isActive: boolean;
}

/** A short random suffix for unique test data. */
export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Fresh Agent credentials. The password passes the shared rules (length, cases, special). */
export function uniqueUser(label = 'agent'): NewUser {
  const suffix = uniqueSuffix();
  return {
    name: `E2E ${label} ${suffix}`,
    email: `${label}-${suffix}@e2e.test`,
    password: `Pass-${suffix}-word`,
  };
}

/** Creates an Agent through `POST /api/users`; `page` must be signed in as an Admin. */
export async function createUserViaApi(page: Page, user: NewUser): Promise<ListedUser> {
  const response = await page.request.post('/api/users', { data: user });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { user: ListedUser }).user;
}

/** The Users table row whose Email cell is exactly `email`. */
export function userRow(page: Page, email: string) {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: email, exact: true }) });
}

/** A new browser context (separate cookies) with a page on the app, not signed in. */
export async function newAnonymousPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: E2E_WEB_URL });
  return context.newPage();
}

/** A new browser context signed in as `user`, e.g. to watch an Agent while an Admin acts. */
export async function newSignedInPage(browser: Browser, user: { email: string; password: string }) {
  const page = await newAnonymousPage(browser);
  await signIn(page, user);
  return page;
}

/** Tries to sign in with these credentials in a fresh context and checks that it's refused. */
export async function expectSignInRefused(
  browser: Browser,
  credentials: { email: string; password: string },
) {
  const page = await newAnonymousPage(browser);
  try {
    await page.goto('/login');
    await submitSignIn(page, credentials);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
    expect(await getSessionCookie(page.context())).toBeUndefined();
  } finally {
    await page.context().close();
  }
}

/** Signs in with these credentials in a fresh context and checks the user lands home. */
export async function expectSignInWorks(browser: Browser, user: NewUser) {
  const page = await newAnonymousPage(browser);
  try {
    await page.goto('/login');
    await submitSignIn(page, user);
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, user)).toBeVisible();
    await expect(page.getByText(`Signed in as ${user.email} (Agent)`)).toBeVisible();
  } finally {
    await page.context().close();
  }
}

export const WEBHOOK_URL = `${E2E_API_URL}/api/webhooks/inbound-email`;

/** A provider-neutral email for `POST /api/webhooks/inbound-email`. */
export interface InboundEmailBody {
  messageId: string;
  from: { email: string; name?: string };
  subject?: string;
  text?: string;
  inReplyTo?: string;
}

export interface InboundEmailResult {
  result: 'created' | 'appended' | 'duplicate' | 'ignored';
  ticketId?: string;
  reason?: string;
}

/** A first email from a new customer, unique per call. */
export function uniqueEmail(label: string) {
  const suffix = uniqueSuffix();
  return {
    messageId: `<${label}-${suffix}@customer.e2e.test>`,
    from: { email: `customer-${suffix}@customer.e2e.test`, name: `Customer ${suffix}` },
    subject: `E2E ${label} ${suffix}`,
    text: `Hello, this is ${label} ${suffix}.`,
  } satisfies InboundEmailBody;
}

/** Posts an email to the inbound webhook with the e2e secret. */
export async function postInboundEmail(request: APIRequestContext, body: InboundEmailBody) {
  return request.post(WEBHOOK_URL, {
    data: body,
    headers: { Authorization: `Bearer ${E2E_INBOUND_EMAIL_SECRET}` },
  });
}

/** Posts an email that must create a ticket and returns the ticket id. */
export async function createTicket(request: APIRequestContext, body: InboundEmailBody) {
  const response = await postInboundEmail(request, body);
  expect(response.status(), await response.text()).toBe(201);
  const result = (await response.json()) as InboundEmailResult;
  expect(result.result).toBe('created');
  if (!result.ticketId) throw new Error('The webhook created a ticket but returned no ticketId');
  return result.ticketId;
}

/** The subject link (to the ticket's page) in the Tickets table. */
export function subjectLink(page: Page, subject: string) {
  return page.getByRole('link', { name: subject, exact: true });
}

/** The Tickets table rows whose Subject link is exactly `subject`. */
export function ticketRow(page: Page, subject: string) {
  return page.getByRole('row').filter({ has: subjectLink(page, subject) });
}

/** Opens the Tickets page through the header nav link. */
export async function openTicketsFromNav(page: Page) {
  // exact: the ticket page also has an "All tickets" link
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await expect(page).toHaveURL('/tickets');
  await expect(page.getByText('Support emails, most recent activity first.')).toBeVisible();
}
