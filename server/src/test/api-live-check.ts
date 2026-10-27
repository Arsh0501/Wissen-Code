import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import { createSessionForUser } from '../routes/auth';
import { aiConfig } from '../ai/config';

// Explicitly invoked smoke check against the running local API; removes only its fixtures.
const base = process.env.API_CHECK_URL || 'http://localhost:4001/api';
const ids: number[] = [];
const drafts: number[] = [];
const interviews: number[] = [];
const questions: number[] = [];
const results: { operation: string; status: string; detail?: unknown }[] = [];
async function call(
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(180000),
  });
  const data: any = await response.json();
  return { status: response.status, data };
}
async function main() {
  try {
    const cfg = aiConfig();
    results.push({
      operation: 'configuration',
      status: 'INFO',
      detail: {
        provider: cfg.provider,
        model: cfg.model,
        aiKeyPresent: !!cfg.apiKey,
        redisConfigured: !!process.env.REDIS_URL,
        asyncGrading: process.env.ASYNC_GRADING === '1',
      },
    });
    for (const path of ['/health', '/ready']) {
      const r = await call(path);
      results.push({ operation: path, status: String(r.status), detail: r.data });
    }
    for (const role of ['admin', 'interviewer', 'candidate']) {
      const user = await prisma.user.create({
        data: {
          name: 'API check ' + role,
          email: `api-check-${role}-${randomUUID()}@test.invalid`,
          password: 'unused',
          role,
        },
      });
      ids.push(user.id);
      const session = await createSessionForUser(user.id, user.email, user.name, role);
      if (!session.token) throw new Error('Could not create smoke session');
      for (const path of [
        '/assessments',
        '/interviews',
        '/interviews/my-interviews',
        '/ai/status',
        '/ai/jobs',
      ]) {
        const r = await call(path, session.token);
        const expected =
          role === 'admin' ||
          (role === 'interviewer' &&
            ['/interviews', '/interviews/my-interviews', '/ai/jobs'].includes(path)) ||
          (role === 'candidate' && ['/assessments', '/interviews/my-interviews'].includes(path))
            ? 200
            : 403;
        results.push({
          operation: `${role} GET ${path}`,
          status: r.status === expected ? 'PASS' : 'FAIL',
          detail: {
            expected,
            actual: r.status,
            ...(r.status >= 500 ? { error: r.data.error } : {}),
          },
        });
      }
      if (role === 'interviewer') {
        const interview = await prisma.interview.create({
          data: {
            title: 'API smoke interview',
            interviewerId: user.id,
            candidateName: 'Smoke candidate',
            candidateEmail: 'smoke@test.invalid',
            roomToken: randomUUID(),
            candidateResume:
              'Python backend engineer with three years building REST APIs, PostgreSQL databases and automated tests.',
          },
        });
        interviews.push(interview.id);
        for (const suffix of ['plan', 'evaluations', 'ai-results']) {
          const r = await call(`/interview-workflows/${interview.id}/${suffix}`, session.token);
          results.push({
            operation: `interviewer ${suffix}`,
            status: r.status === 200 ? 'PASS' : 'FAIL',
            detail: { httpStatus: r.status },
          });
        }
        const resume = await call(
          `/interviews/${interview.id}/generate-resume-questions`,
          session.token,
          {},
        );
        results.push({
          operation: 'interview resume generation',
          status: resume.status === 200 && resume.data.questions?.length > 0 ? 'PASS' : 'FAIL',
          detail: {
            httpStatus: resume.status,
            source: resume.data.source,
            count: resume.data.questions?.length,
            error: resume.data.error,
          },
        });
        if (cfg.apiKey) {
          const plan = await call(
            `/interview-workflows/${interview.id}/plan/generate`,
            session.token,
            {
              jobRequirements: 'Python backend engineer building REST APIs',
              candidateExperience: 'Three years of Python backend experience',
              requiredSkills: ['Python'],
              durationMinutes: 30,
            },
          );
          results.push({
            operation: 'real interview AI plan',
            status: plan.status === 200 ? 'PASS' : 'FAIL',
            detail: {
              httpStatus: plan.status,
              sections: plan.data.sections?.length,
              error: plan.data.error,
            },
          });
          const question = await prisma.question.create({
            data: {
              title: 'Python evidence fixture',
              statement: 'Explain how to read and print an integer in Python.',
              difficulty: 'easy',
            },
          });
          questions.push(question.id);
          await prisma.interviewQuestion.create({
            data: { interviewId: interview.id, questionId: question.id, orderIndex: 0 },
          });
          const evaluation = await call(
            `/interview-workflows/${interview.id}/evaluations`,
            session.token,
            {
              questionId: question.id,
              candidateAnswer: 'I use int(input()) to read an integer and print(n) to write it.',
              candidateCode: 'n = int(input())\nprint(n)',
              notes: 'Candidate explained input parsing.',
              skills: [
                { skill: 'Python', rating: 3, rationale: 'Explained integer input and output.' },
              ],
              status: 'final',
            },
            'PUT',
          );
          if (evaluation.status === 200) {
            const observations = await call(
              `/interview-workflows/${interview.id}/evaluations/${evaluation.data.id}/observe`,
              session.token,
              {},
            );
            results.push({
              operation: 'real interview AI observations',
              status: observations.status === 200 ? 'PASS' : 'FAIL',
              detail: {
                httpStatus: observations.status,
                count: observations.data.observations?.length,
                error: observations.data.error,
              },
            });
          } else
            results.push({
              operation: 'interview evaluation save',
              status: 'FAIL',
              detail: evaluation.data,
            });
        }
        await prisma.interview.update({
          where: { id: interview.id },
          data: {
            status: 'in_progress',
            startedAt: new Date(),
            currentCode: 'n = int(input())\nprint(n)',
          },
        });
        await prisma.interviewQuestion.updateMany({
          where: { interviewId: interview.id },
          data: {
            candidateAnswer: 'I use int(input()) to parse an integer and print(n) to output it.',
          },
        });
        await prisma.interviewEvent.create({
          data: {
            interviewId: interview.id,
            eventType: 'ANSWER_UPDATED',
            actorRole: 'candidate',
            payload: JSON.stringify({ answer: 'I use int(input()) to parse an integer.' }),
          },
        });
        for (const kind of ['interview-assistant', 'note-writer', 'evaluation']) {
          if (kind === 'evaluation')
            await prisma.interview.update({
              where: { id: interview.id },
              data: { status: 'completed', endedAt: new Date() },
            });
          const job = await call('/ai/jobs', session.token, {
            kind,
            interviewId: interview.id,
            input: {},
          });
          results.push({
            operation: `interview agent ${kind}`,
            status: [200, 202].includes(job.status) ? 'PASS' : 'FAIL',
            detail: { httpStatus: job.status, status: job.data.status, error: job.data.error },
          });
        }
      }
      if (role !== 'admin') continue;
      const judge = await call('/judge/run', session.token, {
        sourceCode: 'print(42)',
        languageId: 71,
      });
      results.push({
        operation: 'live Python execution',
        status: judge.status === 200 && judge.data.stdout?.trim() === '42' ? 'PASS' : 'FAIL',
        detail: judge.data,
      });
      if (cfg.apiKey) {
        const generated = await call('/ai/generate', session.token, {
          topic: 'Sum of even integers in an array',
          difficulty: 'easy',
          questionType: 'coding',
          count: 1,
          requiredSkills: ['Python'],
          starterLanguages: [{ id: 71, name: 'Python' }],
        });
        const rows = Array.isArray(generated.data) ? generated.data : (generated.data.drafts ?? []);
        for (const row of rows) if (Number.isInteger(row.id)) drafts.push(row.id);
        results.push({
          operation: 'real assessment AI generation',
          status: generated.status === 201 || generated.status === 200 ? 'PASS' : 'FAIL',
          detail: {
            httpStatus: generated.status,
            error: generated.data.error,
            drafts: rows.length,
          },
        });
        if (rows[0]?.id) {
          const validation = await call(`/ai/drafts/${rows[0].id}/validate`, session.token, {});
          results.push({
            operation: 'real AI question validation',
            status: validation.status === 200 ? 'PASS' : 'FAIL',
            detail: {
              httpStatus: validation.status,
              error: validation.data.error,
              validation: validation.data.validation,
            },
          });
        }
      } else
        results.push({
          operation: 'real assessment AI generation',
          status: 'BLOCKED',
          detail: 'No provider key configured',
        });
    }
  } catch (error) {
    results.push({
      operation: 'smoke execution',
      status: 'FAIL',
      detail: (error as Error).message,
    });
  } finally {
    if (drafts.length) await prisma.aIQuestionDraft.deleteMany({ where: { id: { in: drafts } } });
    if (interviews.length) await prisma.interview.deleteMany({ where: { id: { in: interviews } } });
    if (questions.length) await prisma.question.deleteMany({ where: { id: { in: questions } } });
    if (ids.length) {
      await prisma.aIQuestionDraft.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.aIJob.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
    console.log(JSON.stringify(results, null, 2));
    if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
  }
}
void main();
