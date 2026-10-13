// Happy paths of inbound email → ticket: the webhook creates and threads tickets, and both roles
// see them on the Tickets page.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { E2E_API_URL, E2E_INBOUND_EMAIL_SECRET, TEST_USERS } from '../test-env';
import { signIn } from './helpers';

const WEBHOOK_URL = `${E2E_API_URL}/api/webhooks/inbound-email`;

interface InboundEmailBody {
  messageId: string;
  from: { email: string; name?: string };
  subject?: string;
  text?: string;
  inReplyTo?: string;
}

interface InboundEmailResult {
  result: 'created' | 'appended' | 'duplicate' | 'ignored';
  ticketId?: string;
  reason?: string;
}

function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A first email from a new customer, unique per call. */
function uniqueEmail(label: string) {
  const suffix = uniqueSuffix();
  return {
    messageId: `<${label}-${suffix}@customer.e2e.test>`,
    from: { email: `customer-${suffix}@customer.e2e.test`, name: `Customer ${suffix}` },
    subject: `E2E ${label} ${suffix}`,
    text: `Hello, this is ${label} ${suffix}.`,
  } satisfies InboundEmailBody;
}

/** Posts an email to the inbound webhook with the e2e secret. */
async function postInboundEmail(request: APIRequestContext, body: InboundEmailBody) {
  return request.post(WEBHOOK_URL, {
    data: body,
    headers: { Authorization: `Bearer ${E2E_INBOUND_EMAIL_SECRET}` },
  });
}

/** Posts an email that must create a ticket and returns the ticket id. */
async function createTicket(request: APIRequestContext, body: InboundEmailBody) {
  const response = await postInboundEmail(request, body);
  expect(response.status(), await response.text()).toBe(201);
  const result = (await response.json()) as InboundEmailResult;
  expect(result.result).toBe('created');
  expect(result.ticketId).toBeTruthy();
  return result.ticketId;
}

/** The Tickets table rows whose Subject cell is exactly `subject`. */
function ticketRow(page: Page, subject: string) {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: subject, exact: true }) });
}

/** Opens the Tickets page through the header nav link. */
async function openTicketsFromNav(page: Page) {
  await page.getByRole('link', { name: 'Tickets' }).click();
  await expect(page).toHaveURL('/tickets');
  await expect(page.getByText('Support emails, most recent activity first.')).toBeVisible();
}

test.describe('new email creates a ticket', () => {
  test('Admin sees the ticket with subject, customer name and Open status', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('admin-view');
    await createTicket(request, email);

    await signIn(page, TEST_USERS.admin);
    await openTicketsFromNav(page);

    for (const header of ['Subject', 'Customer', 'Status', 'Category', 'Updated']) {
      await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }
    await expect(ticketRow(page, email.subject).getByRole('cell')).toHaveText([
      email.subject,
      email.from.name,
      'Open',
      '—',
      /\d{4}/,
    ]);
  });

  test('Agent sees the Tickets link and the ticket', async ({ page, request }) => {
    const email = uniqueEmail('agent-view');
    await createTicket(request, email);

    await signIn(page, TEST_USERS.agent);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await openTicketsFromNav(page);

    const row = ticketRow(page, email.subject);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('cell').nth(1)).toHaveText(email.from.name);
    await expect(row.getByRole('cell').nth(2)).toHaveText('Open');
  });
});

test.describe('customer reply', () => {
  test('is appended to the same ticket and adds no row', async ({ page, request }) => {
    const email = uniqueEmail('reply');
    const ticketId = await createTicket(request, email);

    const reply = {
      messageId: `<reply-${uniqueSuffix()}@customer.e2e.test>`,
      from: email.from,
      subject: `Re: ${email.subject}`,
      text: 'Any update on this?',
      inReplyTo: email.messageId,
    } satisfies InboundEmailBody;
    const response = await postInboundEmail(request, reply);
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()) as InboundEmailResult).toEqual({
      result: 'appended',
      ticketId,
    });

    await signIn(page, TEST_USERS.agent);
    await openTicketsFromNav(page);
    await expect(ticketRow(page, email.subject)).toHaveCount(1);
    await expect(ticketRow(page, reply.subject)).toHaveCount(0);
  });
});

test.describe('webhook authentication', () => {
  test('refuses a request without the secret', async ({ request }) => {
    const response = await request.post(WEBHOOK_URL, { data: uniqueEmail('no-secret') });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});
