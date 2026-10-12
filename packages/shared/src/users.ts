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
