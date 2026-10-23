import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../prisma';
import { buildFinalEvaluationContext, finalEvaluationContext } from '../ai/final-evaluation-context';
import { validateEvidence } from '../ai/schemas';

test('final summaries aggregate repeated skill ratings and cite saved interviewer feedback within budget', () => {
  const context = buildFinalEvaluationContext({ id: 1, title: 'Completed interview', status: 'completed' }, [
    { id: 1, questionId: 10, revision: 1, skills: [{ skill: 'Java', rating: 2, rationale: 'Weak in Spring Boot transactions.' }, { skill: 'DSA', rating: 2, rationale: 'Brute force works but misses optimal approach.' }] },
    { id: 2, questionId: 11, revision: 1, skills: [{ skill: 'java', rating: 3, rationale: 'Explained core Java.' }] },
  ]);
  assert.equal(context.interview.skillEvaluations.length, 2);
  const source = context.sources['skill-evaluation:0'];
  assert.match(source, /mean 2.5\/5/);
  assert.match(source, /2 rating/);
  assert.match(source, /Weak in Spring Boot transactions/);
  assert.match(source, /Explained core Java/);
  validateEvidence({ summaryEvidence: [{ sourceId: 'skill-evaluation:0', quote: 'Weak in Spring Boot transactions.' }] }, context.sources);
  assert.throws(() => validateEvidence({ summaryEvidence: [{ sourceId: 'current:code', quote: 'invented' }] }, context.sources));
  assert.throws(() => buildFinalEvaluationContext({ id: 1, title: '', status: 'completed' }, []), /Finalize at least one/);
  const large = buildFinalEvaluationContext({ id: 1, title: 'Large', status: 'completed' }, [{ id: 1, questionId: 1, revision: 1, skills: Array.from({ length: 20 }, (_, index) => ({ skill: `Skill ${index}`, rating: 3, rationale: 'Saved rationale '.repeat(1000) })) }], 5000);
  assert.ok(JSON.stringify(large).length <= 5000);
  assert.equal(large.interview.skillEvaluations.length, 20);
});

test('final summary context reads only the assigned interviewer finalized skill evaluations after completion', async () => {
  const user = await prisma.user.create({ data: { name: 'Final summary fixture', email: `summary-${randomUUID()}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const interview = await prisma.interview.create({ data: { title: 'Summary fixture', interviewerId: user.id, candidateName: 'Fixture', candidateEmail: 'fixture@test.invalid', roomToken: randomUUID(), status: 'completed' } });
  try {
    await prisma.interviewEvaluation.createMany({ data: [
      { interviewId: interview.id, questionId: -1, authorId: user.id, status: 'final', executionResults: {}, observations: [], skills: [{ skill: 'Java', rating: 2, rationale: 'Core Java only; weak in Spring Boot.' }] },
      { interviewId: interview.id, questionId: -2, authorId: user.id, status: 'draft', executionResults: {}, observations: [], skills: [{ skill: 'DRAFT_SKILL', rating: 5, rationale: 'Not finalized.' }] },
      { interviewId: interview.id, questionId: -3, authorId: user.id + 1000000, status: 'final', executionResults: {}, observations: [], skills: [{ skill: 'OTHER_AUTHOR_SKILL', rating: 5, rationale: 'Other author.' }] },
    ] });
    const context = await finalEvaluationContext(interview.id, user.id);
    assert.deepEqual(context.interview.skillEvaluations.map((skill) => skill.skill), ['Java']);
    assert.equal(JSON.stringify(context).includes('DRAFT_SKILL'), false);
    assert.equal(JSON.stringify(context).includes('OTHER_AUTHOR_SKILL'), false);
    await assert.rejects(finalEvaluationContext(interview.id, user.id + 1000000), /Assigned interview not found/);
    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'in_progress' } });
    await assert.rejects(finalEvaluationContext(interview.id, user.id), /End the interview/);
  } finally {
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
