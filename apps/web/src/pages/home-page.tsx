import {
  listQueryString,
  type Page,
  type TicketFilters,
  type TicketListResponse,
} from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LoadError } from '@/components/common/load-error';
import { Skeleton } from '@/components/ui/skeleton';
import { apiGet } from '@/lib/api';
import { useActiveSession } from '@/lib/auth-client';
import { dateTimeFormat } from '@/lib/format';

/** How many of the user's open tickets the page lists */
const RECENT_LIMIT = 5;

const MY_OPEN: TicketFilters = { assignee: 'me', status: 'OPEN' };
const UNASSIGNED_OPEN: TicketFilters = { assignee: 'unassigned', status: 'OPEN' };
const FIRST_TEN: Page = { page: 1, pageSize: 10 };

// Sentences that read as text but go to the matching tickets; the underline darkens on hover
const QUEUE_LINK =
  'rounded-sm underline decoration-foreground/30 decoration-2 underline-offset-[6px] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function useOpenTickets(filters: TicketFilters) {
  return useQuery({
    // Under ['tickets'], so replying or reassigning anywhere refreshes these counts too
    queryKey: ['tickets', filters, undefined, FIRST_TEN],
    queryFn: () =>
      apiGet<TicketListResponse>(`/tickets${listQueryString({ filters, page: FIRST_TEN })}`),
  });
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The signed-in user's queue: what is theirs to answer and what nobody has picked up yet. */
export function HomePage() {
  const { data: session } = useActiveSession();
  const mine = useOpenTickets(MY_OPEN);
  const unassigned = useOpenTickets(UNASSIGNED_OPEN);
  const error = mine.error ?? unassigned.error;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {session?.user.name}</h1>
      {error ? (
        <LoadError className="text-left">Couldn't load your queue: {error.message}</LoadError>
      ) : mine.data && unassigned.data ? (
        <Queue mine={mine.data} unassigned={unassigned.data} />
      ) : (
        <HomeSkeleton />
      )}
    </div>
  );
}

function Queue({ mine, unassigned }: { mine: TicketListResponse; unassigned: TicketListResponse }) {
  return (
    <>
      <ul className="space-y-2 text-lg leading-relaxed">
        <li>
          <Link to="/tickets" state={{ filters: MY_OPEN }} className={QUEUE_LINK}>
            {mine.total === 0
              ? 'No open tickets are assigned to you.'
              : plural(
                  mine.total,
                  'open ticket is assigned to you.',
                  'open tickets are assigned to you.',
                )}
          </Link>
        </li>
        <li>
          <Link to="/tickets" state={{ filters: UNASSIGNED_OPEN }} className={QUEUE_LINK}>
            {unassigned.total === 0
              ? 'Every open ticket has someone on it.'
              : plural(
                  unassigned.total,
                  'open ticket has no one on it yet.',
                  'open tickets have no one on them yet.',
                )}
          </Link>
        </li>
      </ul>

      {mine.tickets.length > 0 && (
        <section aria-labelledby="your-open-tickets" className="space-y-3">
          <h2 id="your-open-tickets" className="font-bold">
            Your open tickets
          </h2>
          <ol className="divide-y rounded-lg border bg-card">
            {mine.tickets.slice(0, RECENT_LIMIT).map((ticket) => (
              <li key={ticket.id} className="px-4 py-3">
                <Link
                  to={`/tickets/${ticket.id}`}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {ticket.subject}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {ticket.customerName ?? ticket.customerEmail}, last activity{' '}
                  <time dateTime={ticket.updatedAt}>
                    {dateTimeFormat.format(new Date(ticket.updatedAt))}
                  </time>
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-6 w-80 max-w-full" />
      <Skeleton className="h-6 w-72 max-w-full" />
      <Skeleton className="mt-8 h-32 w-full" />
    </div>
  );
}
