// Happy paths of the ticket detail page: editing status and category, deep links while signed
// out, and a customer follow-up reopening a resolved ticket.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { TEST_USERS } from '../test-env';
import {
  createTicket,
  type InboundEmailBody,
  type InboundEmailResult,
  openTicketsFromNav,
  postInboundEmail,
  signIn,
  submitSignIn,
  subjectLink,
  ticketRow,
  uniqueEmail,
  uniqueSuffix,
} from './helpers';

/** The Status dropdown in the ticket's Details card. */
function statusSelect(page: Page) {
  return page.getByRole('combobox', { name: 'Status' });
}

/** The Category dropdown in the ticket's Details card. */
function categorySelect(page: Page) {
  return page.getByRole('combobox', { name: 'Category' });
}

/** Opens a dropdown and picks the option with this label. */
async function choose(page: Page, select: Locator, label: string) {
  await select.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** Opens the ticket from the Tickets page through its subject link. */
async function openTicketFromList(page: Page, subject: string, ticketId: string) {
  await openTicketsFromNav(page);
  await subjectLink(page, subject).click();
  await expect(page).toHaveURL(`/tickets/${ticketId}`);
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
}

test.describe('status and category', () => {
  test('Agent changes both; they persist on reload and show in the Tickets list', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('fields');
    const ticketId = await createTicket(request, email);

    await signIn(page, TEST_USERS.agent);
    await openTicketFromList(page, email.subject, ticketId);

    // Each toast means the change is saved, so the reload below reads it back from the database
    await choose(page, statusSelect(page), 'Resolved');
    await expect(page.getByText('Status changed to Resolved')).toBeVisible();
    await choose(page, categorySelect(page), 'Refund request');
    await expect(page.getByText('Category changed to Refund request')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: email.subject })).toBeVisible();
    await expect(statusSelect(page)).toHaveText('Resolved');
    await expect(categorySelect(page)).toHaveText('Refund request');

    await openTicketsFromNav(page);
    const cells = ticketRow(page, email.subject).getByRole('cell');
    await expect(cells.nth(2)).toHaveText('Resolved');
    await expect(cells.nth(3)).toHaveText('Refund request');
  });
});

test.describe('deep link while signed out', () => {
  test('goes to /login and returns to the ticket after an Agent signs in', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('deep-link');
    const ticketId = await createTicket(request, email);

    await page.goto(`/tickets/${ticketId}`);
    await expect(page).toHaveURL('/login');

    await submitSignIn(page, TEST_USERS.agent);
    await expect(page).toHaveURL(`/tickets/${ticketId}`);
    await expect(page.getByRole('heading', { level: 1, name: email.subject })).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Messages' })
        .getByRole('article', { name: `Customer message from ${email.from.name}` }),
    ).toContainText(email.text);
  });
});

test.describe('customer follow-up', () => {
  test('a threaded reply shows on the ticket page and reopens a Resolved ticket', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('follow-up');
    const ticketId = await createTicket(request, email);

    await signIn(page, TEST_USERS.admin);
    await openTicketFromList(page, email.subject, ticketId);
    await choose(page, statusSelect(page), 'Resolved');
    await expect(page.getByText('Status changed to Resolved')).toBeVisible();

    const followUp = {
      messageId: `<follow-up-${uniqueSuffix()}@customer.e2e.test>`,
      from: email.from,
      subject: `Re: ${email.subject}`,
      text: `It broke again. Ref ${uniqueSuffix()}`,
      inReplyTo: email.messageId,
    } satisfies InboundEmailBody;
    const response = await postInboundEmail(request, followUp);
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()) as InboundEmailResult).toEqual({
      result: 'appended',
      ticketId,
    });

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: email.subject })).toBeVisible();
    const customerMessages = page
      .getByRole('list', { name: 'Messages' })
      .getByRole('article', { name: `Customer message from ${email.from.name}` });
    await expect(customerMessages).toHaveCount(2);
    await expect(customerMessages.nth(0)).toContainText(email.text);
    await expect(customerMessages.nth(1)).toContainText(followUp.text);
    await expect(statusSelect(page)).toHaveText('Open');
  });
});
