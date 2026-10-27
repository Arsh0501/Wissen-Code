import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import prisma from '../database/prisma';
import {
  askedFollowUps,
  buildInterviewFeedbackReport,
  generateInterviewFeedbackReport,
  responseExcerpt,
  feedbackReportMetadata,
} from '../services/interviews/interview-feedback-report';
import { REQUIRED_FEEDBACK_CRITERIA } from '../services/interviews/interview-feedback';

test('response excerpts remain grounded and only asked follow-ups are included', () => {
  assert.equal(
    responseExcerpt('  Candidate\n explained locking.  '),
    'Candidate explained locking.',
  );
  assert.ok(responseExcerpt('example '.repeat(1000), 100).length <= 101);
  const followUps = askedFollowUps([
    {
      id: 'job',
      output: {
        _question: { id: 7 },
        followUps: [
          { question: 'Asked question?' },
          { question: 'Dismissed question?' },
          { question: 'Pending question?' },
        ],
        _reviews: {
          'job-0': { decision: 'ask', reviewedAt: '2026-10-23T10:00:00Z' },
          'job-1': { decision: 'dismiss' },
        },
      },
    },
  ]);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].questionId, 7);
  assert.equal(followUps[0].question, 'Asked question?');
});

test('generates a readable stored PDF from responses, removed coding questions, feedback and asked follow-ups', async () => {
  const marker = `pdf-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      name: 'Report interviewer',
      email: `${marker}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const interview = await prisma.interview.create({
    data: {
      title: 'Backend interview',
      candidateName: 'Report candidate',
      candidateEmail: 'candidate@test.invalid',
      interviewerId: user.id,
      roomToken: marker,
      status: 'completed',
      startedAt: new Date(),
      endedAt: new Date(),
      finalFeedback: 'Demonstrated sound fundamentals.',
      finalRating: 4,
      finalRecommendation: 'Hire',
      feedbackRevision: 1,
      feedbackCriteria: Object.entries(REQUIRED_FEEDBACK_CRITERIA).map(([key, label]) => ({
        key,
        label,
        rating: 4,
        feedback: '',
      })),
    },
  });
  const questionIds: number[] = [];
  try {
    const discussion = await prisma.question.create({
      data: {
        title: 'Booking concurrency',
        statement: 'How do you avoid double booking?',
        difficulty: 'medium',
        questionType: 'written',
        ownerInterviewId: interview.id,
      },
    });
    const coding = await prisma.question.create({
      data: {
        title: 'Two sum',
        statement: 'Return indices that add to the target.',
        difficulty: 'easy',
        ownerInterviewId: interview.id,
      },
    });
    const unasked = await prisma.question.create({
      data: {
        title: 'Unused question',
        statement: 'No discussion occurred.',
        difficulty: 'easy',
        ownerInterviewId: interview.id,
      },
    });
    questionIds.push(discussion.id, coding.id, unasked.id);
    await prisma.interviewQuestion.createMany({
      data: [
        {
          interviewId: interview.id,
          questionId: discussion.id,
          orderIndex: 0,
          candidateAnswer: 'I would use a unique constraint and a transaction.',
          referenceAnswer: 'REFERENCE_ANSWER_SECRET',
          notes: JSON.stringify({
            interviewerFeedback: 'Explained transaction boundaries.',
            conversation: {
              revision: 4,
              suggestions: [{ id: 'unused', question: 'UNSELECTED_CHAT_SUGGESTION' }],
              turns: [
                {
                  id: 'main',
                  question: 'How do you avoid double booking?',
                  transcript: 'I would use a unique constraint and a transaction.',
                  segmentIds: [],
                  startedAt: '2026-01-01T10:00:00.000Z',
                },
                {
                  id: 'chat-follow',
                  question: 'How do you recover after a failed booking transaction?',
                  transcript: 'Roll back the transaction and retry after checking availability.',
                  segmentIds: [],
                  startedAt: '2026-01-01T10:01:00.000Z',
                },
                {
                  id: 'chat-final',
                  question: 'What happens on a deadlock?',
                  transcript: '',
                  segmentIds: [],
                  startedAt: '2026-01-01T10:02:00.000Z',
                },
              ],
            },
          }),
        },
        { interviewId: interview.id, questionId: unasked.id, orderIndex: 1 },
      ],
    });
    // Merely selecting a lined-up question does not count as asking it.
    await prisma.interviewEvent.create({
      data: {
        interviewId: interview.id,
        eventType: 'QUESTION_CHANGED',
        actorRole: 'interviewer',
        payload: JSON.stringify({ questionId: unasked.id }),
      },
    });
    await prisma.interviewTranscriptSegment.create({
      data: {
        id: randomUUID(),
        interviewId: interview.id,
        questionId: discussion.id,
        sessionId: randomUUID(),
        sequence: 0,
        speaker: 'candidate',
        text: 'Retry the aborted operation with backoff.',
        startedAt: new Date('2026-01-01T10:02:01.000Z'),
        endedAt: new Date('2026-01-01T10:02:04.000Z'),
      },
    });
    // Coding question was removed from the assigned list; its submission still belongs in the report.
    await prisma.interviewSubmission.createMany({
      data: [
        {
          interviewId: interview.id,
          questionId: coding.id,
          submittedBy: 'candidate',
          languageId: 63,
          languageName: 'JavaScript',
          code: `function solve(nums) { return [0, 1]; }\n${'// Candidate explanation of the solution\n'.repeat(80)}// END_OF_SOLUTION`,
          score: 50,
          results: JSON.stringify([{ passed: true }, { passed: false }]),
        },
        {
          interviewId: interview.id,
          questionId: coding.id,
          submittedBy: 'interviewer',
          languageId: 63,
          languageName: 'JavaScript',
          code: 'INTERVIEWER_CODE_NOT_CANDIDATE',
          score: 100,
        },
      ],
    });
    await prisma.aIJob.create({
      data: {
        id: marker,
        authorId: user.id,
        interviewId: interview.id,
        kind: 'interview-assistant',
        status: 'completed',
        input: {},
        output: {
          _question: { id: discussion.id },
          followUps: [
            { question: 'What happens when the transaction fails?' },
            { question: 'UNASKED_FOLLOWUP_SECRET' },
          ],
          _reviews: { [`${marker}-0`]: { decision: 'ask', reviewedAt: new Date().toISOString() } },
        },
      },
    });
    await prisma.interviewFeedbackReport.create({
      data: { interviewId: interview.id, feedbackRevision: 1 },
    });
    const content = await buildInterviewFeedbackReport(interview.id, 1);
    assert.equal(content.questions.length, 2);
    assert.match(
      content.questions.find((q) => q.id === coding.id)!.answerSummary,
      /1 of 2 test cases passed/,
    );
    assert.equal(
      content.questions.some((q) => q.id === unasked.id),
      false,
    );
    assert.equal(content.questions.find((q) => q.id === discussion.id)!.followUps.length, 1);
    const chat = content.questions.find((q) => q.id === discussion.id)!.conversation;
    assert.equal(chat.length, 3);
    assert.equal(
      chat[1].answer,
      'Roll back the transaction and retry after checking availability.',
    );
    assert.equal(chat[2].answer, 'Retry the aborted operation with backoff.');
    assert.match(chat[2].answerSource, /not reviewed/);
    assert.ok(!JSON.stringify(content).includes('UNSELECTED_CHAT_SUGGESTION'));
    assert.ok(!JSON.stringify(content).includes('REFERENCE_ANSWER_SECRET'));
    assert.ok(!JSON.stringify(content).includes('INTERVIEWER_CODE_NOT_CANDIDATE'));

    const failed = await generateInterviewFeedbackReport(interview.id, 1, async () => {
      throw new Error('Fixture renderer outage');
    });
    assert.equal(failed?.status, 'failed');
    assert.equal(
      (await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } })).finalFeedback,
      'Demonstrated sound fundamentals.',
    );
    const ready = await generateInterviewFeedbackReport(interview.id, 1);
    assert.equal(ready?.status, 'ready');
    const stored = await prisma.interviewFeedbackReport.findUniqueOrThrow({
      where: { interviewId: interview.id },
    });
    assert.ok(stored.pdf && stored.pdf.byteLength > 1000);
    const parser = new PDFParse({ data: new Uint8Array(stored.pdf!) });
    try {
      const { text } = await parser.getText();
      assert.match(text, /Report candidate/);
      assert.match(text, /Role alignment/);
      assert.match(text, /unique constraint and a transaction/);
      assert.match(text, /What happens when the transaction fails/);
      assert.match(text, /How do you recover after a failed booking transaction/);
      assert.match(text, /Roll back the transaction and retry after checking availability/);
      assert.match(text, /Retry the aborted operation with backoff/);
      assert.match(text, /Explained transaction boundaries/);
      assert.match(text, /Demonstrated sound fundamentals/);
      assert.ok(!text.includes('Unused question'));
      assert.ok(!text.includes('No discussion occurred'));
      assert.match(text, /Two sum/);
      assert.match(text, /END_OF_SOLUTION/);
      assert.ok(!text.includes('Java discussion'));

      assert.ok(!text.includes('UNASKED_FOLLOWUP_SECRET'));
    } finally {
      await parser.destroy();
    }
    await prisma.interviewFeedbackReport.update({
      where: { interviewId: interview.id },
      data: { content: {} },
    });
    assert.equal((await feedbackReportMetadata(interview.id))?.status, 'outdated');
    assert.equal((await feedbackReportMetadata(interview.id))?.downloadUrl, null);
  } finally {
    await prisma.aIJob.deleteMany({ where: { interviewId: interview.id } });
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
