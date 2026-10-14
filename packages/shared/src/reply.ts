/** Shared wording of replies to customers, by Agents (polished) and by the AI (auto-resolved). */

/**
 * The name to greet a customer by: the first name of the sender's display name, e.g. "Jane" for
 * "Jane Doe" or for "Doe, Jane" (the last-name-first form some mail clients send).
 */
export function customerFirstName(customerName: string | null): string | undefined {
  const name = customerName?.replace(/["']/g, '').trim();
  if (!name) return undefined;
  const given = name.includes(',') ? name.slice(name.indexOf(',') + 1) : name;
  return given.trim().split(/\s+/)[0] || undefined;
}

/**
 * Wraps a polished body in a greeting to the customer by first name and a sign-off with the
 * Agent's full name.
 */
export function addGreetingAndSignOff(
  body: string,
  customerName: string | null,
  agentName: string,
) {
  const greeting = customerFirstName(customerName) ?? 'there';
  return `Hi ${greeting},\n\n${body}\n\nBest regards,\n${agentName}`;
}

/** Sign-off name of replies the AI writes on its own, e.g. when it auto-resolves a ticket. */
export const AI_SIGNATURE = 'The Support Team';

/**
 * Sender name of replies the AI writes on its own. With no Agent behind them (`sentByUserId` null)
 * this is how AI replies are told apart, e.g. by the dashboard's "resolved by AI" count.
 */
export const AI_SENDER_NAME = 'Support (AI)';
