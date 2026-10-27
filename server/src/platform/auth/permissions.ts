import type { Request, Response, NextFunction } from 'express';
export type AccessRole = 'admin' | 'interviewer' | 'candidate';
export const accessRoles: AccessRole[] = ['admin', 'interviewer', 'candidate'];
export function staffPermissions(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.accessRole ?? req.user?.role;
  if (role === 'admin' || role === 'candidate') return next();
  const path = req.path;
  const read = req.method === 'GET';
  if (role === 'interviewer') {
    const allowed =
      path.startsWith('/interviews') ||
      path.startsWith('/interview-workflows') ||
      (read && path.startsWith('/interview-question-sets')) ||
      path.startsWith('/ai/jobs') ||
      path.startsWith('/judge') ||
      (read && (path.startsWith('/questions') || path.startsWith('/users'))) ||
      /^\/platform\/interviews\/[0-9]+\/(calendar|invitation)$/.test(path);
    if (allowed) return next();
  }
  return res.status(403).json({ error: 'Your team role does not allow this action.' });
}
export function ownerOnly(req: Request, res: Response, next: NextFunction) {
  if ((req.user?.accessRole ?? req.user?.role) !== 'admin')
    return res.status(403).json({ error: 'Only an administrator can manage team access.' });
  next();
}
