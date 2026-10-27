import { questionFeedback, reviewedTranscript } from '../services/interviews/question-feedback';
import {
  currentSubquestion,
  type CurrentSubquestion,
} from '../services/interviews/current-subquestion';

type ContextInput = {
  id: number;
  title: string;
  status: string;
  currentQuestionId: number | null;
  currentCode: string;
  currentSubquestion?: CurrentSubquestion | null;
  questions: {
    questionId: number;
    candidateAnswer: string;
    notes?: string;
    reviewedTranscript?: string;
    question: { title: string; statement: string; questionType?: string };
  }[];
  submissions: {
    id: number;
    questionId: number;
    code: string;
    results: string;
    score: number;
    submittedBy?: string;
  }[];
  notes: { id: number; content: string }[];
  events: { id: number; eventType: string; actorRole: string; payload: string }[];
};

export function scopeFollowUpContext(input: ContextInput, questionId: number | null) {
  const link = input.questions.find((item) => item.questionId === questionId);
  if (!link)
    throw Object.assign(new Error('Select a question assigned to this interview'), { status: 400 });
  const nonCoding = ['written', 'mcq', 'project'].includes(link.question.questionType ?? '');
  const submissions = nonCoding
    ? []
    : input.submissions.filter(
        (item) => item.questionId === questionId && item.submittedBy === 'candidate',
      );
  const transcript = reviewedTranscript(link.notes)?.text;
  if (!transcript && (nonCoding ? !questionFeedback(link.notes).trim() : !submissions.length))
    throw Object.assign(
      new Error(
        nonCoding
          ? 'Save interviewer feedback for this question before requesting follow-ups'
          : 'The candidate must submit code for this question before requesting follow-ups',
      ),
      { status: 409 },
    );
  return {
    ...input,
    currentQuestionId: questionId,
    currentSubquestion: currentSubquestion(link.notes),
    currentCode: '',
    questions: [{ ...link, candidateAnswer: '', reviewedTranscript: transcript }],
    submissions,
    notes: [],
    events: input.events.filter((event) => {
      try {
        const payload = JSON.parse(event.payload);
        return (
          (payload.questionId ?? payload.activeQuestionId) === questionId &&
          (nonCoding
            ? event.eventType === 'QUESTION_FEEDBACK_UPDATED'
            : event.eventType === 'CODE_SUBMITTED' && event.actorRole === 'candidate')
        );
      } catch {
        return false;
      }
    }),
  };
}

/** Keep quoted evidence once; never serialize resumes, room tokens or every code snapshot. */
export function compactInterviewContext(input: ContextInput, maxChars = 12000) {
  const result = {
    interview: {
      id: input.id,
      title: input.title.slice(0, 150),
      status: input.status,
      currentQuestionId: input.currentQuestionId,
      currentSubquestion: input.currentSubquestion
        ? {
            ...input.currentSubquestion,
            question: input.currentSubquestion.question.slice(0, 2000),
          }
        : null,
      questions: [] as { questionId: number; title: string; statement: string }[],
      submissions: [] as { id: number; questionId: number; score: number }[],
      notes: [] as { id: number }[],
      events: [] as { id: number; eventType: string; actorRole: string }[],
    },
    sources: {} as Record<string, string>,
    judgeMode: process.env.JUDGE_MODE || 'live',
    coverage: { excerpted: true, totalQuestions: input.questions.length, maxChars },
  };
  function source(key: string, text: string, fraction: number) {
    if (!text) return;
    let excerpt = text.slice(0, Math.max(40, Math.floor(maxChars * fraction)));
    while (excerpt.length) {
      result.sources[key] = excerpt;
      if (JSON.stringify(result).length <= maxChars) return;
      excerpt = excerpt.slice(0, Math.floor(excerpt.length / 2));
    }
    delete result.sources[key];
  }
  function append<T>(items: T[], item: T) {
    items.push(item);
    if (JSON.stringify(result).length > maxChars) {
      items.pop();
      return false;
    }
    return true;
  }
  const ordered = [...input.questions].sort(
    (a, b) =>
      Number(b.questionId === input.currentQuestionId) -
      Number(a.questionId === input.currentQuestionId),
  );
  for (const event of input.events
    .filter((e) => !['CODE_CHANGED', 'CURSOR_CHANGED'].includes(e.eventType))
    .slice(0, maxChars <= 5000 ? 6 : 12)) {
    if (
      append(result.interview.events, {
        id: event.id,
        eventType: event.eventType.slice(0, 80),
        actorRole: event.actorRole.slice(0, 30),
      })
    )
      source(`event:${event.id}`, event.payload, 0.01);
  }
  for (const [index, link] of ordered.slice(0, 4).entries()) {
    append(result.interview.questions, {
      questionId: link.questionId,
      title: link.question.title.slice(0, 100),
      statement: link.question.statement.slice(
        0,
        Math.floor(maxChars * (index === 0 ? 0.04 : 0.015)),
      ),
    });
    source(`question:${link.questionId}:answer`, link.candidateAnswer, index === 0 ? 0.1 : 0.025);
    source(
      `question:${link.questionId}:feedback`,
      questionFeedback(link.notes),
      index === 0 ? 0.18 : 0.04,
    );
    if (link.reviewedTranscript)
      source(
        `question:${link.questionId}:reviewed-transcript`,
        link.reviewedTranscript,
        index === 0 ? 0.35 : 0.04,
      );
  }
  source('current:code', input.currentCode, 0.22);
  for (const note of input.notes.slice(0, 4)) {
    if (append(result.interview.notes, { id: note.id }))
      source(`note:${note.id}`, note.content, 0.02);
  }
  const seen = new Set<number>();
  for (const submission of input.submissions) {
    if (seen.has(submission.questionId)) continue;
    seen.add(submission.questionId);
    if (result.interview.submissions.length >= 3) break;
    if (
      !append(result.interview.submissions, {
        id: submission.id,
        questionId: submission.questionId,
        score: submission.score,
      })
    )
      continue;
    source(
      `submission:${submission.id}:code`,
      submission.code,
      input.questions.length === 1 ? 0.4 : 0.05,
    );
    source(
      `submission:${submission.id}:execution`,
      submission.results,
      input.questions.length === 1 ? 0.1 : 0.02,
    );
  }
  return result;
}

export function isContextLimitError(error: unknown) {
  const value = error as { status?: number; message?: string };
  return (
    [400, 413].includes(value?.status ?? 0) &&
    /reduce.*length|context.*length|maximum.*context|request too large|too many tokens|messages or completion/i.test(
      value.message ?? '',
    )
  );
}
