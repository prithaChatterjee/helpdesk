import {
  hasTicketFilters,
  TICKET_ASSIGNEE_FILTERS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_SEARCH_MAX_LENGTH,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketAssigneeFilter,
  type TicketCategory,
  type TicketFilters,
  type TicketStatus,
} from '@helpdesk/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** How long typing must pause before the search is sent, in milliseconds */
const SEARCH_DEBOUNCE_MS = 300;

// Radix Select items can't have an empty value, so "no filter" gets its own
const ALL = 'ALL';

interface TicketFiltersBarProps {
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}

const ASSIGNEE_FILTER_LABELS: Record<TicketAssigneeFilter, string> = {
  me: 'Assigned to me',
  unassigned: 'Unassigned',
};

/** Search box and status/category/assignee dropdowns above the tickets table. */
export function TicketFiltersBar({ filters, onChange }: TicketFiltersBarProps) {
  // The box updates as the user types; the search is only sent once typing pauses
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const search = searchText.trim() || undefined;

  useEffect(() => {
    if (search === filters.search) return;
    const timeout = setTimeout(() => onChange({ ...filters, search }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search, filters, onChange]);

  function clearFilters() {
    setSearchText('');
    onChange({});
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search tickets"
          placeholder="Search subject or customer…"
          value={searchText}
          maxLength={TICKET_SEARCH_MAX_LENGTH}
          onChange={(event) => setSearchText(event.target.value)}
          className="pl-8"
        />
      </div>
      <Select
        value={filters.status ?? ALL}
        onValueChange={(value) =>
          onChange({ ...filters, status: value === ALL ? undefined : (value as TicketStatus) })
        }
      >
        <SelectTrigger aria-label="Status" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {TICKET_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {TICKET_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.category ?? ALL}
        onValueChange={(value) =>
          onChange({
            ...filters,
            category: value === ALL ? undefined : (value as TicketCategory),
          })
        }
      >
        <SelectTrigger aria-label="Category" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {TICKET_CATEGORIES.map((value) => (
            <SelectItem key={value} value={value}>
              {TICKET_CATEGORY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.assignee ?? ALL}
        onValueChange={(value) =>
          onChange({
            ...filters,
            assignee: value === ALL ? undefined : (value as TicketAssigneeFilter),
          })
        }
      >
        <SelectTrigger aria-label="Assignee" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All assignees</SelectItem>
          {TICKET_ASSIGNEE_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {ASSIGNEE_FILTER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(hasTicketFilters(filters) || searchText) && (
        <Button variant="ghost" onClick={clearFilters}>
          <X />
          Clear filters
        </Button>
      )}
    </div>
  );
}
