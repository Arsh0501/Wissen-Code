import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../prisma';
import { executeAgent } from '../ai/agents';
import { runAgent } from '../ai/gateway';
import { assistantSchema } from '../ai/schemas';

test('follow-up agent uses only selected evidence, rejects fabricated quotes, and retries smaller context', async () => {
  const marker = randomUUID();
  const owner = await prisma.user.create({ data: { name: 'Agent test', email: `${marker}@test.invalid`, role: 'interviewer', password: 'unused' } });
  const questions = await Promise.all(['coding', 'written'].map(questionType => prisma.question.create({ data: {
    title: questionType === 'coding' ? 'Find repeated values' : 'Cache consistency',
    statement: questionType === 'coding' ? 'Find repeated values in a list and explain the complexity.' : 'How do you keep cached data consistent?', difficulty: 'medium', questionType,
  } })));
  const [coding, written] = questions;
  const interview = await prisma.interview.create({ data: { title: marker, interviewerId: owner.id, candidateName: 'Fixture', candidateEmail: 'fixture@test.invalid', roomToken: marker,
    status: 'in_progress', startedAt: new Date(), currentQuestionId: coding.id, currentCode: 'UNSENT_CODE_SECRET',
    questions: { create: [{ questionId: coding.id }, { questionId: written.id, candidateAnswer: 'UNREVIEWED_ANSWER_SECRET', notes: JSON.stringify({ transcriptEvidence: { text: 'We use Redis with a sixty second TTL. Writes update the database but do not invalidate the cache.', segmentIds: ['fixture-segment'], reviewedAt: new Date().toISOString() } }) }] },
  } });
  await prisma.interviewSubmission.createMany({ data: [
    { interviewId: interview.id, questionId: coding.id, submittedBy: 'candidate', languageId: 71, languageName: 'Python', code: 'seen = set()\nfor value in values:\n    if value in seen:\n        print(value)\n    seen.add(value)', results: '[{"passed":true}]', score: 100 },
    { interviewId: interview.id, questionId: coding.id, submittedBy: 'interviewer', languageId: 71, languageName: 'Python', code: 'INTERVIEWER_CODE_SECRET', results: '[]', score: 0 },
  ] });
  try {
    const contexts: any[] = [];
    let fabricate = false, overflow = false;
    const runner = (async (_name: string, schema: any, _instructions: string, context: any) => {
      contexts.push(context);
      if (overflow && contexts.length === 1) throw Object.assign(new Error('maximum context length exceeded'), { status: 400 });
      const key = Object.keys(context.sources).find(key => /reviewed-transcript|:code$/.test(key))!;
      assert.ok(key, 'Candidate evidence must reach the agent');
      return schema.parse({ followUps: [{ question: 'What tradeoffs does this approach have?', context: 'Probe the supplied answer.', evidence: [{ sourceId: key, quote: fabricate ? 'FABRICATED_QUOTE' : context.sources[key].slice(0, 30) }] }], observations: [], areasToProbe: [] });
    }) as typeof runAgent;
    const generate = (questionId: number, authorId = owner.id) => executeAgent('interview-assistant', { questionId }, authorId, interview.id, { run: runner });
    const codeOutput: any = await generate(coding.id);
    assert.equal(codeOutput._question.id, coding.id);
    for (const secret of ['UNSENT_CODE_SECRET', 'INTERVIEWER_CODE_SECRET', 'UNREVIEWED_ANSWER_SECRET', 'sixty second']) assert.ok(!JSON.stringify(contexts[0]).includes(secret));
    assert.ok(Object.keys(contexts[0].sources).some(key => key.endsWith(':execution')));
    contexts.length = 0;
    await generate(written.id);
    assert.ok(contexts[0].sources[`question:${written.id}:reviewed-transcript`]);
    assert.equal(contexts[0].interview.submissions.length, 0);
    assert.equal(contexts[0].interview.questions.length, 1);
    fabricate = true;
    await assert.rejects(generate(written.id), /unsupported evidence/);
    fabricate = false; overflow = true; contexts.length = 0;
    await generate(coding.id);
    assert.equal(contexts.length, 2);
    assert.equal(contexts[1].coverage.maxChars, 5000);
    overflow = false;
    await assert.rejects(generate(coding.id, -1), /not found|not owned/);
    await assert.rejects(generate(2147483647), /Select a question/);
    if (process.env.LIVE_FOLLOW_UP_CHECK === '1') {
      for (const question of [coding, written]) {
        const live: any = await executeAgent('interview-assistant', { questionId: question.id }, owner.id, interview.id);
        assert.ok(assistantSchema.parse(live).followUps.length > 0, 'Live provider must return actionable follow-ups');
        assert.equal(live._question.id, question.id);
        console.log(JSON.stringify({ evidenceType: question.questionType === 'coding' ? 'candidate-code' : 'reviewed-transcript', liveFollowUps: live.followUps.length, questionScoped: true, evidenceValidated: true }));
      }
    }
    await prisma.interviewSubmission.deleteMany({ where: { interviewId: interview.id, submittedBy: 'candidate' } });
    await assert.rejects(generate(coding.id), /candidate must submit code/);

    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'completed', endedAt: new Date() } });
    await assert.rejects(generate(written.id), /during a live interview/);
  } finally {
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.deleteMany({ where: { id: { in: questions.map(q => q.id) } } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
});

