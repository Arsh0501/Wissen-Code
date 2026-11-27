import prisma from '../../database/prisma';
import { WorkflowError } from '../ai/structured-ai';

export function restartAvailability(
  a: { status: string; startAt: Date | null; endAt: Date | null },
  allowClosed: boolean,
) {
  if (!['published', 'closed'].includes(a.status))
    return 'Publish this assessment before authorizing a restart';
  if (a.startAt && a.startAt > new Date()) return 'This assessment has not opened yet';
  if ((a.status === 'closed' || (a.endAt && a.endAt < new Date())) && !allowClosed)
    return 'This assessment has closed. Explicitly allow this candidate to restart the closed test.';
  return null;
}

export async function restartAssessment(
  assessmentId: number,
  candidateUserId: number,
  admin: { id: number; email: string },
  reason: string,
  allowClosed: boolean,
) {
  return prisma.$transaction(async (tx) => {
    // Same identity lock as attempt creation: reset and start cannot race.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidateUserId} FOR UPDATE`;
    const candidate = await tx.user.findUnique({ where: { id: candidateUserId } });
    const assessment = await tx.assessment.findUnique({ where: { id: assessmentId } });
    if (!candidate || candidate.role !== 'candidate' || !assessment)
      throw new WorkflowError('Candidate or assessment not found', 404);
    const blocked = restartAvailability(assessment, allowClosed);
    if (blocked) throw new WorkflowError(blocked, 409);
    const attempts = await tx.assessmentSession.findMany({
      where: { assessmentId, candidateUserId },
    });
    if (!attempts.length)
      throw new WorkflowError('This candidate has not started this assessment', 409);
    // Wait for any draft write already holding an attempt lock to finish.
    await tx.$queryRaw`SELECT id FROM "AssessmentSession" WHERE "assessmentId" = ${assessmentId} AND "candidateUserId" = ${candidateUserId} ORDER BY id FOR UPDATE`;
    const now = new Date();
    await tx.assessmentSession.updateMany({
      where: { assessmentId, candidateUserId, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    await tx.assessmentRestart.updateMany({
      where: { assessmentId, candidateUserId, consumedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.assessmentRestart.create({
      data: {
        assessmentId,
        candidateUserId,
        adminId: admin.id,
        adminEmail: admin.email,
        candidateName: candidate.name,
        reason,
        allowClosed,
        invalidatedSessionIds: attempts.filter((a) => !a.invalidatedAt).map((a) => a.id),
      },
    });
  });
}
