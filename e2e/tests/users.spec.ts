import { expect, type Page, test } from '@playwright/test';
import { TEST_USERS } from '../test-env';
import { userExists } from './db';
import {
  createUserViaApi,
  expectSignInRefused,
  expectSignInWorks,
  newSignedInPage,
  signIn,
  uniqueUser,
  userRow,
  welcomeHeading,
} from './helpers';

/** Signs in as the seeded Admin and opens the Users page with the table loaded. */
async function openUsersAsAdmin(page: Page) {
  await signIn(page, TEST_USERS.admin);
  await page.goto('/users');
  await expect(userRow(page, TEST_USERS.admin.email)).toBeVisible();
}

/** Records the requests the page sends to `/api/users` (method and path). */
function recordUserRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/users') && request.method() !== 'GET') {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });
  return requests;
}

test.describe('create user', () => {
  test('creates an Agent who shows in the table and can sign in', async ({ page, browser }) => {
    const user = uniqueUser('create');
    await openUsersAsAdmin(page);

    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill(user.name);
    // Typed with spaces and capitals: the form trims and lowercases it like the stored user
    await dialog.getByLabel('Email', { exact: true }).fill(`  ${user.email.toUpperCase()} `);
    await dialog.getByLabel('Password', { exact: true }).fill(user.password);
    await dialog.getByRole('button', { name: 'Create user' }).click();

    await expect(page.getByText(`Created ${user.name} (${user.email})`)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(userRow(page, user.email).getByRole('cell')).toHaveText([
      user.name,
      user.email,
      'Agent',
      'Active',
      /\d{4}/,
      '',
    ]);

    await expectSignInWorks(browser, user);
  });
});

test.describe('create user validation', () => {
  test('invalid input shows field errors and sends nothing', async ({ page }) => {
    const user = uniqueUser('invalid');
    await openUsersAsAdmin(page);
    const requests = recordUserRequests(page);

    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    const name = dialog.getByLabel('Name', { exact: true });
    const email = dialog.getByLabel('Email', { exact: true });
    const password = dialog.getByLabel('Password', { exact: true });
    const submit = dialog.getByRole('button', { name: 'Create user' });

    await submit.click();
    await expect(dialog.getByText('Name is required')).toBeVisible();
    await expect(dialog.getByText('Enter a valid email address')).toBeVisible();
    await expect(dialog.getByText('Password is required')).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toHaveAttribute('aria-invalid', 'true');

    // Whitespace-only name is still blank; a malformed email is still invalid
    await name.fill('   ');
    await email.fill('not-an-email');
    await submit.click();
    await expect(dialog.getByText('Name is required')).toBeVisible();
    await expect(dialog.getByText('Enter a valid email address')).toBeVisible();

    await name.fill(user.name);
    await email.fill(user.email);
    await expect(dialog.getByText('Name is required')).toBeHidden();
    await expect(dialog.getByText('Enter a valid email address')).toBeHidden();

    const passwordCases = [
      ['Ab-1', 'Password must be at least 8 characters'],
      ['ABCDEFG-', 'Password must contain a lowercase letter'],
      ['abcdefg-', 'Password must contain an uppercase letter'],
      ['Abcdefgh', 'Password must contain a special character'],
    ] as const;
    for (const [value, message] of passwordCases) {
      await password.fill(value);
      await submit.click();
      await expect(dialog.getByText(message)).toBeVisible();
      await expect(password).toHaveAttribute('aria-invalid', 'true');
    }

    await expect(dialog).toBeVisible();
    expect(requests).toEqual([]);
    expect(await userExists(user.email)).toBe(false);
    await expect(userRow(page, user.email)).toHaveCount(0);
  });

  test('a taken email shows the conflict under Email and keeps the dialog open', async ({
    page,
  }) => {
    const user = uniqueUser('duplicate');
    await openUsersAsAdmin(page);

    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    await dialog.getByLabel('Name', { exact: true }).fill(user.name);
    // Differs only in case and spaces, so this also checks the email is normalised before the check
    await dialog
      .getByLabel('Email', { exact: true })
      .fill(` ${TEST_USERS.agent.email.toUpperCase()} `);
    await dialog.getByLabel('Password', { exact: true }).fill(user.password);
    await dialog.getByRole('button', { name: 'Create user' }).click();

    await expect(dialog.getByText('A user with this email already exists')).toBeVisible();
    await expect(dialog.getByLabel('Email', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create user' })).toBeEnabled();
    await expect(page.getByRole('cell', { name: user.name, exact: true })).toHaveCount(0);
  });

  test('Cancel closes the dialog without creating the user', async ({ page }) => {
    const user = uniqueUser('cancel');
    await openUsersAsAdmin(page);
    const requests = recordUserRequests(page);

    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    await dialog.getByLabel('Name', { exact: true }).fill(user.name);
    await dialog.getByLabel('Email', { exact: true }).fill(user.email);
    await dialog.getByLabel('Password', { exact: true }).fill(user.password);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(userRow(page, user.email)).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(await userExists(user.email)).toBe(false);

    // Reopening starts from a blank form
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('Password', { exact: true })).toHaveValue('');
  });
});

test.describe('list users', () => {
  test('shows the seeded users; Admin rows can be edited but not deleted', async ({ page }) => {
    await openUsersAsAdmin(page);

    for (const header of ['Name', 'Email', 'Role', 'Status', 'Created', 'Actions']) {
      await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeAttached();
    }

    const adminRow = userRow(page, TEST_USERS.admin.email);
    await expect(adminRow.getByRole('cell').nth(0)).toHaveText(TEST_USERS.admin.name);
    await expect(adminRow.getByRole('cell').nth(2)).toHaveText('Admin');
    await expect(adminRow.getByRole('cell').nth(3)).toHaveText('Active');
    await expect(
      adminRow.getByRole('button', { name: `Edit ${TEST_USERS.admin.name}`, exact: true }),
    ).toBeVisible();
    await expect(adminRow.getByRole('button', { name: /^Delete / })).toHaveCount(0);

    const agentRow = userRow(page, TEST_USERS.agent.email);
    await expect(agentRow.getByRole('cell').nth(0)).toHaveText(TEST_USERS.agent.name);
    await expect(agentRow.getByRole('cell').nth(2)).toHaveText('Agent');
    await expect(agentRow.getByRole('cell').nth(3)).toHaveText('Active');
    await expect(
      agentRow.getByRole('button', { name: `Edit ${TEST_USERS.agent.name}`, exact: true }),
    ).toBeVisible();
    await expect(
      agentRow.getByRole('button', { name: `Delete ${TEST_USERS.agent.name}`, exact: true }),
    ).toBeVisible();

    const inactiveRow = userRow(page, TEST_USERS.inactive.email);
    await expect(inactiveRow.getByRole('cell').nth(3)).toHaveText('Deactivated');
  });
});

test.describe('edit user', () => {
  test('changes name and email and keeps the password when it is left blank', async ({
    page,
    browser,
  }) => {
    const original = uniqueUser('edit');
    const renamed = uniqueUser('renamed');
    await openUsersAsAdmin(page);
    await createUserViaApi(page, original);
    await page.reload();

    await userRow(page, original.email)
      .getByRole('button', { name: `Edit ${original.name}`, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit user' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(original.name);
    await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(original.email);
    await expect(dialog.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(dialog.getByText(/^Leave blank to keep the current password\./)).toBeVisible();

    await dialog.getByLabel('Name', { exact: true }).fill(renamed.name);
    await dialog.getByLabel('Email', { exact: true }).fill(renamed.email);
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText(`Updated ${renamed.name} (${renamed.email})`)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(userRow(page, original.email)).toHaveCount(0);
    await expect(userRow(page, renamed.email).getByRole('cell')).toHaveText([
      renamed.name,
      renamed.email,
      'Agent',
      'Active',
      /\d{4}/,
      '',
    ]);

    // New name and email, the password they were created with
    await expectSignInWorks(browser, { ...renamed, password: original.password });
    await expectSignInRefused(browser, original);
  });

  test('a new password replaces the old one and signs the user out', async ({
    page,
    browser,
  }) => {
    const user = uniqueUser('password');
    const newPassword = `New-${user.password}`;
    await openUsersAsAdmin(page);
    await createUserViaApi(page, user);
    await page.reload();

    const agentPage = await newSignedInPage(browser, user);

    await userRow(page, user.email)
      .getByRole('button', { name: `Edit ${user.name}`, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit user' });
    await dialog.getByLabel('Password', { exact: true }).fill(newPassword);
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText(`Updated ${user.name} (${user.email})`)).toBeVisible();
    await expect(dialog).toBeHidden();

    // The Agent's existing session was deleted
    expect((await agentPage.request.get('/api/me')).status()).toBe(401);
    await agentPage.reload();
    await expect(agentPage).toHaveURL('/login');
    await agentPage.context().close();

    await expectSignInRefused(browser, user);
    await expectSignInWorks(browser, { ...user, password: newPassword });
  });

  test('a new password that breaks the rules is rejected in the form', async ({ page }) => {
    const user = uniqueUser('weak');
    await openUsersAsAdmin(page);
    await createUserViaApi(page, user);
    await page.reload();
    const requests = recordUserRequests(page);

    await userRow(page, user.email)
      .getByRole('button', { name: `Edit ${user.name}`, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit user' });
    await dialog.getByLabel('Password', { exact: true }).fill('short');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('saving without changes says so, sends nothing and keeps the dialog open', async ({
    page,
  }) => {
    const user = uniqueUser('unchanged');
    await openUsersAsAdmin(page);
    await createUserViaApi(page, user);
    await page.reload();
    const requests = recordUserRequests(page);

    await userRow(page, user.email)
      .getByRole('button', { name: `Edit ${user.name}`, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit user' });
    const save = dialog.getByRole('button', { name: 'Save changes' });
    await save.click();
    await expect(page.getByText('No changes to save')).toBeVisible();
    await expect(dialog).toBeVisible();

    // Surrounding spaces and different case normalise to the same values: still no change
    await dialog.getByLabel('Name', { exact: true }).fill(`  ${user.name}  `);
    await dialog.getByLabel('Email', { exact: true }).fill(` ${user.email.toUpperCase()} `);
    await save.click();
    await expect(page.getByText('No changes to save')).toHaveCount(1);
    await expect(dialog).toBeVisible();

    expect(requests).toEqual([]);
  });
});

test.describe('delete user', () => {
  test('Cancel keeps the user; confirming deletes and signs them out', async ({
    page,
    browser,
  }) => {
    const user = uniqueUser('delete');
    await openUsersAsAdmin(page);
    await createUserViaApi(page, user);
    await page.reload();

    const agentPage = await newSignedInPage(browser, user);
    await expect(welcomeHeading(agentPage, user)).toBeVisible();

    const row = userRow(page, user.email);
    const deleteButton = row.getByRole('button', { name: `Delete ${user.name}`, exact: true });
    const confirm = page.getByRole('alertdialog', { name: `Delete ${user.name}?` });

    await deleteButton.click();
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(user.email)).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(row).toBeVisible();
    expect((await agentPage.request.get('/api/me')).status()).toBe(200);

    await deleteButton.click();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText(`Deleted ${user.name} (${user.email})`)).toBeVisible();
    await expect(confirm).toBeHidden();
    await expect(row).toHaveCount(0);

    await page.reload();
    await expect(userRow(page, TEST_USERS.admin.email)).toBeVisible();
    await expect(userRow(page, user.email)).toHaveCount(0);

    // Signed out wherever they were signed in
    await agentPage.reload();
    await expect(agentPage).toHaveURL('/login');
    await agentPage.context().close();

    await expectSignInRefused(browser, user);
  });

  test('a deleted user keeps their email taken and is gone from the API list', async ({
    page,
  }) => {
    const user = uniqueUser('tombstone');
    await openUsersAsAdmin(page);
    const created = await createUserViaApi(page, user);

    expect((await page.request.delete(`/api/users/${created.id}`)).status()).toBe(204);

    const list = (await (await page.request.get('/api/users')).json()) as {
      users: { email: string }[];
    };
    expect(list.users.map((u) => u.email)).not.toContain(user.email);
    expect(await userExists(user.email)).toBe(true);

    await page.reload();
    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    await dialog.getByLabel('Name', { exact: true }).fill(user.name);
    await dialog.getByLabel('Email', { exact: true }).fill(user.email);
    await dialog.getByLabel('Password', { exact: true }).fill(user.password);
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog.getByText('A user with this email already exists')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('the API refuses to delete an Admin', async ({ page }) => {
    await openUsersAsAdmin(page);
    const list = (await (await page.request.get('/api/users')).json()) as {
      users: { id: string; email: string }[];
    };
    const admin = list.users.find((u) => u.email === TEST_USERS.admin.email);
    expect(admin).toBeDefined();

    const response = await page.request.delete(`/api/users/${admin?.id ?? ''}`);
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "Admins can't be deleted" });

    await page.reload();
    await expect(userRow(page, TEST_USERS.admin.email)).toBeVisible();
  });
});

test.describe('authorization', () => {
  test('an Agent is sent home from /users and the API refuses their writes', async ({
    page,
    browser,
  }) => {
    // An Agent for the Agent to target, created by an Admin in a separate context
    const target = uniqueUser('target');
    const adminPage = await newSignedInPage(browser, TEST_USERS.admin);
    const created = await createUserViaApi(adminPage, target);

    await signIn(page, TEST_USERS.agent);
    await page.goto('/users');
    await expect(page).toHaveURL('/');
    await expect(welcomeHeading(page, TEST_USERS.agent)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create user' })).toHaveCount(0);

    const attempted = uniqueUser('by-agent');
    const post = await page.request.post('/api/users', { data: attempted });
    expect(post.status()).toBe(403);
    expect(await userExists(attempted.email)).toBe(false);

    const patch = await page.request.patch(`/api/users/${created.id}`, {
      data: { name: 'Hijacked', email: target.email, password: '' },
    });
    expect(patch.status()).toBe(403);

    const del = await page.request.delete(`/api/users/${created.id}`);
    expect(del.status()).toBe(403);

    // The target is untouched
    await adminPage.goto('/users');
    await expect(userRow(adminPage, target.email).getByRole('cell').nth(0)).toHaveText(
      target.name,
    );
    await adminPage.context().close();
  });
});
