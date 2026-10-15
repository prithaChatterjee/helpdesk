import { Button } from '@/components/ui/button';

/** Shown instead of the app when rendering crashes (the error goes to Sentry when it is set up). */
export function AppErrorFallback() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div role="alert" className="max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This page ran into an unexpected error. Reload to try again.
        </p>
        <Button onClick={() => window.location.reload()}>Reload page</Button>
      </div>
    </main>
  );
}
