import {
  FIRST_PAGE,
  listQueryString,
  type Page,
  type Sort,
  type TicketListResponse,
  type TicketSortField,
} from '@helpdesk/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketsTable, TicketsTableSkeleton } from '@/components/tickets-table';
import { apiGet } from '@/lib/api';

export function TicketsPage() {
  // No sort: the API's default order (most recent activity first)
  const [sort, setSort] = useState<Sort<TicketSortField>>();
  const [page, setPage] = useState<Page>(FIRST_PAGE);
  const { data, isPending, isPlaceholderData, error } = useQuery({
    // Invalidating ['tickets'] also matches every sort and page
    queryKey: ['tickets', sort, page],
    // Sorted and paged by the API, never in the browser
    queryFn: () => apiGet<TicketListResponse>(`/tickets${listQueryString({ sort, page })}`),
    // Keep showing the current rows while another sort or page loads, instead of the skeleton
    placeholderData: keepPreviousData,
  });

  // Past the last page (tickets went away since it was opened): show the new last page instead.
  // Adjusting state while rendering (not in an effect) avoids a render with the empty page.
  const lastPage = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : undefined;
  if (!isPlaceholderData && lastPage !== undefined && page.page > lastPage) {
    setPage({ ...page, page: lastPage });
  }

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
      <CardContent>
        {isPending ? (
          <TicketsTableSkeleton />
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">
            Couldn't load tickets: {error.message}
          </p>
        ) : (
          <TicketsTable
            tickets={data.tickets}
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
