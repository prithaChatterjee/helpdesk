import {
  FIRST_PAGE,
  hasTicketFilters,
  listQueryString,
  type Page,
  type Sort,
  type TicketFilters,
  type TicketListResponse,
  type TicketSortField,
} from '@helpdesk/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketFiltersBar } from '@/components/tickets/ticket-filters';
import { TicketsTable, TicketsTableSkeleton } from '@/components/tickets/tickets-table';
import { LoadError } from '@/components/common/load-error';
import { apiGet } from '@/lib/api';

export function TicketsPage() {
  // Links can open the list already filtered, e.g. the Home page's "assigned to you"
  const location = useLocation();
  const [filters, setFilters] = useState<TicketFilters>(
    () => (location.state as { filters?: TicketFilters } | null)?.filters ?? {},
  );
  // No sort: the API's default order (most recent activity first)
  const [sort, setSort] = useState<Sort<TicketSortField>>();
  const [page, setPage] = useState<Page>(FIRST_PAGE);
  const { data, isPending, isPlaceholderData, error } = useQuery({
    // Invalidating ['tickets'] also matches every filter, sort and page
    queryKey: ['tickets', filters, sort, page],
    // Filtered, sorted and paged by the API, never in the browser
    queryFn: () =>
      apiGet<TicketListResponse>(`/tickets${listQueryString({ filters, sort, page })}`),
    // Keep showing the current rows while other filters, a sort or a page load, instead of the skeleton
    placeholderData: keepPreviousData,
  });

  // Past the last page (tickets went away since it was opened): show the new last page instead.
  // Adjusting state while rendering (not in an effect) avoids a render with the empty page.
  const lastPage = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : undefined;
  if (!isPlaceholderData && lastPage !== undefined && page.page > lastPage) {
    setPage({ ...page, page: lastPage });
  }

  // Stable, so the search box's debounce isn't restarted by every render
  const handleFiltersChange = useCallback((next: TicketFilters) => {
    setFilters(next);
    // Fewer matches may not reach the current page
    setPage((current) => ({ ...current, page: 1 }));
  }, []);

  function handleSortChange(next: Sort<TicketSortField> | undefined) {
    setSort(next);
    // A new order starts from the top
    setPage((current) => ({ ...current, page: 1 }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets</CardTitle>
        <CardDescription>Support emails, most recent activity first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TicketFiltersBar filters={filters} onChange={handleFiltersChange} />
        {isPending ? (
          <TicketsTableSkeleton />
        ) : error ? (
          <LoadError>Couldn't load tickets: {error.message}</LoadError>
        ) : (
          <TicketsTable
            tickets={data.tickets}
            emptyMessage={
              hasTicketFilters(filters) ? 'No tickets match these filters.' : 'No tickets yet.'
            }
            sort={sort}
            onSortChange={handleSortChange}
            page={page}
            total={data.total}
            onPageChange={setPage}
            busy={isPlaceholderData}
          />
        )}
      </CardContent>
    </Card>
  );
}
