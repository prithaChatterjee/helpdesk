import { z } from 'zod';
import { userRoleSchema } from './domain';

/** A user as returned by the Admin-only users API. */
export const userListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type UserListItem = z.infer<typeof userListItemSchema>;

export const userListResponseSchema = z.object({ users: z.array(userListItemSchema) });
export type UserListResponse = z.infer<typeof userListResponseSchema>;

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be at most 100 characters');

// Lowercased so uniqueness (and sign-in) don't depend on how the Admin typed it
const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

const passwordSchema = z
  .string()
  .trim()
  // First, so a blank field says "required" rather than listing the length rule
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters')
  // Better Auth's default maximum, so the user can sign in with it
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

/** Admin's "Create user" form, also validated by `POST /api/users`. New users are Agents. */
export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const createUserResponseSchema = z.object({ user: userListItemSchema });
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

/**
 * Admin's "Edit user" form, also validated by `PATCH /api/users/:id`.
 * A blank password keeps the current one; otherwise it must pass the same rules as on create.
 */
export const updateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z
    .string()
    .trim()
    .superRefine((password, ctx) => {
      if (password === '') return;
      const result = passwordSchema.safeParse(password);
      for (const issue of result.error?.issues ?? []) {
        ctx.addIssue({ code: 'custom', message: issue.message });
      }
    }),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateUserResponseSchema = z.object({ user: userListItemSchema });
export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>;
