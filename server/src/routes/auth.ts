import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../prisma';
import { authenticate, signToken } from '../middleware/auth';

import { sendOtpMail } from '../platform/notifications';
const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Helper to generate a refresh token and create a session.
 * Enforces one-device policy: Invalidates any previous sessions for this user.
 */
export async function createSessionForUser(
  userId: number,
  email: string,
  name: string,
  role: string,
  guest = false,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize logins for the same account, including concurrent requests on different servers.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.userSession.deleteMany({
      where: { userId, expiresAt: { lte: new Date() } },
    });
    if (
      role === 'candidate' &&
      (await tx.userSession.findFirst({ where: { userId } }))
    ) {
      return {
        error:
          'Active session detected on another device. Please log out from that device first.',
      };
    }
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const session = await tx.userSession.create({
      data: {
        userId,
        refreshToken: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000),
      },
    });
    const authUser = {
      id: userId,
      email,
      name,
      role: (role === 'candidate' ? 'candidate' : 'admin') as
        'admin' | 'candidate',
      accessRole: role as import('../platform/permissions').AccessRole,
      sessionId: session.id,
      guest,
    };
    const accessToken = signToken(authUser);
    return { token: accessToken, accessToken, refreshToken, user: authUser };
  });
}
export function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/register — Create a new account (candidate by default)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res
        .status(400)
        .json({ error: 'name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing && !existing.isGuest) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists' });
    }

    const finalRole = 'candidate';
    const passwordHash = await bcrypt.hash(password, 10);

    // A guest row (created when this email opened an invite link) has no usable
    // password; signing up with that email upgrades it into a full account so the
    // guest's assessment history stays attached. Email ownership is confirmed by OTP.
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: name.trim(),
            password: passwordHash,
            isGuest: false,
            emailVerifiedAt: null,
          },
        })
      : await prisma.user.create({
          data: {
            name: name.trim(),
            email: email.toLowerCase(),
            password: passwordHash,
            role: finalRole,
          },
        });

    const sessionData = await createSessionForUser(
      user.id,
      user.email,
      user.name,
      user.role,
    );
    if ('error' in sessionData) {
      return res.status(403).json({ error: sessionData.error });
    }
    // The account works immediately; the OTP confirms the address in the background.
    const verification = await sendOtpMail('email-verification', user).catch(
      (error) => {
        console.error('Verification OTP failed:', error instanceof Error ? error.message : error);
        return { status: 'off' as const, expiresInSeconds: 0 };
      },
    );
    res.status(201).json({ ...sessionData, verification });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || user.isGuest) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Each portal only signs in its own audience; tell the client where to go instead.
    const { audience } = req.body;
    const portal = user.role === 'candidate' ? 'candidate' : 'hiring';
    if ((audience === 'hiring' || audience === 'candidate') && audience !== portal) {
      return res.status(403).json({
        error:
          portal === 'candidate'
            ? 'This is the hiring team sign-in. Candidates sign in from the candidate space.'
            : 'This is the candidate sign-in. Team members sign in from the hiring workspace.',
        code: 'WRONG_PORTAL',
        portal,
      });
    }

    const sessionData = await createSessionForUser(
      user.id,
      user.email,
      user.name,
      user.role,
    );
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
    if (
      typeof refreshToken !== 'string' ||
      !/^[a-f0-9]{80}$/.test(refreshToken)
    ) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const session = await prisma.userSession.findUnique({
      where: { refreshToken: hashRefreshToken(refreshToken) },
      include: { user: true },
    });

    if (!session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (new Date() > session.expiresAt) {
      await prisma.userSession.delete({ where: { id: session.id } });
      return res
        .status(401)
        .json({ error: 'Refresh token expired. Please log in again.' });
    }

    // Optional: Token Rotation - Delete old session, issue new one
    // For now, let's keep the same refresh token, but issue a new access token
    const authUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user.role === 'candidate' ? 'candidate' : 'admin') as
        'admin' | 'candidate',
      accessRole: session.user
        .role as import('../platform/permissions').AccessRole,
      sessionId: session.id,
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
      await prisma.userSession.deleteMany({
        where: { id: req.user.sessionId, userId: req.user.id },
      });
      try {
        (await import('../socket'))
          .getIO()
          .in(`auth:session:${req.user.sessionId}`)
          .disconnectSockets(true);
      } catch {}
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: 'Failed to log out' });
  }
});

// Profile & Password Handlers

// GET profile — Returns fresh user details directly from database
const handleGetProfile = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isGuest: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        ...user,
        role: user.role === 'candidate' ? 'candidate' : 'admin',
        accessRole: user.role,
        guest: user.isGuest,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// PUT/PATCH profile — Update profile (email is immutable, only name can be changed)
const handleUpdateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, email } = req.body;

    // Fetch existing user to verify email
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Explicitly disallow changing the email address
    if (
      email !== undefined &&
      (typeof email !== 'string' ||
        email.trim().toLowerCase() !== currentUser.email.toLowerCase())
    ) {
      return res.status(400).json({ error: 'Email address cannot be changed' });
    }

    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const conflict = await prisma.user.findFirst({
      where: { name: name.trim(), NOT: { id: userId } },
      select: { id: true },
    });
    if (conflict)
      return res.status(409).json({ error: 'This name is already in use' });

    const updatedUser = await prisma.$transaction(async (tx) => {
      // Assessment records currently use display names as their candidate key.
      await tx.assessmentSession.updateMany({
        where: {
          candidateUserId: userId,
        },
        data: { candidateName: name.trim() },
      });
      await tx.submission.updateMany({
        where: { session: { candidateUserId: userId } },
        data: { candidateName: name.trim() },
      });
      return tx.user.update({
        where: { id: userId },
        data: { name: name.trim() },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isGuest: true,
          createdAt: true,
        },
      });
    });

    // Re-sign access token with updated profile information
    const authUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: (updatedUser.role === 'candidate' ? 'candidate' : 'admin') as
        'admin' | 'candidate',
      accessRole:
        updatedUser.role as import('../platform/permissions').AccessRole,
      sessionId: req.user!.sessionId,
      guest: updatedUser.isGuest,
    };

    const token = signToken(authUser);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        ...updatedUser,
        role: updatedUser.role === 'candidate' ? 'candidate' : 'admin',
        accessRole: updatedUser.role,
        guest: updatedUser.isGuest,
      },
      token,
      accessToken: token,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// PUT/PATCH password — Update user password
const handleUpdatePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      !newPassword
    ) {
      return res
        .status(400)
        .json({ error: 'currentPassword and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });
    await prisma.userSession.deleteMany({ where: { userId } });
    try {
      (await import('../socket'))
        .getIO()
        .in(`auth:user:${userId}`)
        .disconnectSockets(true);
    } catch {}
    res.json({ success: true, message: 'Password updated. Sign in again.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// GET Profile routes
router.get('/me', authenticate, handleGetProfile);
router.get('/profile', authenticate, handleGetProfile);
router.get('/', authenticate, handleGetProfile);

// PUT/PATCH Profile routes
router.put('/me', authenticate, handleUpdateProfile);
router.patch('/me', authenticate, handleUpdateProfile);
router.put('/profile', authenticate, handleUpdateProfile);
router.patch('/profile', authenticate, handleUpdateProfile);
router.put('/', authenticate, handleUpdateProfile);
router.patch('/', authenticate, handleUpdateProfile);

// Password routes
router.put('/password', authenticate, handleUpdatePassword);
router.put('/change-password', authenticate, handleUpdatePassword);

export default router;
