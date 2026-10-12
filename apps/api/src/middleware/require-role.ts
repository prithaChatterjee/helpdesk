import type { UserRole } from '@helpdesk/shared';
import type { RequestHandler } from 'express';

/** Responds 403 unless the signed-in user has one of `roles`. Mount after `requireAuth`. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (_req, res, next) => {
    const { role } = res.locals.user;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
