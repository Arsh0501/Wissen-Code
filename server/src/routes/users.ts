import { ownerOnly } from '../platform/auth/permissions';
import { accountLink, enqueueMail, mailConfigured } from '../platform/mail/communication';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../database/prisma';
import { adminOrInterviewer } from '../middleware/adminOnly';
const router = Router();
router.use(adminOrInterviewer);

router.get('/interviewers', async (_req, res, next) => {
  try {
    const interviewers = await prisma.user.findMany({
      where: {
        role: { in: ['interviewer', 'admin'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(interviewers);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const excludeRole =
      typeof req.query.excludeRole === 'string' ? req.query.excludeRole : undefined;

    let where: any = {};
    if (role) {
      where.role = role;
    } else if (excludeRole) {
      where.role = { not: excludeRole };
    } else if ((req.user?.accessRole ?? req.user?.role) !== 'admin') {
      where.role = 'candidate';
    }

    const search =
      typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
    if (search)
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    res.json(
      await prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isGuest: true,
          createdAt: true,
          _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } },
        },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    );
  } catch (error) {
    next(error);
  }
});
// Revoke server-side sessions rather than changing the JWT secret for every user.
router.post('/:id/revoke-sessions', ownerOnly, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!target) return null;
      const deleted = await tx.userSession.deleteMany({ where: { userId: id } });
      await tx.sessionRevocationAudit.create({
        data: {
          actorUserId: req.user!.id,
          targetUserId: id,
          revokedSessions: deleted.count,
        },
      });
      return { revokedSessions: deleted.count };
    });
    if (!result) return res.status(404).json({ error: 'User not found' });
    try {
      (await import('../socket')).getIO().in(`auth:user:${id}`).disconnectSockets(true);
    } catch (error) {
      console.error(
        'Session revocation socket disconnect failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
    res.json({ ...result, message: 'Login sessions revoked. The user must sign in again.' });
  } catch (error) {
    next(error);
  }
});
router.put('/:id/role', ownerOnly, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { role } = z
      .object({
        role: z.enum(['admin', 'interviewer', 'candidate']),
      })
      .parse(req.body);
    if (id === req.user!.id)
      return res.status(409).json({ error: 'Use another administrator to change your own role' });
    const user = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
      const user = await tx.user.update({
        where: { id },
        data: { role },
        select: { id: true, name: true, email: true, role: true },
      });
      await tx.userSession.deleteMany({ where: { userId: id } });
      return user;
    });
    try {
      (await import('../socket')).getIO().in(`auth:user:${id}`).disconnectSockets(true);
    } catch {}
    res.json(user);
  } catch (error) {
    next(error);
  }
});
router.post('/invite', ownerOnly, async (req, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(254),
        role: z.enum(['admin', 'interviewer']),
      })
      .parse(req.body);
    if (!mailConfigured())
      return res.status(503).json({
        error: 'Configure email delivery before inviting team members',
      });
    const user = await prisma.user.create({
      data: {
        ...input,
        email: input.email.toLowerCase(),
        password: await bcrypt.hash(crypto.randomBytes(40).toString('hex'), 12),
      },
    });
    await enqueueMail(
      user.email,
      'Join your Wissen Code team',
      `Hello ${user.name},\nSet your password to join as ${user.role}:\n${await accountLink(user.id, 'reset')}`,
      req.user!.id,
    );
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error: any) {
    if (error.code === 'P2002')
      return res.status(409).json({
        error: 'This email already has an account. Change its role instead.',
      });
    next(error);
  }
});
export default router;
