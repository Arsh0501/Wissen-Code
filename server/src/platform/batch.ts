import prisma from '../prisma';
import { summarizeCandidates } from '../services/stats';
import { computeEvaluation } from '../services/grading';
import { appURL, enqueueMail, mailConfigured } from './communication';
import { sendNow } from './notifications';

/**
 * Batch assessment automation: live monitor data, shortlisting, CSV export and the
 * emails that go out when a candidate finishes or when the whole batch is done.
 */
export interface ShortlistRule {
  mode: 'top' | 'threshold' | 'passed';
  topN: number;
  minScore: number;
  excludeFlagged: boolean;
  maxFlags: number;
}
export interface Automation {
  notifyOnCompletion: boolean;
  autoShortlist: boolean;
  notifyEmails: string[];
  shortlist: ShortlistRule;
  shortlistSentAt: string | null;
}
export const DEFAULT_RULE: ShortlistRule = {
  mode: 'top',
  topN: 10,
  minScore: 0,
  excludeFlagged: true,
  maxFlags: 3,
};
export function readAutomation(raw: unknown): Automation {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const rule = (a.shortlist && typeof a.shortlist === 'object' ? a.shortlist : {}) as Partial<ShortlistRule>;
  return {
    notifyOnCompletion: a.notifyOnCompletion !== false,
    autoShortlist: a.autoShortlist === true,
    notifyEmails: Array.isArray(a.notifyEmails) ? a.notifyEmails.filter((e) => typeof e === 'string') : [],
    shortlist: {
      mode: ['top', 'threshold', 'passed'].includes(rule.mode as string) ? (rule.mode as ShortlistRule['mode']) : DEFAULT_RULE.mode,
      topN: Number.isInteger(rule.topN) && rule.topN! > 0 ? rule.topN! : DEFAULT_RULE.topN,
      minScore: typeof rule.minScore === 'number' ? rule.minScore : DEFAULT_RULE.minScore,
      excludeFlagged: rule.excludeFlagged !== false,
      maxFlags: Number.isInteger(rule.maxFlags) ? rule.maxFlags! : DEFAULT_RULE.maxFlags,
    },
    shortlistSentAt: typeof a.shortlistSentAt === 'string' ? a.shortlistSentAt : null,
  };
}

export interface MonitorRow {
  key: string;
  name: string;
  email: string | null;
  status: 'not-started' | 'in-progress' | 'completed';
  isProvisional: boolean;
  sessionId: number | null;
  candidateUserId: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  remainingSeconds: number | null;
  answered: number;
  totalQuestions: number;
  overallScore: number;
  marksObtained: number;
  totalMarks: number;
  passed: boolean;
  timeTakenSeconds: number | null;
  tabSwitches: number;
  cameraFlags: number;
  flagReasons: string[];
  shortlisted: boolean;
  rank: number | null;
}

