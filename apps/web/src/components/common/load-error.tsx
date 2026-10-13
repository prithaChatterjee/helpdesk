import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface LoadErrorProps {
  /** What went wrong, e.g. "Couldn't load tickets: Unauthorized" */
  children: ReactNode;
  className?: string;
}

/** A page's data failed to load: a centered message announced to screen readers. */
export function LoadError({ children, className }: LoadErrorProps) {
  return (
    <p role="alert" className={cn('py-6 text-center text-sm text-destructive', className)}>
      {children}
    </p>
  );
}
