// Happy paths of user management on the Users page (Admin): create, list, edit, delete.
import { expect, type Page, test } from '@playwright/test';
import { TEST_USERS } from '../test-env';
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

  test('a new password replaces the old one and signs the user out', async ({ page, browser }) => {
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
    await agentPage.reload();
    await expect(agentPage).toHaveURL('/login');
    await agentPage.context().close();

    await expectSignInRefused(browser, user);
    await expectSignInWorks(browser, { ...user, password: newPassword });
  });
});

test.describe('delete user', () => {
  test('removes the Agent from the list and signs them out everywhere', async ({
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
    await row.getByRole('button', { name: `Delete ${user.name}`, exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: `Delete ${user.name}?` });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(user.email)).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText(`Deleted ${user.name} (${user.email})`)).toBeVisible();
    await expect(confirm).toBeHidden();
    await expect(row).toHaveCount(0);

    await page.reload();
    await expect(userRow(page, TEST_USERS.admin.email)).toBeVisible();
    await expect(userRow(page, user.email)).toHaveCount(0);

    await agentPage.reload();
    await expect(agentPage).toHaveURL('/login');
    await agentPage.context().close();

    await expectSignInRefused(browser, user);
  });
});
