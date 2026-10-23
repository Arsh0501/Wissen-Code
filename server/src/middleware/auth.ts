import { accessRoles, type AccessRole } from '../platform/permissions';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

export function validateAuthConfiguration() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  return value;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'candidate' | 'interviewer';
  accessRole?: AccessRole;
  guest?: boolean; // joined through an invite link — limited to invited assessments
  sessionId?: number; // Added for one-device enforcement
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, validateAuthConfiguration(), {
    expiresIn: user.guest ? '12h' : '15m',
    algorithm: 'HS256',
  });
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const decoded = jwt.verify(token, validateAuthConfiguration(), {
    algorithms: ['HS256'],
  }) as AuthUser;
  if (!Number.isInteger(decoded.id) || !Number.isInteger(decoded.sessionId))
    throw new Error('Invalid session claims');
  const session = await prisma.userSession.findFirst({
    where: {
      id: decoded.sessionId,
      userId: decoded.id,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  if (!session || !accessRoles.includes(session.user.role as AccessRole))
    throw new Error('Session invalidated');
  const userRole = session.user.role === 'interviewer'
    ? 'interviewer'
    : session.user.role === 'candidate'
    ? 'candidate'
    : 'admin';
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: userRole as 'admin' | 'candidate' | 'interviewer',
    accessRole: session.user.role as AccessRole,
    guest: session.user.isGuest,
    sessionId: session.id,
  };
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch {
    return res
      .status(401)
      .json({ error: 'Invalid, expired or revoked session' });
  }
}

// Restricts a route to one of the given roles (call after authenticate)
export function requireRole(...roles: Array<'admin' | 'candidate' | 'interviewer'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
