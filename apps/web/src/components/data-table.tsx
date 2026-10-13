import { type Page, PAGE_SIZES, type PageSize, type Sort } from '@helpdesk/shared';
import {
  type ColumnDef,
  type PaginationState,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type Updater,
  useTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { type ReactNode, useId, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

// Sorting and pagination are manual: the table only tracks which column is sorted and which page
// is shown; the API sorts and pages, and `rows` is already the current page.
const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });

const ariaSort = { asc: 'ascending', desc: 'descending' } as const;

function columnId(column: Pick<DataTableColumn<never>, 'header' | 'sortField'>) {
  return column.sortField ?? column.header;
}

interface DataTableProps<T, TSortField extends string> {
  columns: readonly DataTableColumn<T, TSortField>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  /**
   * The sort the rows came back in from the API, or `undefined` for the API's default order.
   * Sortable headers show and change it.
   */
  sort?: Sort<TSortField>;
  /**
   * Called when a sortable header is clicked; refetch with the new sort. Clicks cycle: sort,
   * flip, remove (`undefined`, back to the API's default order).
   */
  onSortChange?: (sort: Sort<TSortField> | undefined) => void;
  /** Rows are being refetched (e.g. after a sort change): dims the table and sets `aria-busy`. */
  busy?: boolean;
  /** The page `rows` is. With `total` and `onPageChange`, shows paging controls under the table. */
  page?: Page;
  /** Rows on all pages together, from the API */
  total?: number;
  /** Called with the new page or page size; refetch with it. */
  onPageChange?: (page: Page) => void;
}

/** A table of `rows`, one cell per column, with headers that sort and controls that page through the API. */
export function DataTable<T extends RowData, TSortField extends string = string>({
  columns,
  rows,
  getRowKey,
  emptyMessage = 'Nothing to show yet.',
  sort,
  onSortChange,
  busy = false,
  page,
  total,
  onPageChange,
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
    if (!onSortChange) return;
    const first = next[0];
    onSortChange(
      first && { sortBy: first.id as TSortField, sortOrder: first.desc ? 'desc' : 'asc' },
    );
  }

  // TanStack counts pages from 0, the API from 1
  const pagination: PaginationState = {
    pageIndex: (page?.page ?? 1) - 1,
    pageSize: page?.pageSize ?? rows.length,
  };

  function handlePaginationChange(updater: Updater<PaginationState>) {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    if (!onPageChange) return;
    const pageSize = next.pageSize as PageSize;
    // A new page size starts over at the first page, since the old page number no longer fits
    onPageChange({
      page: pageSize === pagination.pageSize ? next.pageIndex + 1 : 1,
      pageSize,
    });
  }

  const table = useTable({
    features,
    columns: columnDefs,
    data: rows as T[],
    getRowId: (row) => getRowKey(row),
    state: { sorting, pagination },
    onSortingChange: handleSortingChange,
    manualSorting: true,
    enableSorting: onSortChange !== undefined,
    enableMultiSort: false,
    // Clicks cycle: sort (descending first for `sortDescFirst` columns), flip, remove
    enableSortingRemoval: true,
    onPaginationChange: handlePaginationChange,
    manualPagination: true,
    rowCount: total ?? rows.length,
    // The page only changes when the parent says so (it resets to page 1 on a new sort itself)
    autoResetPageIndex: false,
  });

  const paginated = page !== undefined && total !== undefined && onPageChange !== undefined;

  return (
    <div className="space-y-3">
      <TableContent
        table={table}
        columnsById={columnsById}
        rowCount={rows.length}
        columnCount={columns.length}
        emptyMessage={emptyMessage}
        busy={busy}
      />
      {paginated && (
        <DataTablePagination
          page={page}
          total={total}
          pageCount={Math.max(table.getPageCount(), 1)}
          canPrevious={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onFirst={() => table.firstPage()}
          onPrevious={() => table.previousPage()}
          onNext={() => table.nextPage()}
          onLast={() => table.lastPage()}
          onPageSizeChange={(size) => table.setPageSize(size)}
          busy={busy}
        />
      )}
    </div>
  );
}

function TableContent<T extends RowData, TSortField extends string>({
  table,
  columnsById,
  rowCount,
  columnCount,
  emptyMessage,
  busy,
}: {
  table: ReturnType<typeof useTable<typeof features, T>>;
  columnsById: Map<string, DataTableColumn<T, TSortField>>;
  rowCount: number;
  columnCount: number;
  emptyMessage: string;
  busy: boolean;
}) {
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
        {rowCount === 0 ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="py-6 text-center text-muted-foreground">
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

interface DataTablePaginationProps {
  page: Page;
  total: number;
  pageCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
  onPageSizeChange: (size: PageSize) => void;
  busy: boolean;
}

/** "Rows per page" picker, the range shown, and first/previous/next/last page buttons. */
function DataTablePagination({
  page,
  total,
  pageCount,
  canPrevious,
  canNext,
  onFirst,
  onPrevious,
  onNext,
  onLast,
  onPageSizeChange,
  busy,
}: DataTablePaginationProps) {
  const pageSizeLabelId = useId();
  const firstRow = total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastRow = Math.min(page.page * page.pageSize, total);
  // While a page loads, its buttons stay put but can't be clicked again
  const disablePrevious = busy || !canPrevious;
  const disableNext = busy || !canNext;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <div className="flex items-center gap-2">
        <span id={pageSizeLabelId}>Rows per page</span>
        <Select
          value={String(page.pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger size="sm" aria-labelledby={pageSizeLabelId} className="w-18">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-4">
        <p aria-live="polite">
          {firstRow}–{lastRow} of {total}
        </p>
        <p>
          Page {page.page} of {pageCount}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            disabled={disablePrevious}
            onClick={onFirst}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={disablePrevious}
            onClick={onPrevious}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={disableNext}
            onClick={onNext}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={disableNext}
            onClick={onLast}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </nav>
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
