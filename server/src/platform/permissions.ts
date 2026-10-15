import type { Request, Response, NextFunction } from 'express';
export type AccessRole = 'admin' | 'recruiter' | 'interviewer' | 'candidate';
export const accessRoles: AccessRole[] = [
  'admin',
  'recruiter',
  'interviewer',
  'candidate',
];
export function staffPermissions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const role = req.user?.accessRole ?? req.user?.role;
  if (role === 'admin' || role === 'candidate') return next();
  const path = req.path;
  const read = req.method === 'GET';
  if (role === 'interviewer') {
    const allowed =
      path.startsWith('/interviews') ||
      path.startsWith('/interview-workflows') ||
      path.startsWith('/ai/jobs') ||
      path.startsWith('/judge') ||
      (read && (path.startsWith('/questions') || path === '/users')) ||
      /^\/platform\/interviews\/[0-9]+\/(replay|calendar|invitation)$/.test(
        path,
      );
    if (allowed) return next();
  }
  if (role === 'recruiter') {
    if (
      !path.startsWith('/users/') &&
      !path.startsWith('/platform/audit') &&
      !path.startsWith('/platform/readiness') &&
      (!path.startsWith('/ai') || path.startsWith('/ai/jobs')) &&
      !(path.startsWith('/questions') && !read) &&
      !path.startsWith('/admin/questions')
    )
      return next();
  }
  return res
    .status(403)
    .json({ error: 'Your team role does not allow this action.' });
}
export function ownerOnly(req: Request, res: Response, next: NextFunction) {
  if ((req.user?.accessRole ?? req.user?.role) !== 'admin')
    return res
      .status(403)
      .json({ error: 'Only an administrator can manage team access.' });
  next();
}
