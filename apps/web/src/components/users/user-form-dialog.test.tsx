import type { UserListItem } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserFormDialog } from './user-form-dialog';

const createdUser = {
  id: '3',
  name: 'Grace Agent',
  email: 'grace@example.com',
  role: 'AGENT',
  isActive: true,
  createdAt: '2026-10-12T08:00:00.000Z',
};

function renderCreateDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <UserFormDialog />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), invalidate };
}

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

/** Opens the dialog and fills in the form. */
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values = { name: 'Grace Agent', email: 'grace@example.com', password: 'Secret#123' },
) {
  await user.click(screen.getByRole('button', { name: 'Create user' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create user' });
  await user.type(screen.getByLabelText('Name'), values.name);
  await user.type(screen.getByLabelText('Email'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  return dialog;
}

function submitButton() {
  // The trigger is hidden from the accessibility tree while the dialog is open
  return screen.getByRole('button', { name: 'Create user' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UserFormDialog without a user (create)', () => {
  it('opens a dialog with name, email and password fields', async () => {
    const { user } = renderCreateDialog();

    await user.click(screen.getByRole('button', { name: 'Create user' }));

    expect(await screen.findByRole('dialog', { name: 'Create user' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('shows validation errors without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderCreateDialog();

    await fillForm(user, { name: ' ', email: 'not-an-email', password: 'secret' });
    await user.click(submitButton());

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a blank password as required', async () => {
    const { user } = renderCreateDialog();

    await user.click(screen.getByRole('button', { name: 'Create user' }));
    await screen.findByRole('dialog');
    await user.click(submitButton());

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument();
  });

  it.each([
    ['SECRET#123', 'Password must contain a lowercase letter'],
    ['secret#123', 'Password must contain an uppercase letter'],
    ['Secret1234', 'Password must contain a special character'],
  ])('rejects the password %s', async (password, message) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderCreateDialog();

    await fillForm(user, { name: 'Grace Agent', email: 'grace@example.com', password });
    await user.click(submitButton());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates the user, shows a success toast, refreshes the list and closes', async () => {
    const fetchSpy = mockFetch(Response.json({ user: createdUser }, { status: 201 }));
    const { user, invalidate } = renderCreateDialog();

    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByText('Created Grace Agent (grace@example.com)')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Grace Agent',
          email: 'grace@example.com',
          password: 'Secret#123',
        }),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  });

  it('disables the submit button while the request is pending', async () => {
    // Never resolves, so the mutation stays pending
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));
    const { user } = renderCreateDialog();

    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('shows a taken email under the email field and stays open', async () => {
    mockFetch(Response.json({ error: 'A user with this email already exists' }, { status: 409 }));
    const { user } = renderCreateDialog();

    const dialog = await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(dialog).toBeInTheDocument();
  });

  it('shows other API errors in an alert', async () => {
    mockFetch(Response.json({ error: 'Internal Server Error' }, { status: 500 }));
    const { user } = renderCreateDialog();

    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clears the form when cancelled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderCreateDialog();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByLabelText('Name')).toHaveValue('');
  });
});

const alan: UserListItem = {
  id: '0199a000-0000-7000-8000-000000000005',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'AGENT',
  isActive: true,
  createdAt: '2026-03-02T08:30:00.000Z',
};

function renderEditDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <UserFormDialog user={alan} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), invalidate };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit Alan Agent' }));
  return screen.findByRole('dialog', { name: 'Edit user' });
}

/** The JSON body of the first fetch call. */
function sentBody(fetchSpy: ReturnType<typeof mockFetch>) {
  return JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as unknown;
}

describe('UserFormDialog with a user (edit)', () => {
  it('opens prefilled with the name and email and a blank password', async () => {
    const { user } = renderEditDialog();

    await openDialog(user);

    expect(screen.getByLabelText('Name')).toHaveValue('Alan Agent');
    expect(screen.getByLabelText('Email')).toHaveValue('alan@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByText(/Leave blank to keep the current password/)).toBeInTheDocument();
  });

  it('saves with a blank password to keep the current one', async () => {
    const fetchSpy = mockFetch(Response.json({ user: { ...alan, name: 'Alan Turing' } }));
    const { user, invalidate } = renderEditDialog();

    await openDialog(user);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Alan Turing');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Updated Alan Turing (alan@example.com)')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/users/${alan.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(sentBody(fetchSpy)).toEqual({
      name: 'Alan Turing',
      email: 'alan@example.com',
      password: '',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  });

  it('sends a new password when one is typed', async () => {
    const fetchSpy = mockFetch(Response.json({ user: alan }));
    const { user } = renderEditDialog();

    await openDialog(user);
    await user.type(screen.getByLabelText('Password'), 'NewSecret#1');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentBody(fetchSpy)).toMatchObject({ password: 'NewSecret#1' });
  });

  it('checks a new password against the password rules without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderEditDialog();

    await openDialog(user);
    await user.type(screen.getByLabelText('Password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a taken email under the email field and stays open', async () => {
    mockFetch(Response.json({ error: 'A user with this email already exists' }, { status: 409 }));
    const { user } = renderEditDialog();

    const dialog = await openDialog(user);
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(dialog).toBeInTheDocument();
  });

  it('shows other API errors in an alert', async () => {
    mockFetch(Response.json({ error: 'User not found' }, { status: 404 }));
    const { user } = renderEditDialog();

    await openDialog(user);
    await user.type(screen.getByLabelText('Name'), ' Turing');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('User not found');
  });

  it('shows a "no changes" alert and stays open when nothing was changed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderEditDialog();

    const dialog = await openDialog(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('No changes to save')).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a differently cased or padded email as no change', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderEditDialog();

    await openDialog(user);
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), ' Alan@Example.COM ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('No changes to save')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('discards unsaved changes when cancelled and reopened', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderEditDialog();

    await openDialog(user);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Someone Else');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openDialog(user);
    expect(screen.getByLabelText('Name')).toHaveValue('Alan Agent');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
