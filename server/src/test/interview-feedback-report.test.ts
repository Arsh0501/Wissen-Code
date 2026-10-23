import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFParse } from 'pdf-parse';
import prisma from '../prisma';
import { askedFollowUps, buildInterviewFeedbackReport, generateInterviewFeedbackReport, responseExcerpt } from '../services/interview-feedback-report';
import { REQUIRED_FEEDBACK_CRITERIA } from '../services/interview-feedback';

test('response excerpts remain grounded and only asked follow-ups are included', () => {
  assert.equal(responseExcerpt('  Candidate\n explained locking.  '), 'Candidate explained locking.');
  assert.ok(responseExcerpt('example '.repeat(1000), 100).length <= 101);
  const followUps = askedFollowUps([{ id: 'job', output: {
    _question: { id: 7 },
    followUps: [{ question: 'Asked question?' }, { question: 'Dismissed question?' }, { question: 'Pending question?' }],
    _reviews: { 'job-0': { decision: 'ask', reviewedAt: '2026-10-23T10:00:00Z' }, 'job-1': { decision: 'dismiss' } },
  } }]);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].questionId, 7);
  assert.equal(followUps[0].question, 'Asked question?');
});

test('generates a readable stored PDF from responses, removed coding questions, feedback and asked follow-ups', async () => {
  const marker = `pdf-${Date.now()}`;
  const user = await prisma.user.create({ data: { name: 'Report interviewer', email: `${marker}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const interview = await prisma.interview.create({ data: {
    title: 'Backend interview', candidateName: 'Report candidate', candidateEmail: 'candidate@test.invalid',
    interviewerId: user.id, roomToken: marker, status: 'completed', startedAt: new Date(), endedAt: new Date(),
    finalFeedback: 'Demonstrated sound fundamentals.', finalRating: 4, finalRecommendation: 'Hire', feedbackRevision: 1,
    feedbackCriteria: Object.entries(REQUIRED_FEEDBACK_CRITERIA).map(([key, label]) => ({ key, label, rating: 4, feedback: '' })),
  } });
  const questionIds: number[] = [];
  try {
    const discussion = await prisma.question.create({ data: { title: 'Booking concurrency', statement: 'How do you avoid double booking?', difficulty: 'medium', questionType: 'written', ownerInterviewId: interview.id } });
    const coding = await prisma.question.create({ data: { title: 'Two sum', statement: 'Return indices that add to the target.', difficulty: 'easy', ownerInterviewId: interview.id } });
    const unasked = await prisma.question.create({ data: { title: 'Unused question', statement: 'No discussion occurred.', difficulty: 'easy', ownerInterviewId: interview.id } });
    questionIds.push(discussion.id, coding.id, unasked.id);
    await prisma.interviewQuestion.createMany({ data: [
      { interviewId: interview.id, questionId: discussion.id, orderIndex: 0, candidateAnswer: 'I would use a unique constraint and a transaction.', referenceAnswer: 'REFERENCE_ANSWER_SECRET', notes: JSON.stringify({ interviewerFeedback: 'Explained transaction boundaries.' }) },
      { interviewId: interview.id, questionId: unasked.id, orderIndex: 1 },
    ] });
    // Coding question was removed from the assigned list; its submission still belongs in the report.
    await prisma.interviewSubmission.createMany({ data: [
      { interviewId: interview.id, questionId: coding.id, submittedBy: 'candidate', languageId: 63, languageName: 'JavaScript', code: `function solve(nums) { return [0, 1]; }\n${'// Candidate explanation of the solution\n'.repeat(80)}// END_OF_SOLUTION`, score: 50, results: JSON.stringify([{ passed: true }, { passed: false }]) },
      { interviewId: interview.id, questionId: coding.id, submittedBy: 'interviewer', languageId: 63, languageName: 'JavaScript', code: 'INTERVIEWER_CODE_NOT_CANDIDATE', score: 100 },
    ] });
    await prisma.aIJob.create({ data: { id: marker, authorId: user.id, interviewId: interview.id, kind: 'interview-assistant', status: 'completed', input: {}, output: {
      _question: { id: discussion.id }, followUps: [{ question: 'What happens when the transaction fails?' }, { question: 'UNASKED_FOLLOWUP_SECRET' }],
      _reviews: { [`${marker}-0`]: { decision: 'ask', reviewedAt: new Date().toISOString() } },
    } } });
    await prisma.interviewFeedbackReport.create({ data: { interviewId: interview.id, feedbackRevision: 1 } });
    const statement = 'How do you ensure safe updates?';
    let hash = 5381;
    for (const character of `Java:${statement}`) hash = (Math.imul(hash, 33) ^ character.charCodeAt(0)) | 0;
    const planQuestionId = -(Math.abs(hash) || 1);
    await prisma.interviewPlan.create({ data: {
      interviewId: interview.id, jobRequirements: 'Build services', candidateExperience: '3 years', requiredSkills: ['Java'], durationMinutes: 60,
      sections: [{ skill: 'Java', minutes: 60, objective: 'Assess safe updates', questions: [statement], followUps: [] }],
    } });
    await prisma.interviewEvaluation.create({ data: {
      interviewId: interview.id, questionId: planQuestionId, authorId: user.id, candidateAnswer: 'Use atomic counters for concurrent updates.',
      executionResults: {}, observations: [], status: 'final', skills: [{ skill: 'Java', rating: 4, rationale: 'Correctly explained atomic operations.' }],
    } });
    const content = await buildInterviewFeedbackReport(interview.id, 1);
    assert.equal(content.questions.length, 4);
    assert.match(content.questions.find(q => q.id === coding.id)!.answerSummary, /1 of 2 test cases passed/);
    assert.equal(content.questions.find(q => q.id === unasked.id)!.participation, 'Assigned; no interaction was recorded');
    assert.equal(content.questions.find(q => q.id === discussion.id)!.followUps.length, 1);
    assert.ok(!JSON.stringify(content).includes('REFERENCE_ANSWER_SECRET'));
    assert.ok(!JSON.stringify(content).includes('INTERVIEWER_CODE_NOT_CANDIDATE'));

    const failed = await generateInterviewFeedbackReport(interview.id, 1, async () => { throw new Error('Fixture renderer outage'); });
    assert.equal(failed?.status, 'failed');
    assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } })).finalFeedback, 'Demonstrated sound fundamentals.');
    const ready = await generateInterviewFeedbackReport(interview.id, 1);
    assert.equal(ready?.status, 'ready');
    const stored = await prisma.interviewFeedbackReport.findUniqueOrThrow({ where: { interviewId: interview.id } });
    assert.ok(stored.pdf && stored.pdf.byteLength > 1000);
    const parser = new PDFParse({ data: new Uint8Array(stored.pdf!) });
    try {
      const { text } = await parser.getText();
      assert.match(text, /Report candidate/);
      assert.match(text, /Role alignment/);
      assert.match(text, /unique constraint and a transaction/);
      assert.match(text, /What happens when the transaction fails/);
      assert.match(text, /Two sum/);
      assert.match(text, /END_OF_SOLUTION/);
      assert.match(text, /Java discussion/);
      assert.match(text, /Correctly explained atomic operations/);
      assert.ok(!text.includes('UNASKED_FOLLOWUP_SECRET'));
    } finally { await parser.destroy(); }
  } finally {
    await prisma.aIJob.deleteMany({ where: { interviewId: interview.id } });
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
