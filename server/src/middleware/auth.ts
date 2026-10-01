import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'candidate';
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
  return jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
}

// Verifies the Bearer token and attaches the decoded user to req.user
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    
    // Enforce one-device session check for candidates (or all) if sessionId is present
    if (decoded.sessionId) {
      const activeSession = await prisma.userSession.findUnique({
        where: { id: decoded.sessionId }
      });
      if (!activeSession) {
        return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
      }
    }
    
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restricts a route to one of the given roles (call after authenticate)
export function requireRole(...roles: Array<'admin' | 'candidate'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
