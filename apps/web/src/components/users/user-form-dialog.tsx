import {
  type CreateUserInput,
  type CreateUserResponse,
  createUserSchema,
  type UpdateUserInput,
  type UpdateUserResponse,
  updateUserSchema,
  type UserListItem,
} from '@helpdesk/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, apiPatch, apiPost } from '@/lib/api';

/** Create and edit forms have the same fields; edit allows a blank password (keep the current one). */
type UserFormValues = CreateUserInput & UpdateUserInput;

const fields = [
  { name: 'name', label: 'Name', type: 'text', autoComplete: 'off' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'off' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
] as const;

const PASSWORD_RULES =
  'At least 8 characters, with an uppercase letter, a lowercase letter and a special character.';

/** Per-mode text, so the markup below has no create/edit ternaries for wording. */
const copy = {
  create: {
    title: 'Create user',
    submit: 'Create user',
    pending: 'Creating…',
    done: 'Created',
    failed: "Couldn't create the user",
    passwordHint: PASSWORD_RULES,
  },
  edit: {
    title: 'Edit user',
    submit: 'Save changes',
    pending: 'Saving…',
    done: 'Updated',
    failed: "Couldn't update the user",
    passwordHint: `Leave blank to keep the current password. ${PASSWORD_RULES}`,
  },
} as const;

/** The form's starting values: blank to create, or the user as listed with a blank password. */
function valuesFor(user: UserListItem | undefined): UserFormValues {
  return { name: user?.name ?? '', email: user?.email ?? '', password: '' };
}

/** Whether the edit form changes anything: name, email, or a new (non-blank) password. */
function hasChanges(user: UserListItem, values: UserFormValues) {
  return values.name !== user.name || values.email !== user.email || values.password !== '';
}

interface UserFormDialogProps {
  /** The user to edit. Leave out to create a new user (an Agent). */
  user?: UserListItem;
}

/**
 * Users page dialog. Without `user`: a "Create user" button and form.
 * With `user`: a pencil button on that user's row and an edit form.
 */
export function UserFormDialog({ user }: UserFormDialogProps) {
  const isEdit = user !== undefined;
  const text = copy[isEdit ? 'edit' : 'create'];
  const [open, setOpen] = useState(false);
  const idPrefix = useId();
  const queryClient = useQueryClient();
  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: valuesFor(user),
  });

  const saveUser = useMutation({
    mutationFn: (values: UserFormValues) =>
      isEdit
        ? apiPatch<UpdateUserResponse>(`/users/${user.id}`, values)
        : apiPost<CreateUserResponse>('/users', values),
    // Awaited, so the mutation stays pending until the table shows the change
    onSuccess: async ({ user: saved }) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`${text.done} ${saved.name} (${saved.email})`);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        form.setError('email', { message: err.message });
        return;
      }
      form.setError('root', { message: err.message || text.failed });
    },
  });

  function onOpenChange(next: boolean) {
    // Start from the user's current values (or blank) each time, without old errors
    if (next) {
      form.reset(valuesFor(user));
      saveUser.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: UserFormValues) {
    // `values` are already trimmed and lowercased by the schema, like the stored user
    if (isEdit && !hasChanges(user, values)) {
      // Fixed id: clicking Save again refreshes this toast instead of stacking another
      toast.info('No changes to save', { id: 'user-form-no-changes' });
      return;
    }
    saveUser.mutate(values);
  }

  const rootError = form.formState.errors.root?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button size="sm">
            <PlusIcon />
            Create user
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader className="mb-4">
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Change ${user.name}'s name, email or password.`
                : 'The new user can sign in as an Agent.'}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {fields.map(({ name, label, type, autoComplete }) => (
              <Controller
                key={name}
                name={name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${idPrefix}-${name}`}>{label}</FieldLabel>
                    <Input
                      {...field}
                      id={`${idPrefix}-${name}`}
                      type={type}
                      autoComplete={autoComplete}
                      aria-invalid={fieldState.invalid}
                    />
                    {name === 'password' && !fieldState.invalid && (
                      <FieldDescription>{text.passwordHint}</FieldDescription>
                    )}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
            {rootError && (
              <p role="alert" className="text-sm text-destructive">
                {rootError}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saveUser.isPending}>
              {saveUser.isPending ? text.pending : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
