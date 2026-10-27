import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import { createAIWorkflowRouter } from '../routes/ai-workflows';
import { executeCode } from '../services/execution/judge0';
async function main() {
  const user = await prisma.user.create({
    data: {
      name: 'AI validation check',
      email: `ai-validation-${randomUUID()}@test.invalid`,
      role: 'admin',
      password: 'unused',
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: user.id, name: user.name, email: user.email, role: 'admin' };
    next();
  });
  app.use('/ai', createAIWorkflowRouter());
  app.use(
    (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error.status || 500).json({ error: error.message, name: error.name });
    },
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/ai`;
  try {
    const generated = await fetch(base + '/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Count negative integers',
        difficulty: 'easy',
        questionType: 'coding',
        count: 1,
        requiredSkills: ['Python'],
      }),
    });
    const drafts: any = await generated.json();
    console.log('generation', generated.status);
    if (!generated.ok) {
      console.log(JSON.stringify(drafts));
      return;
    }
    const row = (Array.isArray(drafts) ? drafts : drafts.drafts)[0];
    const validated = await fetch(base + `/drafts/${row.id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result: any = await validated.json();
    console.log(
      'validation',
      validated.status,
      JSON.stringify(
        validated.ok ? { status: result.status, validation: result.validation } : result,
      ),
    );
    if (validated.ok && !result.validation?.executionVerified) {
      console.log(
        'reference diagnosis',
        JSON.stringify({
          source: row.content.expectedSolutionPython,
          test: row.content.testCases[0],
          result: await executeCode({
            sourceCode: row.content.expectedSolutionPython,
            languageId: 71,
            stdin: row.content.testCases[0].input,
          }),
        }),
      );
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
void main();
