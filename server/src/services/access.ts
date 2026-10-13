import { Request } from 'express';
import prisma from '../prisma';

// Who may take an assessment:
//  - "anyone":      every signed-in candidate (link guests only see assessments they were invited to)
//  - "restricted":  only emails on the allow-list (exact addresses or "@domain.com" entries)
//  - "invite_only": only people who joined through one of the assessment's share links

export function parseEmailList(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function emailAllowed(email: string, allowed: string[]): boolean {
  const e = email.trim().toLowerCase();
  return allowed.some((rule) => (rule.startsWith('@') ? e.endsWith(rule) : e === rule));
}

export async function guestAssessmentIds(userId: number): Promise<number[]> {
  const rows = await prisma.inviteRedemption.findMany({
    where: { userId },
    select: { invite: { select: { assessmentId: true } } },
  });
  return Array.from(new Set(rows.map((r) => r.invite.assessmentId)));
}

type AccessRule = { id: number; accessMode: string; allowedEmails: string };

/** Filters assessments down to the ones this candidate may see/take. Admins see everything. */
export async function filterAccessible<T extends AccessRule>(req: Request, assessments: T[]): Promise<T[]> {
  const user = req.user;
  if (!user) return [];
  if (user.role === 'admin') return assessments;
  const invited = new Set(await guestAssessmentIds(user.id));
  return assessments.filter((a) => {
    if (user.guest && !invited.has(a.id)) return false;
    if (a.accessMode === 'invite_only') return invited.has(a.id);
    if (a.accessMode === 'restricted') return emailAllowed(user.email, parseEmailList(a.allowedEmails));
    return true;
  });
}

export async function canAccessAssessment(req: Request, assessmentId: number): Promise<boolean> {
  if (req.user?.role === 'admin') return true;
  const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true, accessMode: true, allowedEmails: true } });
  if (!a) return false;
  return (await filterAccessible(req, [a])).length === 1;
}
