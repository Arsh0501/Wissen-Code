import { Request } from 'express';
import prisma from '../prisma';

// Guests (people who joined through an invite link) may only see the assessments they were invited to.

export async function guestAssessmentIds(userId: number): Promise<number[]> {
  const rows = await prisma.inviteRedemption.findMany({
    where: { userId },
    select: { invite: { select: { assessmentId: true } } },
  });
  return Array.from(new Set(rows.map((r) => r.invite.assessmentId)));
}

export async function canAccessAssessment(req: Request, assessmentId: number): Promise<boolean> {
  if (!req.user?.guest) return true;
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { isPractice: true },
  });
  if (assessment?.isPractice) return true;
  const ids = await guestAssessmentIds(req.user.id);
  return ids.includes(assessmentId);
}
