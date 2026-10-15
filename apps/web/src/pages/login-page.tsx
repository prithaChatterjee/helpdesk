import { type SignInInput, signInSchema } from '@helpdesk/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient, useActiveSession } from '@/lib/auth-client';

export function LoginPage() {
  const { data: session } = useActiveSession();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  // Where RequireAuth sent the user from, so they land back there after signing in
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (session) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(values: SignInInput) {
    const { error } = await authClient.signIn.email(values);
    if (error) {
      form.setError('root', { message: error.message ?? 'Sign in failed' });
      return;
    }
    void navigate(from, { replace: true });
  }

  const { isSubmitting, errors } = form.formState;

  return (
    // The masthead's navy runs down the left on wide screens and across the top on phones, so the
    // sign-in page already looks like the app it opens
    <div className="grid min-h-svh grid-rows-[auto_1fr] bg-background md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-1">
      <aside className="flex flex-col justify-between gap-6 bg-masthead px-6 py-5 text-masthead-foreground md:px-10 md:py-10">
        <p className="text-lg font-bold tracking-tight">Helpdesk</p>
        <p className="hidden max-w-xs text-2xl leading-snug font-bold tracking-tight text-balance md:block">
          Customer email, sorted and answered.
        </p>
        <p className="hidden text-sm text-masthead-muted md:block">
          Accounts are created by your Admin.
        </p>
      </aside>
      <main className="flex items-center px-6 py-10 md:px-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">Sign in to Helpdesk</h1>
            <p className="text-sm text-muted-foreground">Enter your work email and password.</p>
          </div>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="email"
                      autoComplete="email"
                      autoFocus
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              {errors.root && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.root.message}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </FieldGroup>
          </form>
        </div>
      </main>
    </div>
  );
}
