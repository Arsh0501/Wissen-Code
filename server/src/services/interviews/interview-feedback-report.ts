import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { questionFeedback, questionNoteData, reviewedTranscript } from './question-feedback';
import { feedbackCriteriaSchema } from './interview-feedback';
import { WorkflowError } from '../ai/structured-ai';
import { questionWasAsked } from './question-asked';

interface AskedFollowUp {
  id: string;
  questionId: number | null;
  question: string;
  askedAt: string;
}

interface ReportQuestion {
  id: number;
  title: string;
  statement: string;
  participation: string;
  answerSummary: string;
  recordedAnswer: string;
  answerSource: string;
  interviewerFeedback: string;
  skillEvaluations: { skill: string; rating: number | null; rationale: string; status: string }[];
  submission: null | {
    language: string;
    code: string;
    score: number;
    passed: number;
    total: number;
  };
  followUps: AskedFollowUp[];
  conversation: {
    id: string;
    question: string;
    answer: string;
    answerSource: string;
    askedAt: string;
  }[];
}

export interface InterviewFeedbackReportContent {
  formatVersion: 3;
  interview: {
    id: number;
    title: string;
    candidateName: string;
    candidateEmail: string;
    interviewerName: string;
    interviewerEmail: string;
    scheduledAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    durationMinutes: number;
  };
  feedbackRevision: number;
  generatedAt: string;
  criteria: { key: string; label: string; rating: number; feedback: string }[];
  finalRating: number | null;
  finalRecommendation: string;
  finalFeedback: string;
  questions: ReportQuestion[];
  otherFollowUps: AskedFollowUp[];
  notes: string[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function json(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/** Extractive summaries quote saved responses; they never invent verbal answers. */
export function responseExcerpt(answer: string, limit = 1000) {
  const text = answer.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit);
  const lastWord = excerpt.lastIndexOf(' ');
  return `${excerpt.slice(0, lastWord > limit / 2 ? lastWord : limit)}…`;
}

export function askedFollowUps(jobs: { id: string; output: unknown }[]): AskedFollowUp[] {
  const followUps: AskedFollowUp[] = [];
  for (const job of jobs) {
    const output = object(job.output);
    const reviews = object(output._reviews);
    const questionId = object(output._question).id;
    if (!Array.isArray(output.followUps)) continue;
    output.followUps.forEach((value, index) => {
      const id = `${job.id}-${index}`;
      const review = object(reviews[id]);
      const question = object(value).question;
      if (review.decision !== 'ask' || typeof question !== 'string') return;
      followUps.push({
        id,
        questionId: typeof questionId === 'number' ? questionId : null,
        question,
        askedAt: typeof review.reviewedAt === 'string' ? review.reviewedAt : '',
      });
    });
  }
  return followUps.sort((a, b) => a.askedAt.localeCompare(b.askedAt));
}

export async function buildInterviewFeedbackReport(
  interviewId: number,
  revision: number,
): Promise<InterviewFeedbackReportContent> {
  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: {
      interviewer: { select: { name: true, email: true } },
      questions: { include: { question: true }, orderBy: { orderIndex: 'asc' } },
      submissions: {
        where: { submittedBy: 'candidate' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
      events: {
        where: {
          eventType: {
            in: [
              'QUESTION_CHANGED',
              'INTERVIEW_STARTED',
              'ANSWER_UPDATED',
              'QUESTION_FEEDBACK_UPDATED',
              'AI_REVIEWED',
            ],
          },
        },
        orderBy: { id: 'asc' },
      },
      notes: { orderBy: { createdAt: 'asc' } },
      evaluations: true,
      followUps: { where: { status: 'asked' }, orderBy: { askedAt: 'asc' } },
      transcriptSegments: { orderBy: [{ startedAt: 'asc' }, { id: 'asc' }] },
    },
  });
  if (
    interview.status !== 'completed' ||
    !interview.finalFeedback ||
    interview.feedbackRevision !== revision
  ) {
    throw new WorkflowError('Submit current final feedback before generating the report.', 409);
  }
  const criteria = feedbackCriteriaSchema.parse(interview.feedbackCriteria);
  const jobs = await prisma.aIJob.findMany({
    where: {
      interviewId,
      authorId: interview.interviewerId,
      kind: 'interview-assistant',
      status: 'completed',
    },
    select: { id: true, output: true },
    orderBy: { createdAt: 'asc' },
  });
  const followUps = askedFollowUps(jobs);
  followUps.push(
    ...interview.followUps.map((followUp) => ({
      id: `manual:${followUp.id}`,
      questionId: followUp.questionId,
      question: followUp.question,
      askedAt: followUp.askedAt?.toISOString() ?? '',
    })),
  );
  const interacted = new Set<number>();
  for (const event of interview.events) {
    const payload = object(json(event.payload));
    if (typeof payload.questionId === 'number') interacted.add(payload.questionId);
  }
  // AI review events preserve follow-up text even if an older job lacks _question.
  for (const event of interview.events.filter((event) => event.eventType === 'AI_REVIEWED')) {
    const payload = object(json(event.payload));
    if (
      payload.decision === 'ask' &&
      typeof payload.question === 'string' &&
      typeof payload.itemId === 'string' &&
      !followUps.some((followUp) => followUp.id === payload.itemId)
    ) {
      followUps.push({
        id: payload.itemId,
        questionId: typeof payload.questionId === 'number' ? payload.questionId : null,
        question: payload.question,
        askedAt: event.createdAt.toISOString(),
      });
    }
  }
  interview.submissions.forEach((submission) => interacted.add(submission.questionId));
  const evaluations = interview.evaluations.filter(
    (evaluation) => evaluation.authorId === interview.interviewerId,
  );
  evaluations.forEach((evaluation) => interacted.add(evaluation.questionId));
  followUps.forEach((followUp) => {
    if (followUp.questionId) interacted.add(followUp.questionId);
  });
  const assignedIds = new Set(interview.questions.map((link) => link.questionId));
  const previousQuestions = await prisma.question.findMany({
    where: { id: { in: [...interacted].filter((id) => id > 0 && !assignedIds.has(id)) } },
  });
  const questionList: { id: number; title: string; statement: string }[] = [
    ...interview.questions.map((link) => link.question),
    ...previousQuestions,
  ];
  const questions: ReportQuestion[] = questionList
    .filter((question) => {
      const link = interview.questions.find((item) => item.questionId === question.id);
      // Older interviews may predate the Asked state; retain questions with actual recorded responses or asked follow-ups.
      return (
        questionWasAsked(link?.notes, link?.status) ||
        !!link?.candidateAnswer.trim() ||
        !!reviewedTranscript(link?.notes) ||
        interview.submissions.some((item) => item.questionId === question.id) ||
        evaluations.some(
          (item) =>
            item.questionId === question.id &&
            (item.candidateAnswer.trim() || item.candidateCode.trim()),
        ) ||
        followUps.some((item) => item.questionId === question.id)
      );
    })
    .map((question) => {
      const link = interview.questions.find((item) => item.questionId === question.id);
      const submission = interview.submissions.find((item) => item.questionId === question.id);
      const evaluation = evaluations.find((item) => item.questionId === question.id);
      const segments = interview.transcriptSegments.filter(
        (segment) => segment.questionId === question.id,
      );
      const savedTurns = object(questionNoteData(link?.notes ?? '').conversation).turns;
      const turns = (Array.isArray(savedTurns) ? savedTurns.map(object) : []).filter(
        (turn) =>
          typeof turn.id === 'string' &&
          typeof turn.question === 'string' &&
          typeof turn.startedAt === 'string',
      );
      const conversation = turns.map((turn, index) => {
        const reviewed = typeof turn.transcript === 'string' ? turn.transcript.trim() : '';
        const start = Date.parse(String(turn.startedAt));
        const end =
          index + 1 < turns.length ? Date.parse(String(turns[index + 1].startedAt)) : Infinity;
        const automatic = segments
          .filter(
            (segment) => segment.startedAt.getTime() >= start && segment.startedAt.getTime() < end,
          )
          .map((segment) => segment.text)
          .join('\n');
        return {
          id: String(turn.id),
          question: String(turn.question),
          answer: reviewed || automatic,
          answerSource: reviewed
            ? 'Interviewer-reviewed transcript'
            : automatic
              ? 'Automatic transcript (not reviewed; may contain recognition errors)'
              : 'No response was recorded',
          askedAt: String(turn.startedAt),
        };
      });
      const directAnswer = link?.candidateAnswer.trim() || '';
      const reviewed = reviewedTranscript(link?.notes)?.text ?? '';
      const automatic = segments.map((segment) => segment.text).join('\n');
      const recordedAnswer = conversation.length
        ? conversation[0].answer
        : directAnswer || evaluation?.candidateAnswer.trim() || reviewed || automatic;
      const answerSource = conversation.length
        ? conversation[0].answerSource
        : directAnswer
          ? 'Saved candidate answer'
          : evaluation?.candidateAnswer.trim()
            ? 'Answer recorded in interviewer evaluation'
            : reviewed
              ? 'Interviewer-reviewed transcript'
              : 'Automatic transcript (not reviewed; may contain recognition errors)';
      const feedback = questionFeedback(link?.notes);
      const result = submission ? json(submission.results) : [];
      const results = Array.isArray(result) ? result.map(object) : [];
      const passed = results.filter((item) => item.passed === true).length;
      const codingSummary = submission
        ? `Candidate submitted ${submission.languageName} code (${submission.code.split('\n').length} lines). Recorded score: ${submission.score}%.${results.length ? ` ${passed} of ${results.length} test cases passed.` : ' No per-test results were recorded.'}`
        : '';
      return {
        id: question.id,
        title: question.title,
        statement: question.statement,
        participation:
          conversation.length || recordedAnswer || feedback || interacted.has(question.id)
            ? 'Interaction recorded'
            : 'Assigned; no interaction was recorded',
        answerSummary:
          [
            recordedAnswer ? `Recorded response excerpt: ${responseExcerpt(recordedAnswer)}` : '',
            codingSummary,
          ]
            .filter(Boolean)
            .join('\n') || 'No candidate response or submitted code was recorded.',
        recordedAnswer,
        answerSource,
        interviewerFeedback: feedback,
        skillEvaluations: (Array.isArray(evaluation?.skills) ? evaluation.skills : [])
          .map(object)
          .filter((skill) => typeof skill.skill === 'string')
          .map((skill) => ({
            skill: String(skill.skill),
            rating: typeof skill.rating === 'number' ? skill.rating : null,
            rationale: typeof skill.rationale === 'string' ? skill.rationale : '',
            status: evaluation!.status,
          })),
        submission: submission
          ? {
              language: submission.languageName,
              code: submission.code,
              score: submission.score,
              passed,
              total: results.length,
            }
          : null,
        followUps: followUps.filter((followUp) => followUp.questionId === question.id),
        conversation,
      };
    });
  return {
    formatVersion: 3,
    interview: {
      id: interview.id,
      title: interview.title,
      candidateName: interview.candidateName,
      candidateEmail: interview.candidateEmail,
      interviewerName: interview.interviewer.name,
      interviewerEmail: interview.interviewer.email,
      scheduledAt: interview.scheduledAt?.toISOString() ?? null,
      startedAt: interview.startedAt?.toISOString() ?? null,
      endedAt: interview.endedAt?.toISOString() ?? null,
      durationMinutes: interview.timeLimitMinutes,
    },
    feedbackRevision: revision,
    generatedAt: new Date().toISOString(),
    criteria,
    finalRating: interview.finalRating,
    finalRecommendation: interview.finalRecommendation ?? '',
    finalFeedback: interview.finalFeedback,
    questions,
    otherFollowUps: followUps.filter(
      (followUp) => !questions.some((question) => question.id === followUp.questionId),
    ),
    notes: interview.notes
      .filter((note) => note.authorId === interview.interviewerId)
      .map((note) => note.content),
  };
}

function reportFont() {
  return (
    [
      process.env.INTERVIEW_REPORT_FONT,
      'C:/Windows/Fonts/arial.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ].find((path): path is string => !!path && existsSync(path)) ?? 'Helvetica'
  );
}

export function renderInterviewFeedbackPdf(
  report: InterviewFeedbackReportContent,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: {
        Title: `${report.interview.title} - Interview feedback`,
        Author: 'Wissen Code',
        Subject: 'Confidential interview feedback report',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    const font = reportFont();
    const text = (value: string, size = 10, color = '#253047') => {
      document
        .font(font)
        .fontSize(size)
        .fillColor(color)
        .text(value.replace(/\u0000/g, ''), { lineGap: 3 });
      document.moveDown(0.5);
    };
    const heading = (value: string) => {
      if (document.y > document.page.height - 100) document.addPage();
      document.moveDown(0.5);
      text(value, 14, '#1754a3');
    };
    try {
      text('WISSEN CODE', 11, '#1754a3');
      text('Interview feedback report', 23, '#111827');
      text(report.interview.title, 15);
      text('Confidential - interviewer and administrator access only', 9, '#64748b');
      heading('Interview details');
      const date = (value: string | null) =>
        value && !Number.isNaN(Date.parse(value))
          ? new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
          : 'Not recorded';
      text(
        `Candidate: ${report.interview.candidateName} (${report.interview.candidateEmail})\nInterviewer: ${report.interview.interviewerName} (${report.interview.interviewerEmail})\nScheduled: ${date(report.interview.scheduledAt)}\nStarted: ${date(report.interview.startedAt)}\nEnded: ${date(report.interview.endedAt)}\nDuration: ${report.interview.durationMinutes} minutes\nFeedback revision: ${report.feedbackRevision}\nReport generated: ${date(report.generatedAt)}`,
      );
      heading('Final interview feedback');
      text(
        `Overall rating: ${report.finalRating ?? 'Not provided'}/5\nRecommendation: ${report.finalRecommendation || 'Not provided'}`,
      );
      text(report.finalFeedback);
      heading('Feedback criteria');
      report.criteria.forEach((criterion) => {
        text(`${criterion.label}: ${criterion.rating}/5`, 11);
        text(criterion.feedback || 'No supporting comment provided.', 10, '#475569');
      });
      heading('Questions and candidate responses');
      text(
        'Only asked questions and follow-ups are included, in conversation order. Saved reviewed transcripts are preferred; automatic transcripts are labelled as unreviewed and may contain recognition errors. Questions that were only lined up are excluded. Missing answers are never invented.',
        9,
        '#64748b',
      );
      if (!report.questions.length) text('No questions were recorded as asked.');
      report.questions.forEach((question, index) => {
        heading(`${index + 1}. ${question.title}`);
        text(question.participation, 9, '#64748b');
        text(question.statement);
        text('Candidate response summary', 11);
        text(question.answerSummary);
        if (question.conversation.length) {
          text('Question conversation - questions and answers in order', 11);
          question.conversation.forEach((turn, turnIndex) => {
            text(
              `${turnIndex === 0 ? 'Main question' : `Follow-up ${turnIndex}`}: ${turn.question}`,
              11,
            );
            text(`Asked: ${date(turn.askedAt)}`, 9, '#64748b');
            text(turn.answerSource, 9, '#64748b');
            text(turn.answer || 'No response was recorded.');
          });
        } else if (question.recordedAnswer) {
          text(question.answerSource, 11);
          text(question.recordedAnswer);
        }
        if (question.interviewerFeedback) {
          text('Feedback for this question and its follow-up conversation', 11);
          text(question.interviewerFeedback);
        }
        if (question.skillEvaluations.length) {
          text('Per-question skill evaluations', 11);
          question.skillEvaluations.forEach((skill) =>
            text(
              `${skill.skill}: ${skill.rating ?? 'Unrated'}/5 (${skill.status})${skill.rationale ? `\n${skill.rationale}` : ''}`,
            ),
          );
        }
        if (question.submission) {
          text(`Latest candidate submission - ${question.submission.language}`, 11);
          text(question.submission.code, 8);
        }
        const otherAsked = question.followUps.filter(
          (followUp) =>
            !question.conversation.some(
              (turn) => followUp.id === turn.id || followUp.id === `manual:${turn.id}`,
            ),
        );
        if (otherAsked.length || !question.conversation.length) {
          text('Other follow-ups marked as asked', 11);
          if (!otherAsked.length) text('No follow-ups were marked as asked for this question.');
          otherAsked.forEach((followUp) =>
            text(
              `• ${followUp.question}${followUp.askedAt ? `\nAsked: ${date(followUp.askedAt)}` : ''}\nNo separately linked answer was recorded for this follow-up.`,
            ),
          );
        }
      });
      if (report.otherFollowUps.length) {
        heading('Other recorded follow-ups');
        report.otherFollowUps.forEach((followUp) => text(followUp.question));
      }
      if (report.notes.length) {
        heading('Saved interviewer notes');
        report.notes.forEach((note) => text(note));
      }
      const pages = document.bufferedPageRange();
      for (let page = pages.start; page < pages.start + pages.count; page++) {
        document.switchToPage(page);
        const bottom = document.page.margins.bottom;
        document.page.margins.bottom = 0;
        document
          .font(font)
          .fontSize(8)
          .fillColor('#64748b')
          .text(
            `Wissen Code | Interview ${report.interview.id} | Page ${page + 1} of ${pages.count}`,
            48,
            document.page.height - 30,
            { lineBreak: false },
          );
        document.page.margins.bottom = bottom;
      }
      document.end();
    } catch (error) {
      document.destroy();
      reject(error);
    }
  });
}

export async function generateInterviewFeedbackReport(
  interviewId: number,
  revision: number,
  renderPdf = renderInterviewFeedbackPdf,
) {
  try {
    const content = await buildInterviewFeedbackReport(interviewId, revision);
    const pdf = await renderPdf(content);
    await prisma.interviewFeedbackReport.updateMany({
      where: { interviewId, feedbackRevision: revision, interview: { feedbackRevision: revision } },
      data: {
        status: 'ready',
        content: content as unknown as Prisma.InputJsonValue,
        pdf: new Uint8Array(pdf),
        error: null,
        generatedAt: new Date(content.generatedAt),
      },
    });
  } catch (error) {
    console.error(
      'Interview feedback PDF generation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    await prisma.interviewFeedbackReport.updateMany({
      where: { interviewId, feedbackRevision: revision, interview: { feedbackRevision: revision } },
      data: {
        status: 'failed',
        error: 'The PDF could not be generated. Your feedback was saved. Retry report generation.',
      },
    });
  }
  return feedbackReportMetadata(interviewId);
}

export async function feedbackReportMetadata(interviewId: number) {
  const report = await prisma.interviewFeedbackReport.findUnique({
    where: { interviewId },
    select: { status: true, feedbackRevision: true, generatedAt: true, error: true, content: true },
  });
  if (!report) return null;
  const { content, ...metadata } = report;
  const outdated = report.status === 'ready' && object(content).formatVersion !== 3;
  return {
    ...metadata,
    status: outdated ? 'outdated' : report.status,
    error: outdated
      ? 'Regenerate this report to include only asked questions and their conversation answers.'
      : report.error,
    downloadUrl:
      report.status === 'ready' && !outdated
        ? `/interviews/${interviewId}/feedback/report/download`
        : null,
  };
}
