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
