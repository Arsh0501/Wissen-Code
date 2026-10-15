import { ownerOnly } from '../platform/permissions';
import {
  accountLink,
  enqueueMail,
  mailConfigured,
} from '../platform/communication';
import { audit } from '../platform/routes';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
const router = Router();
router.use(adminOnly);
router.get('/', async (req, res, next) => {
  try {
    res.json(
      await prisma.user.findMany({
        where:
          (req.user?.accessRole ?? req.user?.role) !== 'admin'
            ? { role: 'candidate' }
            : {},
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isGuest: true,
          createdAt: true,
        },
        orderBy: { id: 'asc' },
        take: 200,
      }),
    );
  } catch (error) {
    next(error);
  }
});
router.put('/:id/role', ownerOnly, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { role } = z
      .object({
        role: z.enum(['admin', 'recruiter', 'interviewer', 'candidate']),
      })
      .parse(req.body);
    if (id === req.user!.id)
      return res
        .status(409)
        .json({ error: 'Use another administrator to change your own role' });
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
      (await import('../socket'))
        .getIO()
        .in(`auth:user:${id}`)
        .disconnectSockets(true);
    } catch {}
    await audit(req.user!.id, 'user.role_changed', 'user', String(id), {
      role,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});
router.post('/invite', ownerOnly, async (req, res, next) => {
  try {
    if (!mailConfigured())
      return res
        .status(503)
        .json({
          error: 'Configure email delivery before inviting team members',
        });
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(254),
        role: z.enum(['admin', 'recruiter', 'interviewer']),
      })
      .parse(req.body);
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
    await audit(req.user!.id, 'user.invited', 'user', String(user.id), {
      role: user.role,
    });
    res
      .status(201)
      .json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
  } catch (error: any) {
    if (error.code === 'P2002')
      return res
        .status(409)
        .json({
          error: 'This email already has an account. Change its role instead.',
        });
    next(error);
  }
});
export default router;