export async function monitorData(assessmentId: number) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      name: true,
      status: true,
      startAt: true,
      endAt: true,
      timeLimitMinutes: true,
      passingScore: true,
      allowedEmails: true,
      requireCamera: true,
      automation: true,
      questions: { select: { questionId: true, marks: true } },
    },
  });
  if (!assessment) return null;
  const automation = readAutomation(assessment.automation);
  const [sessions, submissions, redemptions] = await Promise.all([
    prisma.assessmentSession.findMany({
      where: { assessmentId },
      select: {
        id: true,
        candidateName: true,
        candidateUserId: true,
        gradingStatus: true,
        startedAt: true,
        finishedAt: true,
        durationMinutes: true,
        _count: { select: { tabSwitches: true } },
        drafts: { select: { isAnswered: true } },
        snapshots: {
          where: { reason: { notIn: ['interval', 'start'] } },
          select: { reason: true },
        },
      },
    }),
    prisma.submission.findMany({
      where: { assessmentId },
      select: { candidateName: true, questionId: true, score: true, createdAt: true, sessionId: true, status: true },
    }),
    prisma.inviteRedemption.findMany({
      where: { invite: { assessmentId } },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const summaries = summarizeCandidates(assessment.questions, assessment.passingScore, submissions, sessions);
  const userIds = [...new Set(sessions.map((s) => s.candidateUserId).filter((x): x is number => !!x))];
  const users = await prisma.user.findMany({
    where: { OR: [{ id: { in: userIds } }, { name: { in: summaries.map((c) => c.name) } }] },
    select: { id: true, name: true, email: true },
  });
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const emailByName = new Map(users.map((u) => [u.name, u.email]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const now = Date.now();

  const rows: MonitorRow[] = summaries.map((c) => {
    const session = c.sessionId ? sessionById.get(c.sessionId) : undefined;
    const email = (c.candidateUserId ? emailById.get(c.candidateUserId) : undefined) ?? emailByName.get(c.name) ?? null;
    const limitMs = ((session?.durationMinutes ?? assessment.timeLimitMinutes) || 0) * 60000;
    const remaining =
      c.status === 'in-progress' && session
        ? Math.max(0, Math.round((session.startedAt.getTime() + limitMs - now) / 1000))
        : null;
    const timeTaken =
      session?.finishedAt && session.startedAt
        ? Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 1000)
        : null;
    return {
      key: c.candidateUserId ? `user:${c.candidateUserId}` : `name:${c.name}`,
      name: c.name,
      email,
      status: c.status,
      isProvisional: !!c.isProvisional,
      sessionId: c.sessionId ?? null,
      candidateUserId: c.candidateUserId ?? null,
      startedAt: c.startedAt,
      submittedAt: c.submittedAt,
      remainingSeconds: remaining,
      answered: session ? session.drafts.filter((d) => d.isAnswered).length : c.attemptedQuestions,
      totalQuestions: c.totalQuestions,
      overallScore: Math.round(c.overallScore * 10) / 10,
      marksObtained: c.marksObtained,
      totalMarks: c.totalMarks,
      passed: c.passed,
      timeTakenSeconds: timeTaken,
      tabSwitches: session?._count.tabSwitches ?? 0,
      cameraFlags: session?.snapshots.length ?? 0,
      flagReasons: [...new Set(session?.snapshots.map((s) => s.reason) ?? [])],
      shortlisted: false,
      rank: null,
    };
  });
  // Everyone expected but not started yet: allow-list and invite-link joiners without a session.
  const seenEmails = new Set(rows.map((r) => r.email?.toLowerCase()).filter(Boolean));
  const expectedEmails = new Set<string>([
    ...(JSON.parse(assessment.allowedEmails || '[]') as string[]).map((e) => e.toLowerCase()),
    ...redemptions.map((r) => r.user.email.toLowerCase()),
  ]);
  const nameByEmail = new Map(redemptions.map((r) => [r.user.email.toLowerCase(), r.user.name]));
  for (const email of expectedEmails) {
    if (seenEmails.has(email)) continue;
    rows.push({
      key: `invite:${email}`,
      name: nameByEmail.get(email) ?? email.split('@')[0],
      email,
      status: 'not-started',
      isProvisional: false,
      sessionId: null,
      candidateUserId: null,
      startedAt: null,
      submittedAt: null,
      remainingSeconds: null,
      answered: 0,
      totalQuestions: assessment.questions.length,
      overallScore: 0,
      marksObtained: 0,
      totalMarks: assessment.questions.reduce((a, q) => a + q.marks, 0),
      passed: false,
      timeTakenSeconds: null,
      tabSwitches: 0,
      cameraFlags: 0,
      flagReasons: [],
      shortlisted: false,
      rank: null,
    });
  }
  const shortlist = computeShortlist(rows, automation.shortlist);
  for (const s of shortlist) {
    const row = rows.find((r) => r.key === s.key)!;
    row.shortlisted = true;
    row.rank = s.rank;
  }
  const expected = Math.max(expectedEmails.size, rows.filter((r) => r.status !== 'not-started').length);
  const completed = rows.filter((r) => r.status === 'completed');
  return {
    assessment: {
      id: assessment.id,
      name: assessment.name,
      status: assessment.status,
      startAt: assessment.startAt,
      endAt: assessment.endAt,
      timeLimitMinutes: assessment.timeLimitMinutes,
      passingScore: assessment.passingScore,
      requireCamera: assessment.requireCamera,
    },
    automation,
    counts: {
      expected,
      notStarted: rows.filter((r) => r.status === 'not-started').length,
      inProgress: rows.filter((r) => r.status === 'in-progress').length,
      completed: completed.length,
      grading: completed.filter((r) => r.isProvisional).length,
      passed: completed.filter((r) => r.passed && !r.isProvisional).length,
      shortlisted: shortlist.length,
      flagged: rows.filter((r) => r.cameraFlags > automation.shortlist.maxFlags || r.tabSwitches >= 3).length,
    },
    rows: rows.sort((a, b) => {
      const order = { 'in-progress': 0, completed: 1, 'not-started': 2 } as const;
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      if (a.status === 'completed') return b.overallScore - a.overallScore;
      return (a.startedAt ?? '').localeCompare(b.startedAt ?? '');
    }),
    generatedAt: new Date().toISOString(),
  };
}

export function computeShortlist(rows: MonitorRow[], rule: ShortlistRule) {
  const eligible = rows.filter(
    (r) =>
      r.status === 'completed' &&
      !r.isProvisional &&
      (!rule.excludeFlagged || (r.cameraFlags <= rule.maxFlags && r.tabSwitches < 3)),
  );
  const filtered =
    rule.mode === 'passed'
      ? eligible.filter((r) => r.passed)
      : rule.mode === 'threshold'
        ? eligible.filter((r) => r.overallScore >= rule.minScore)
        : eligible;
  const ordered = [...filtered].sort(
    (a, b) =>
      b.overallScore - a.overallScore ||
      (a.timeTakenSeconds ?? Infinity) - (b.timeTakenSeconds ?? Infinity),
  );
  return (rule.mode === 'top' ? ordered.slice(0, rule.topN) : ordered).map((r, i) => ({
    ...r,
    rank: i + 1,
  }));
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function shortlistCsv(assessmentId: number, rows: MonitorRow[]) {
  const header = [
    'Rank', 'Name', 'Email', 'Score %', 'Marks', 'Total marks', 'Passed', 'Time taken (min)',
    'Tab switches', 'Camera flags', 'Submitted at', 'Report',
  ];
  const lines = rows.map((r) =>
    [
      r.rank,
      r.name,
      r.email ?? '',
      r.overallScore.toFixed(1),
      r.marksObtained,
      r.totalMarks,
      r.passed ? 'yes' : 'no',
      r.timeTakenSeconds === null ? '' : Math.round(r.timeTakenSeconds / 60),
      r.tabSwitches,
      r.cameraFlags,
      r.submittedAt ?? '',
      appURL(`/admin/reports/${encodeURIComponent(r.name)}/${assessmentId}`),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}

async function adminRecipients(extra: string[] = []) {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isGuest: false },
    select: { email: true },
  });
  return [...new Set([...admins.map((a) => a.email.toLowerCase()), ...extra.map((e) => e.toLowerCase())])];
}

/** Emails the team a one-screen summary + report link as soon as a candidate's grading finishes. */
export async function notifyCompletion(sessionId: number) {
  if (!mailConfigured()) return;
  const session = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      assessmentId: true,
      candidateName: true,
      candidateUserId: true,
      startedAt: true,
      finishedAt: true,
      _count: { select: { tabSwitches: true } },
      snapshots: { where: { reason: { notIn: ['interval', 'start'] } }, select: { id: true } },
      assessment: { select: { name: true, automation: true, passingScore: true } },
    },
  });
  if (!session) return;
  const automation = readAutomation(session.assessment.automation);
  if (!automation.notifyOnCompletion) return;
  // Synthetic load-test candidates never trigger team mail.
  if (session.candidateUserId) {
    const user = await prisma.user.findUnique({ where: { id: session.candidateUserId }, select: { email: true } });
    if (user?.email.endsWith('@loadtest.local')) return;
  }
  const evaluation = await computeEvaluation(session.assessmentId, session.candidateName, session.candidateUserId ?? undefined);
  const data = await monitorData(session.assessmentId);
  const minutes = session.finishedAt ? Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 60000) : null;
  const score = evaluation ? `${evaluation.percentage.toFixed(1)}% (${evaluation.marksObtained}/${evaluation.totalMarks} marks)` : 'pending';
  const verdict = evaluation ? (evaluation.passed ? 'PASSED' : 'did not pass') : 'grading';
  const flags = session.snapshots.length;
  const body = [
    `${session.candidateName} finished "${session.assessment.name}".`,
    '',
    `Score: ${score} — ${verdict} (pass mark ${session.assessment.passingScore}%)`,
    minutes !== null ? `Time taken: ${minutes} min` : '',
    `Integrity: ${session._count.tabSwitches} tab switch(es), ${flags} camera flag(s)${session._count.tabSwitches >= 3 || flags > automation.shortlist.maxFlags ? ' — review recommended' : ''}`,
    data ? `Batch progress: ${data.counts.completed} completed, ${data.counts.inProgress} in progress, ${data.counts.notStarted} not started.` : '',
    '',
    `Open the full report: ${appURL(`/admin/reports/${encodeURIComponent(session.candidateName)}/${session.assessmentId}`)}`,
    `Live monitor: ${appURL(`/admin/assessments/${session.assessmentId}/monitor`)}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  const ids: string[] = [];
  for (const to of await adminRecipients(automation.notifyEmails)) {
    const message = await enqueueMail(
      to,
      `${session.candidateName} finished ${session.assessment.name}: ${evaluation ? `${evaluation.percentage.toFixed(0)}%` : 'graded'}`,
      body,
    );
    ids.push(message.id);
  }
  sendNow(ids);
}

/** Sends the shortlist CSV to the team (or one address) and returns how many mails were queued. */
export async function sendShortlist(assessmentId: number, to?: string[], reason = 'requested') {
  const data = await monitorData(assessmentId);
  if (!data) return 0;
  const shortlisted = data.rows.filter((r) => r.shortlisted).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const csv = shortlistCsv(assessmentId, shortlisted);
  const rule = data.automation.shortlist;
  const ruleText =
    rule.mode === 'top'
      ? `top ${rule.topN} by score`
      : rule.mode === 'threshold'
        ? `score ≥ ${rule.minScore}%`
        : 'everyone who passed';
  const body = [
    `Shortlist for "${data.assessment.name}" (${reason}).`,
    '',
    `${shortlisted.length} shortlisted out of ${data.counts.completed} completed (${data.counts.expected} expected).`,
    `Rule: ${ruleText}${rule.excludeFlagged ? `, excluding candidates with more than ${rule.maxFlags} camera flags or a tab-switch auto-submit` : ''}.`,
    '',
    ...shortlisted.slice(0, 15).map((r) => `${r.rank}. ${r.name} — ${r.overallScore.toFixed(1)}%${r.email ? ` · ${r.email}` : ''}`),
    shortlisted.length > 15 ? `…and ${shortlisted.length - 15} more in the attached CSV.` : '',
    '',
    `The full list is attached as CSV. Live monitor: ${appURL(`/admin/assessments/${assessmentId}/monitor`)}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  const recipients = to?.length ? to : await adminRecipients(data.automation.notifyEmails);
  const ids: string[] = [];
  for (const recipient of recipients) {
    const message = await enqueueMail(
      recipient,
      `Shortlist: ${data.assessment.name} (${shortlisted.length} candidates)`,
      body,
      undefined,
      new Date(),
      [
        {
          filename: `shortlist-${data.assessment.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`,
          contentType: 'text/csv',
          content: Buffer.from(csv, 'utf8').toString('base64'),
        },
      ],
    );
    ids.push(message.id);
  }
  sendNow(ids);
  return ids.length;
}

/**
 * Runs periodically: when an assessment with auto-shortlist is over (deadline passed, or
 * everyone expected has finished and nobody is mid-test), send the shortlist once.
 */
export async function sweepAssessmentAutomation() {
  if (!mailConfigured()) return 0;
  const candidates = await prisma.assessment.findMany({
    where: { status: 'published' },
    select: { id: true, automation: true, endAt: true },
  });
  let sent = 0;
  for (const a of candidates) {
    const automation = readAutomation(a.automation);
    if (!automation.autoShortlist || automation.shortlistSentAt) continue;
    const data = await monitorData(a.id);
    if (!data) continue;
    const closed = !!a.endAt && a.endAt.getTime() < Date.now();
    const everyoneDone =
      data.counts.expected > 0 &&
      data.counts.inProgress === 0 &&
      data.counts.notStarted === 0 &&
      data.counts.grading === 0;
    if (!closed && !everyoneDone) continue;
    await sendShortlist(a.id, undefined, closed ? 'assessment closed' : 'all candidates finished');
    await prisma.assessment.update({
      where: { id: a.id },
      data: { automation: { ...(a.automation as object), shortlistSentAt: new Date().toISOString() } },
    });
    sent++;
  }
  return sent;
}
