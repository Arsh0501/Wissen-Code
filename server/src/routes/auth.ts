import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../prisma';
import { authenticate, signToken } from '../middleware/auth';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Helper to generate a refresh token and create a session.
 * Enforces one-device policy: Invalidates any previous sessions for this user.
 */
async function createSessionForUser(userId: number, email: string, name: string, role: string) {
  // 1. Detect Existing Session
  const existingSessions = await prisma.userSession.findMany({
    where: { userId }
  });
  
  if (existingSessions.length > 0) {
    const activeSession = existingSessions.find(s => new Date() < s.expiresAt);
    if (activeSession && role !== 'admin') {
      console.log(`[Session] Active session detected for user ${email}. Rejecting new login.`);
      return { error: 'Active session detected on another device. Please log out from that device first.' };
    } else {
      // Clean up expired sessions
      await prisma.userSession.deleteMany({
        where: { 
          userId,
          expiresAt: { lt: new Date() }
        }
      });
    }
  }

  // 3. Create Session (Bind Active Session)
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  const session = await prisma.userSession.create({
    data: {
      userId,
      refreshToken,
      expiresAt
    }
  });

  const authUser = { 
    id: userId, 
    email, 
    name, 
    role: role as 'admin' | 'candidate',
    sessionId: session.id 
  };
  
  const accessToken = signToken(authUser);
  
  // Return 'token' for backward compatibility with the existing frontend
  return { token: accessToken, accessToken, refreshToken, user: authUser };
}

// POST /api/auth/register — Create a new account (candidate by default)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const finalRole = role === 'admin' ? 'admin' : 'candidate';
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        password: passwordHash,
        role: finalRole,
      },
    });

    const sessionData = await createSessionForUser(user.id, user.email, user.name, user.role);
    if ('error' in sessionData) {
      return res.status(403).json({ error: sessionData.error });
    }
    res.status(201).json(sessionData);
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionData = await createSessionForUser(user.id, user.email, user.name, user.role);
    if ('error' in sessionData) {
      return res.status(403).json({ error: sessionData.error });
    }
    res.json(sessionData);
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const session = await prisma.userSession.findUnique({
      where: { refreshToken },
      include: { user: true }
    });

    if (!session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (new Date() > session.expiresAt) {
      await prisma.userSession.delete({ where: { id: session.id } });
      return res.status(401).json({ error: 'Refresh token expired. Please log in again.' });
    }

    // Optional: Token Rotation - Delete old session, issue new one
    // For now, let's keep the same refresh token, but issue a new access token
    const authUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role as 'admin' | 'candidate',
      sessionId: session.id
    };

    const newAccessToken = signToken(authUser);
    res.json({ accessToken: newAccessToken, user: authUser });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user?.sessionId) {
      await prisma.userSession.delete({
        where: { id: req.user.sessionId }
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: 'Failed to log out' });
  }
});

// GET /api/auth/me — Return the current authenticated user
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
