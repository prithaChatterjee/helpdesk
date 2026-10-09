import { z } from 'zod';

// Login only checks presence: a length rule here would reveal the password policy
// and lock out accounts whose passwords predate it.
export const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type SignInInput = z.infer<typeof signInSchema>;
