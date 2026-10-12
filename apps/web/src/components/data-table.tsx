import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** One column of a `DataTable`: its header and how to render a row's cell. */
export interface DataTableColumn<T> {
  header: string;
  /** Keep the header for screen readers only, e.g. for a column of row action buttons. */
  hideHeader?: boolean;
  cell: (row: T) => ReactNode;
  /** Classes for this column's cells, e.g. `font-medium`. */
  className?: string;
  /** Size of the loading placeholder, shaped like the real content. Defaults to `h-4 w-24`. */
  skeletonClassName?: string;
}

function DataTableHeader<T>({ columns }: { columns: readonly DataTableColumn<T>[] }) {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((column) => (
          <TableHead key={column.header}>
            {column.hideHeader ? <span className="sr-only">{column.header}</span> : column.header}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
}

/** A table of `rows`, one cell per column. */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage = 'Nothing to show yet.',
}: DataTableProps<T>) {
  return (
    <Table>
      <DataTableHeader columns={columns} />
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-6 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.header} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

interface DataTableSkeletonProps<T> {
  columns: readonly DataTableColumn<T>[];
  /** Screen-reader text, e.g. "Loading users…". */
  label: string;
  rowCount?: number;
}

/** Table-shaped placeholder with the real headers, so the layout doesn't jump when data loads. */
export function DataTableSkeleton<T>({ columns, label, rowCount = 5 }: DataTableSkeletonProps<T>) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Table>
        <DataTableHeader columns={columns} />
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
