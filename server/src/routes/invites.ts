import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { signToken } from '../middleware/auth';
import { availabilityError } from './attempts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteWithCount = {
  id: number;
  token: string;
  assessmentId: number;
  label: string;
  maxUses: number | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  _count: { redemptions: number };
};

// Why a link can't be used right now, or null when it's valid
function inviteProblem(invite: InviteWithCount): string | null {
  if (invite.revokedAt) return 'This link has been turned off by the organiser.';
  if (invite.expiresAt && invite.expiresAt < new Date()) return 'This link has expired.';
  if (invite.maxUses !== null && invite._count.redemptions >= invite.maxUses) return 'This link has reached its limit of participants.';
  return null;
}

function inviteState(invite: InviteWithCount): 'active' | 'revoked' | 'expired' | 'full' {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && invite.expiresAt < new Date()) return 'expired';
  if (invite.maxUses !== null && invite._count.redemptions >= invite.maxUses) return 'full';
  return 'active';
}

// ═══════════════════════════════════════════
// Admin routes — mounted at /api/invites (behind authenticate)
// ═══════════════════════════════════════════
export const adminInviteRoutes = Router();
adminInviteRoutes.use(adminOnly);

// GET /api/invites?assessmentId=1 — Links for an assessment, with who joined through each
adminInviteRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(String(req.query.assessmentId));
    if (isNaN(assessmentId)) return res.status(400).json({ error: 'assessmentId is required' });

    const invites = await prisma.inviteLink.findMany({
      where: { assessmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { createdAt: true, user: { select: { name: true, email: true } } },
        },
      },
    });

    res.json(
      invites.map(({ redemptions, ...i }) => ({
        ...i,
        uses: i._count.redemptions,
        state: inviteState(i),
        participants: redemptions.map((r) => ({ name: r.user.name, email: r.user.email, joinedAt: r.createdAt })),
      }))
    );
  } catch (error) {
    console.error('Error listing invites:', error);
    res.status(500).json({ error: 'Failed to load links' });
  }
});

// POST /api/invites — Create a shareable link
adminInviteRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const assessmentId = Number(req.body.assessmentId);
    const label = typeof req.body.label === 'string' ? req.body.label.trim().slice(0, 100) : '';
    const maxUses = req.body.maxUses === null || req.body.maxUses === undefined || req.body.maxUses === '' ? null : Number(req.body.maxUses);
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

    if (!Number.isInteger(assessmentId)) return res.status(400).json({ error: 'assessmentId is required' });
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)) {
      return res.status(400).json({ error: 'Participant limit must be a whole number from 1 to 100000' });
    }
    if (expiresAt && (isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
      return res.status(400).json({ error: 'Expiry must be a date in the future' });
    }

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true } });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const invite = await prisma.inviteLink.create({
      data: {
        assessmentId,
        label,
        maxUses,
        expiresAt,
        // 18 random bytes → 24 URL-safe characters; unguessable
        token: crypto.randomBytes(18).toString('base64url'),
      },
      include: { _count: { select: { redemptions: true } } },
    });
    res.status(201).json({ ...invite, uses: 0, state: inviteState(invite), participants: [] });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// POST /api/invites/:id/revoke — Turn a link off (people already in the test can finish)
adminInviteRoutes.post('/:id/revoke', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await prisma.inviteLink.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await prisma.inviteLink.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: 'Link not found' });
    }
    res.json({ revoked: true });
  } catch (error) {
    console.error('Error revoking invite:', error);
    res.status(500).json({ error: 'Failed to turn off link' });
  }
});

// ═══════════════════════════════════════════
// Public routes — mounted at /api/public/invite (no login required)
// ═══════════════════════════════════════════
export const publicInviteRoutes = Router();

async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return prisma.inviteLink.findUnique({
    where: { token },
    include: {
      _count: { select: { redemptions: true } },
      assessment: {
        select: {
          id: true, name: true, description: true, instructions: true, timeLimitMinutes: true, passingScore: true,
          status: true, startAt: true, endAt: true, _count: { select: { questions: true } },
        },
      },
    },
  });
}

// GET /api/public/invite/:token — What the link is for, and whether it can be used
publicInviteRoutes.get('/:token', async (req: Request, res: Response) => {
  try {
    const invite = await findInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'This link is not valid. Check that you copied the whole link.' });

    const a = invite.assessment;
    const problem = inviteProblem(invite) ?? availabilityError(a);
    res.json({
      assessment: {
        name: a.name,
        description: a.description,
        timeLimitMinutes: a.timeLimitMinutes,
        passingScore: a.passingScore,
        questionCount: a._count.questions,
        startAt: a.startAt,
        endAt: a.endAt,
      },
      label: invite.label,
      canJoin: !problem,
      problem,
    });
  } catch (error) {
    console.error('Error reading invite:', error);
    res.status(500).json({ error: 'Failed to load this link' });
  }
});

// POST /api/public/invite/:token/join — Register (or return) as a guest and get a login token
publicInviteRoutes.post('/:token/join', async (req: Request, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Please enter your full name' });
    if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: 'Please enter a valid email address' });

    const invite = await findInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'This link is not valid.' });

    let user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.isGuest) {
      // A real account must sign in with its password — a link can't be used to act as that account
      return res.status(409).json({ error: 'This email already has an account. Please sign in with your password instead.', code: 'HAS_ACCOUNT' });
    }

    const alreadyJoined = user
      ? await prisma.inviteRedemption.findUnique({ where: { inviteId_userId: { inviteId: invite.id, userId: user.id } } })
      : null;

    // Returning guests can always get back in to resume; new people need a usable link and an open test
    if (!alreadyJoined) {
      const problem = inviteProblem(invite) ?? availabilityError(invite.assessment);
      if (problem) return res.status(403).json({ error: problem });
    }

    if (!user) {
      // Results are keyed by display name, so keep names unique across people
      const clash = await prisma.user.findFirst({ where: { name }, select: { id: true } });
      user = await prisma.user.create({
        data: {
          name: clash ? `${name} (${email})` : name,
          email,
          // Guests never sign in with a password; this random hash just satisfies the column
          password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
          role: 'candidate',
          isGuest: true,
        },
      });
    }

    if (!alreadyJoined) {
      await prisma.inviteRedemption.create({ data: { inviteId: invite.id, userId: user.id } });
    }

    const authUser = { id: user.id, email: user.email, name: user.name, role: 'candidate' as const, guest: true };
    res.json({ token: signToken(authUser), user: authUser, assessmentId: invite.assessment.id });
  } catch (error) {
    console.error('Error joining via invite:', error);
    res.status(500).json({ error: 'Failed to join the assessment' });
  }
});
