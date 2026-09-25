import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware that restricts access to admin-only routes.
 * Checks the role set by the mock auth middleware (req.role).
 * Returns 403 Forbidden if the requester is not an admin.
 */
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.role;

  if (role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This endpoint is restricted to admin users only.',
    });
  }

  next();
}
