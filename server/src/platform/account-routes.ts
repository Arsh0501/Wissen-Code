import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticate } from '../middleware/auth';
import {
  accountLink,
  enqueueMail,
  mailConfigured,
  tokenHash,
} from './communication';
const router = Router();
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
router.post(
  '/forgot-password',
  wrap(async (req, res) => {
    const { email } = z.object({ email: z.email().max(254) }).parse(req.body);
    if (!mailConfigured())
      return res.status(503).json({
        error:
          'Account recovery email is not configured. Contact your administrator.',
      });
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (user && !user.isGuest) {
      const link = await accountLink(user.id, 'reset');
      await enqueueMail(
        user.email,
        'Reset your Wissen Code password',
        `Reset your password within 30 minutes:\n${link}\n\nIf you did not request this, ignore this email.`,
      );
    }
    res.json({
      message: 'If the account exists, a recovery email will be sent.',
    });
  }),
);
router.post(
  '/reset-password',
  wrap(async (req, res) => {
    const data = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const password = await bcrypt.hash(data.password, 12);
    const userId = await prisma.$transaction(async (tx) => {
      const token = await tx.accountToken.findUnique({
        where: { tokenHash: tokenHash(data.token) },
      });
      if (
        !token ||
        token.purpose !== 'reset' ||
        token.consumedAt ||
        token.expiresAt < new Date()
      )
        return null;
      const claim = await tx.accountToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!claim.count) return null;
      await tx.user.update({ where: { id: token.userId }, data: { password } });
      await tx.userSession.deleteMany({ where: { userId: token.userId } });
      await tx.accountToken.updateMany({
        where: { userId: token.userId, purpose: 'reset', consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return token.userId;
    });
    if (!userId)
      return res
        .status(400)
        .json({ error: 'This recovery link is invalid or expired.' });
    const { getIO } = await import('../socket');
    try {
      getIO().in(`auth:user:${userId}`).disconnectSockets(true);
    } catch {}
    res.json({ message: 'Password reset. Sign in again on your device.' });
  }),
);
router.post(
  '/request-verification',
  authenticate,
  wrap(async (req, res) => {
    if (!mailConfigured())
      return res
        .status(503)
        .json({ error: 'Verification email is not configured.' });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
    });
    if (user.isGuest)
      return res
        .status(403)
        .json({ error: 'Guest accounts cannot verify an email address.' });
    if (!user.emailVerifiedAt)
      await enqueueMail(
        user.email,
        'Verify your Wissen Code email',
        `Verify your email within 24 hours:\n${await accountLink(user.id, 'verify')}`,
      );
    res.json({ message: 'Verification email requested.' });
  }),
);
router.post(
  '/verify-email',
  wrap(async (req, res) => {
    const { token: raw } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const ok = await prisma.$transaction(async (tx) => {
      const token = await tx.accountToken.findUnique({
        where: { tokenHash: tokenHash(raw) },
      });
      if (
        !token ||
        token.purpose !== 'verify' ||
        token.consumedAt ||
        token.expiresAt < new Date()
      )
        return false;
      const claim = await tx.accountToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!claim.count) return false;
      await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      });
      return true;
    });
    res
      .status(ok ? 200 : 400)
      .json(
        ok
          ? { message: 'Email verified.' }
          : { error: 'Verification link is invalid or expired.' },
      );
  }),
);
export default router;
