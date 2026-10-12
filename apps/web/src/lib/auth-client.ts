import { USER_ROLES } from '@helpdesk/shared';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Same-origin: Vite proxies /api to the API in development, so the session cookie just works.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: [...USER_ROLES], input: false },
        isActive: { type: 'boolean', input: false },
      },
    }),
  ],
});

/**
 * `authClient.useSession()`, but a deactivated user counts as signed out. Better Auth's
 * get-session doesn't check `isActive` (only the API's `requireAuth` does), so without this a user
 * deactivated mid-session would keep seeing the app. Use it instead of `useSession` everywhere.
 */
export function useActiveSession() {
  const result = authClient.useSession();
  const session = result.data && !result.data.user.isActive ? null : result.data;
  return { ...result, data: session };
}
