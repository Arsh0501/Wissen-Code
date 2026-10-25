import { Request } from 'express';
import prisma from '../prisma';

// Guests (people who joined through an invite link) may only see the assessments they were invited to.

export async function guestAssessmentIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return [];
  const rows = await prisma.inviteRedemption.findMany({
    where: {
      userId,
      invite: {
        revokedAt: null,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { OR: [{ recipientEmail: null }, { recipientEmail: { equals: user.email, mode: 'insensitive' } }] },
        ],
      },
    },
    select: { invite: { select: { assessmentId: true } } },
  });
  return Array.from(new Set(rows.map((r) => r.invite.assessmentId)));
}

export async function canAccessAssessment(
  req: Request,
  assessmentId: number,
): Promise<boolean> {
  if (!req.user?.guest) {
    if (!req.user || req.user.role !== 'candidate') return true;
    const redemptions = await prisma.inviteRedemption.findMany({ where: { userId: req.user.id, invite: { assessmentId } }, select: { invite: { select: { recipientEmail: true } } } });
    // Recheck personalized-link ownership when starting or accessing an attempt.
    return !redemptions.length || redemptions.some(row => !row.invite.recipientEmail || row.invite.recipientEmail.toLowerCase() === req.user!.email.toLowerCase());
  }
  const ids = await guestAssessmentIds(req.user.id);
  return ids.includes(assessmentId);
}
