import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../prisma';
import { createInterviewWorkflowRouter } from '../routes/interview-workflows';
import { executeAgent } from '../ai/agents';

async function main() {
  const run = randomUUID();
  const user = await prisma.user.create({ data: { name: 'Observation check', email: `observe-${run}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const question = await prisma.question.create({ data: { title: 'Core Java and transactions', statement: 'Explain Java collections and transactional service design.', questionType: 'written', difficulty: 'medium' } });
  const interview = await prisma.interview.create({ data: { title: 'Observation fixture', interviewerId: user.id, candidateName: 'Fixture', candidateEmail: 'fixture@test.invalid', roomToken: run, status: 'completed', endedAt: new Date() } });
  await prisma.interviewQuestion.create({ data: { interviewId: interview.id, questionId: question.id } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: user.id, name: user.name, email: user.email, role: 'interviewer' }; next(); });
  app.use('/workflows', createInterviewWorkflowRouter());
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 500).json({ error: error.message }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/workflows/${interview.id}`;
  try {
    const saved = await fetch(base + '/evaluations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: question.id, candidateAnswer: '', candidateCode: '', notes: '', skills: [{ skill: 'Java', rating: 2, rationale: 'Explains core Java collections but cannot explain Spring Boot transactions.' }], status: 'final' }) });
    const evaluation: any = await saved.json();
    if (!saved.ok) throw new Error(`Save failed: ${evaluation.error}`);
    const observed = await fetch(base + `/evaluations/${evaluation.id}/observe`, { method: 'POST', signal: AbortSignal.timeout(180000) });
    const result: any = await observed.json();
    console.log(JSON.stringify({ httpStatus: observed.status, status: result.status, observations: result.observations?.length, evidenceSources: result.observations?.flatMap((item: any) => item.evidence.map((e: any) => e.source)), error: result.error }));
    if (!observed.ok || !result.observations?.length) process.exitCode = 1;
    const report: any = await executeAgent('evaluation', {}, user.id, interview.id);
    console.log(JSON.stringify({ finalSummary: !!report.summary, basis: report._basis, evaluatedSkills: report.skills?.map((skill: any) => skill.skill), summaryEvidenceSources: report.summaryEvidence?.map((e: any) => e.sourceId) }));
    if (!report.summary || report._basis !== 'skill-evaluations' || report.skills?.some((skill: any) => skill.skill.toLowerCase() !== 'java')) process.exitCode = 1;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
void main();
