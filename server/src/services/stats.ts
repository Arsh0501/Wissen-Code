// Marks-weighted candidate summaries computed in memory, so list views don't
// need a query per candidate. Mirrors computeEvaluation() in grading.ts.

interface MarkedQuestion {
  questionId: number;
  marks: number;
}

interface ScoredSubmission {
  candidateName: string;
  questionId: number;
  score: number;
  createdAt: Date;
  sessionId?: number | null;
  status?: string;
}

interface SessionInfo {
  id?: number;
  candidateUserId?: number | null;
  gradingStatus?: string;
  candidateName: string;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface CandidateSummary {
  candidateUserId?: number | null;
  sessionId?: number | null;
  isProvisional?: boolean;
  name: string;
  status: 'in-progress' | 'completed';
  startedAt: string | null;
  submittedAt: string | null;
  totalQuestions: number;
  attemptedQuestions: number;
  marksObtained: number;
  totalMarks: number;
  overallScore: number; // percentage of total marks
  passed: boolean;
}

export function summarizeCandidates(
  questions: MarkedQuestion[],
  passingScore: number,
  submissions: ScoredSubmission[],
  sessions: SessionInfo[],
): CandidateSummary[] {
  const marksByQuestion = new Map(
    questions.map((q) => [q.questionId, q.marks]),
  );
  const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);

  const identity = (session: SessionInfo) =>
    session.candidateUserId
      ? `user:${session.candidateUserId}`
      : `legacy:${session.candidateName}`;
  const sessionsById = new Map(
    sessions.filter((s) => s.id).map((s) => [s.id!, s]),
  );
  const sessionByKey = new Map<string, SessionInfo>();
  for (const session of sessions) {
    const key = identity(session);
    const existing = sessionByKey.get(key);
    if (!existing || session.startedAt > existing.startedAt)
      sessionByKey.set(key, session);
  }
  const latest = new Map<string, Map<number, ScoredSubmission>>();
  for (const submission of submissions) {
    const matched = submission.sessionId
      ? sessionsById.get(submission.sessionId)
      : undefined;
    const key = matched
      ? identity(matched)
      : `legacy:${submission.candidateName}`;
    if (
      submission.sessionId &&
      sessionByKey.get(key)?.id !== submission.sessionId
    )
      continue;
    const byQ = latest.get(key) ?? new Map<number, ScoredSubmission>();
    const previous = byQ.get(submission.questionId);
    if (!previous || previous.createdAt < submission.createdAt)
      byQ.set(submission.questionId, submission);
    latest.set(key, byQ);
  }
  const keys = new Set([...latest.keys(), ...sessionByKey.keys()]);
  return Array.from(keys).map((key) => {
    const byQ = latest.get(key) ?? new Map<number, ScoredSubmission>();
    const session = sessionByKey.get(key);
    const name =
      session?.candidateName ?? byQ.values().next().value?.candidateName ?? '';
    let marksObtained = 0;
    let lastSubmittedAt: Date | null = null;
    for (const s of byQ.values()) {
      marksObtained +=
        ((marksByQuestion.get(s.questionId) ?? 0) * s.score) / 100;
      if (!lastSubmittedAt || s.createdAt > lastSubmittedAt)
        lastSubmittedAt = s.createdAt;
    }
    const overallScore =
      totalMarks > 0 ? (marksObtained / totalMarks) * 100 : 0;
    // Legacy submissions without a session count as completed
    const completed = session ? !!session.finishedAt : byQ.size > 0;

    return {
      name,
      candidateUserId: session?.candidateUserId ?? null,
      sessionId: session?.id ?? null,
      isProvisional:
        (!!session?.gradingStatus && session.gradingStatus !== 'completed') ||
        [...byQ.values()].some(
          (s) =>
            s.status === 'pending_review' || s.status === 'execution_failed',
        ),
      status: completed ? 'completed' : 'in-progress',
      startedAt: session?.startedAt.toISOString() ?? null,
      submittedAt:
        (session?.finishedAt ?? lastSubmittedAt)?.toISOString() ?? null,
      totalQuestions: questions.length,
      attemptedQuestions: byQ.size,
      marksObtained: Math.round(marksObtained * 100) / 100,
      totalMarks,
      overallScore,
      passed: completed && overallScore >= passingScore,
    };
  });
}

export function aggregate(candidates: CandidateSummary[]) {
  const completed = candidates.filter((c) => c.status === 'completed');
  const scored = completed.filter((c) => !c.isProvisional);
  return {
    candidatesStarted: candidates.length,
    candidatesCompleted: completed.length,
    inProgress: candidates.length - completed.length,
    averageScore: scored.length
      ? scored.reduce((a, c) => a + c.overallScore, 0) / scored.length
      : null,
    passRate: scored.length
      ? (scored.filter((c) => c.passed).length / scored.length) * 100
      : null,
    highestScore: scored.length
      ? Math.max(...scored.map((c) => c.overallScore))
      : null,
  };
}
