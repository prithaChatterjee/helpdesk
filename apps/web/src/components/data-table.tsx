import type { Sort } from '@helpdesk/shared';
import {
  type ColumnDef,
  type RowData,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type Updater,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * One column of a `DataTable`: its header and how to render a row's cell.
 * `TSortField` is the API's sort field union (e.g. `TicketSortField`), so a column can only sort
 * by a field the server accepts.
 */
export interface DataTableColumn<T, TSortField extends string = string> {
  header: string;
  /** Keep the header for screen readers only, e.g. for a column of row action buttons. */
  hideHeader?: boolean;
  cell: (row: T) => ReactNode;
  /** Classes for this column's cells, e.g. `font-medium`. */
  className?: string;
  /** Size of the loading placeholder, shaped like the real content. Defaults to `h-4 w-24`. */
  skeletonClassName?: string;
  /** The API sort field this column's header sorts by. Leave out for unsortable columns. */
  sortField?: TSortField;
  /** Sort descending on the first click, e.g. for dates (newest first). */
  sortDescFirst?: boolean;
}

// Sorting is manual: the table only tracks which column is sorted; the API does the sorting.
const features = tableFeatures({ rowSortingFeature });

const ariaSort = { asc: 'ascending', desc: 'descending' } as const;

function columnId(column: Pick<DataTableColumn<never>, 'header' | 'sortField'>) {
  return column.sortField ?? column.header;
}

interface DataTableProps<T, TSortField extends string> {
  columns: readonly DataTableColumn<T, TSortField>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  /** The sort the rows came back in from the API. Sortable headers show and change it. */
  sort?: Sort<TSortField>;
  /** Called with the new sort when a sortable header is clicked; refetch with it. */
  onSortChange?: (sort: Sort<TSortField>) => void;
  /** Rows are being refetched (e.g. after a sort change): dims the table and sets `aria-busy`. */
  busy?: boolean;
}

/** A table of `rows`, one cell per column, with headers that sort through the API. */
export function DataTable<T extends RowData, TSortField extends string = string>({
  columns,
  rows,
  getRowKey,
  emptyMessage = 'Nothing to show yet.',
  sort,
  onSortChange,
  busy = false,
}: DataTableProps<T, TSortField>) {
  const columnsById = useMemo(
    () => new Map(columns.map((column) => [columnId(column), column])),
    [columns],
  );
  const columnDefs = useMemo(
    () =>
      columns.map((column): ColumnDef<typeof features, T> => ({
        id: columnId(column),
        // TanStack only lets columns with an accessor sort. The API sorts, so no value is needed.
        ...(column.sortField !== undefined && { accessorFn: () => null }),
        header: column.header,
        cell: ({ row }) => column.cell(row.original),
        enableSorting: column.sortField !== undefined,
        sortDescFirst: column.sortDescFirst ?? false,
      })),
    [columns],
  );
  const sorting: SortingState = sort ? [{ id: sort.sortBy, desc: sort.sortOrder === 'desc' }] : [];

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    const first = next[0];
    if (!first || !onSortChange) return;
    onSortChange({ sortBy: first.id as TSortField, sortOrder: first.desc ? 'desc' : 'asc' });
  }

  const table = useTable({
    features,
    columns: columnDefs,
    data: rows as T[],
    getRowId: (row) => getRowKey(row),
    state: { sorting },
    onSortingChange: handleSortingChange,
    manualSorting: true,
    enableSorting: onSortChange !== undefined,
    enableMultiSort: false,
    // A list always has a sort (the API's default otherwise), so clicks only flip direction
    enableSortingRemoval: false,
  });

  return (
    <Table aria-busy={busy || undefined} className={cn(busy && 'opacity-60 transition-opacity')}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const column = columnsById.get(header.column.id);
              const sorted = header.column.getIsSorted();
              const label = <table.FlexRender header={header} />;
              return (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.column.getCanSort() ? (sorted ? ariaSort[sorted] : 'none') : undefined
                  }
                >
                  {column?.hideHeader ? (
                    <span className="sr-only">{label}</span>
                  ) : header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {label}
                      {sorted === 'asc' ? (
                        <ArrowUp aria-hidden className="size-3.5" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown aria-hidden className="size-3.5" />
                      ) : (
                        <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />
                      )}
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-6 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={columnsById.get(cell.column.id)?.className}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

interface DataTableSkeletonProps<T, TSortField extends string> {
  columns: readonly DataTableColumn<T, TSortField>[];
  /** Screen-reader text, e.g. "Loading users…". */
  label: string;
  rowCount?: number;
}

/** Table-shaped placeholder with the real headers, so the layout doesn't jump when data loads. */
export function DataTableSkeleton<T, TSortField extends string = string>({
  columns,
  label,
  rowCount = 5,
}: DataTableSkeletonProps<T, TSortField>) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header}>
                {column.hideHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }, (_, row) => (
            <TableRow key={row}>
              {columns.map((column) => (
                <TableCell key={column.header}>
                  <Skeleton className={column.skeletonClassName ?? 'h-4 w-24'} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
