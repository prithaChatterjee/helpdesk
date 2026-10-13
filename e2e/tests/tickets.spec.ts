// Happy paths of inbound email → ticket: the webhook creates and threads tickets, they show on
// the Tickets page, and an Agent's reply is saved. How rows and messages render is covered by the
// component tests.
import { expect, test } from '@playwright/test';
import { TEST_USERS } from '../test-env';
import {
  createTicket,
  type InboundEmailBody,
  type InboundEmailResult,
  openTicketsFromNav,
  postInboundEmail,
  signIn,
  subjectLink,
  ticketRow,
  uniqueEmail,
  uniqueSuffix,
  WEBHOOK_URL,
} from './helpers';

test.describe('new email creates a ticket', () => {
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
    await expect(ticketRow(page, email.subject).getByRole('cell').first()).toContainText('1 reply');
    await expect(ticketRow(page, reply.subject)).toHaveCount(0);
  });
});

test.describe('Agent reply', () => {
  test('Agent saves a reply that shows in the thread and the reply count', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('agent-reply');
    const ticketId = await createTicket(request, email);
    const replyText = `Thanks for reaching out.
We are looking into it.
Ref ${uniqueSuffix()}`;

    await signIn(page, TEST_USERS.agent);
    await openTicketsFromNav(page);
    await subjectLink(page, email.subject).click();
    await expect(page).toHaveURL(`/tickets/${ticketId}`);
    await expect(page.getByRole('heading', { level: 1, name: email.subject })).toBeVisible();

    await page.getByRole('textbox', { name: 'Reply' }).fill(replyText);
    await page.getByRole('button', { name: 'Save reply' }).click();

    // Saved by the API under the signed-in Agent's name, then refetched into the thread
    const reply = page
      .getByRole('list', { name: 'Messages' })
      .getByRole('article', { name: `Reply from ${TEST_USERS.agent.name}` });
    await expect(reply).toHaveCount(1);
    await expect(reply).toContainText('We are looking into it.');

    await openTicketsFromNav(page);
    const row = ticketRow(page, email.subject);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('cell').first()).toContainText('1 reply');
  });
});

test.describe('webhook authentication', () => {
  test('refuses a request without the secret', async ({ request }) => {
    const response = await request.post(WEBHOOK_URL, { data: uniqueEmail('no-secret') });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});
