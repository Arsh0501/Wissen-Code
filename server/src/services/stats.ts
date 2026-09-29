import { parseQuestionIds } from './question-set';

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
}

interface SessionInfo {
  candidateName: string;
  startedAt: Date;
  finishedAt: Date | null;
  questionIds?: string; // candidate's random subset, when the assessment uses one
}

export interface CandidateSummary {
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
  sessions: SessionInfo[]
): CandidateSummary[] {
  const marksByQuestion = new Map(questions.map((q) => [q.questionId, q.marks]));

  // Latest submission per candidate per question
  const latest = new Map<string, Map<number, ScoredSubmission>>();
  for (const s of submissions) {
    const byQ = latest.get(s.candidateName) ?? new Map<number, ScoredSubmission>();
    const prev = byQ.get(s.questionId);
    if (!prev || prev.createdAt < s.createdAt) byQ.set(s.questionId, s);
    latest.set(s.candidateName, byQ);
  }

  const sessionByName = new Map(sessions.map((s) => [s.candidateName, s]));
  const names = new Set([...latest.keys(), ...sessionByName.keys()]);

  return Array.from(names).map((name) => {
    const session = sessionByName.get(name);
    // Candidates on a random subset are scored only against the questions they received
    const subset = parseQuestionIds(session?.questionIds);
    const pool = subset ? questions.filter((q) => subset.includes(q.questionId)) : questions;
    const poolIds = new Set(pool.map((q) => q.questionId));
    const totalMarks = pool.reduce((acc, q) => acc + q.marks, 0);
    const byQ = new Map([...(latest.get(name) ?? new Map<number, ScoredSubmission>())].filter(([qid]) => poolIds.has(qid)));
    let marksObtained = 0;
    let lastSubmittedAt: Date | null = null;
    for (const s of byQ.values()) {
      marksObtained += ((marksByQuestion.get(s.questionId) ?? 0) * s.score) / 100;
      if (!lastSubmittedAt || s.createdAt > lastSubmittedAt) lastSubmittedAt = s.createdAt;
    }
    const overallScore = totalMarks > 0 ? (marksObtained / totalMarks) * 100 : 0;
    // Legacy submissions without a session count as completed
    const completed = session ? !!session.finishedAt : byQ.size > 0;

    return {
      name,
      status: completed ? 'completed' : 'in-progress',
      startedAt: session?.startedAt.toISOString() ?? null,
      submittedAt: (session?.finishedAt ?? lastSubmittedAt)?.toISOString() ?? null,
      totalQuestions: pool.length,
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
  return {
    candidatesStarted: candidates.length,
    candidatesCompleted: completed.length,
    inProgress: candidates.length - completed.length,
    averageScore: completed.length ? completed.reduce((a, c) => a + c.overallScore, 0) / completed.length : null,
    passRate: completed.length ? (completed.filter((c) => c.passed).length / completed.length) * 100 : null,
    highestScore: completed.length ? Math.max(...completed.map((c) => c.overallScore)) : null,
  };
}
