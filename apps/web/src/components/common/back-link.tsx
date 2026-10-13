import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, type To } from 'react-router';
import { cn } from '@/lib/utils';

interface BackLinkProps {
  /** Where the link goes, e.g. the list a detail page belongs to */
  to: To;
  children: ReactNode;
  className?: string;
}

/** A muted "← Back to …" link at the top of a page. */
export function BackLink({ to, children, className }: BackLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft aria-hidden className="size-4" />
      {children}
    </Link>
  );
}
