import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth, AuthSession } from '../auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user: AuthSession['user'];
      session: AuthSession['session'];
    }
  }
}

/** Responds 401 unless the request carries a valid session for an active user. */
export function requireAuth(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result?.user.isActive) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.locals.user = result.user;
    res.locals.session = result.session;
    next();
  };
}
