import type { TicketMessage } from '@helpdesk/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketMessageItem } from './ticket-message-item';

const customerMessage: TicketMessage = {
  id: 'm1',
  direction: 'INBOUND',
  fromEmail: 'jane@customer.test',
  fromName: 'Jane Doe',
  bodyText: 'I forgot my password.\nCan you help?',
  deliveryStatus: null,
  createdAt: '2026-10-01T10:00:00.000Z',
};

const reply: TicketMessage = {
  id: 'm2',
  direction: 'OUTBOUND',
  fromEmail: 'alan@helpdesk.test',
  fromName: 'Alan Agent',
  bodyText: 'Here is a reset link.',
  deliveryStatus: null,
  createdAt: '2026-10-02T10:00:00.000Z',
};

function renderMessage(message: TicketMessage) {
  render(
    <ol>
      <TicketMessageItem message={message} />
    </ol>,
  );
  return screen.getByRole('article');
}

describe('TicketMessageItem', () => {
  it("labels a customer message with the sender's name and shows their address", () => {
    const article = renderMessage(customerMessage);

    expect(article).toHaveAccessibleName('Customer message from Jane Doe');
    expect(article).toHaveTextContent('Jane Doe <jane@customer.test> · Customer');
  });

  it('labels a customer message by email when the sender has no name', () => {
    const article = renderMessage({ ...customerMessage, fromName: null });

    expect(article).toHaveAccessibleName('Customer message from jane@customer.test');
    expect(article).not.toHaveTextContent('<jane@customer.test>');
  });

  it("shows only the Agent's name on a reply", () => {
    const article = renderMessage(reply);

    expect(article).toHaveAccessibleName('Reply from Alan Agent');
    expect(article).toHaveTextContent('Alan Agent · Reply');
    expect(article).not.toHaveTextContent('alan@helpdesk.test');
  });

  it.each([
    ['PENDING', 'Sending…'],
    ['SENT', 'Emailed'],
    ['FAILED', 'Not sent'],
    [null, 'Not emailed'],
  ] as const)('labels a reply with delivery status %s as "%s"', (deliveryStatus, label) => {
    const article = renderMessage({ ...reply, deliveryStatus });

    expect(article).toHaveTextContent(`Alan Agent · Reply · ${label}`);
  });

  it('highlights a reply that could not be sent', () => {
    renderMessage({ ...reply, deliveryStatus: 'FAILED' });

    expect(screen.getByText('Not sent', { exact: false })).toHaveClass('text-destructive');
  });

  it('shows no delivery status on a customer message', () => {
    const article = renderMessage(customerMessage);

    expect(article).not.toHaveTextContent(/Sending|Emailed|Not sent|Not emailed/);
  });

  it('shows when the message was sent', () => {
    renderMessage(customerMessage);
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    expect(screen.getByText(date.format(new Date(customerMessage.createdAt)))).toHaveAttribute(
      'datetime',
      customerMessage.createdAt,
    );
  });

  it('keeps line breaks in the body', () => {
    renderMessage(customerMessage);

    expect(screen.getByText(/I forgot my password/).textContent).toBe(
      'I forgot my password.\nCan you help?',
    );
  });

  it('renders the body as text, not HTML', () => {
    const html = '<b>bold</b><img src=x onerror="alert(1)">';
    const article = renderMessage({ ...customerMessage, bodyText: html });

    expect(article).toHaveTextContent(html);
    expect(article.querySelector('b, img')).toBeNull();
  });
});
