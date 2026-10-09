## Problem

We receive thousands of support emails daily. Our agents manually categorize emails and send a response to each ticket, which is slow and impersonal.

## Solution

We want to build a system where AI can automatically classify, respond to, and route support tickets, so customers get answers faster.

## Features

- List of tickets with sort and filter
- View ticket details
- Receive support emails and send responses
- AI summaries
- AI-supported suggestions
- User management (Admin only)
- Dashboard view

## Decisions

### Ticket statuses

A ticket has exactly one status:

- **Open**
- **Resolved**
- **Closed**

### Ticket categories

A ticket belongs to exactly one category:

- **General question**
- **Technical question**
- **Refund request**

### Roles and user management

Two roles:

- **Admin**: manages users (creates Agents).
- **Agent**: works on tickets.

The system is deployed with an initial Admin account. The Admin then creates Agent accounts. Only Admins can manage users.

### Dashboard

The dashboard is visible to all roles (Admin and Agent).

## Open questions

### Statuses

- What is the difference between Resolved and Closed? (Suggestion: Resolved = agent/AI answered; Closed = final, after the customer confirms or after N days of no reply.)
- If a customer replies to a Resolved or Closed ticket, does it reopen the ticket or create a new one?
- Who can change the status: Agents, Admins, AI, or automatic rules?

### Categories

- What happens to emails that fit no category (spam, out-of-office, sales, "thank you" replies)? Do we need an "Other" / "Uncategorized" fallback?
- Can an Agent override the AI's category?
- Is the category list fixed in code, or can the Admin edit it later?
- Can AI respond to refund requests on its own, or must a human always handle them?
- Routing: does category drive who handles the ticket? Are there teams?

### Roles

- Can Agents see all tickets, or only tickets assigned to them?
- Are tickets assigned to a specific Agent? Manually, automatically, or self-assigned?
- Does the Admin also work on tickets, or only manage users?
- Can an Admin create other Admins? What prevents removing the last Admin?
- How are the initial Admin's credentials set (environment variables, setup wizard, seed script)?
- How do new Agents get access: Admin sets a password, or an invite email? Is there password reset?
- Removing an Agent: deactivate (keep ticket history) or delete? What happens to their open tickets?

### Dashboard

- Do Admins and Agents see the same data, or does an Agent see personal stats only?
- Which metrics? (e.g. tickets by status/category, first response time, resolution time, AI suggestion acceptance rate)

### Still unanswered from the first review

- Does AI send replies automatically, or does an Agent approve every reply?
- Email volume, number of agents, and peak load.
- How emails are received and sent (Gmail / Microsoft 365 / IMAP / SendGrid / Postmark, etc.).
- Knowledge source for AI answers (FAQ, knowledge base, past tickets).
- Data privacy / compliance constraints on sending customer emails to an AI provider.
- Success metrics, timeline, tech stack, and hosting.
- Internal-only tool, or a product sold to multiple companies?
