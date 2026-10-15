import { aiConfigured, aiConfig } from '../ai/config';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { structuredAI, WorkflowError } from '../services/structured-ai';
import {
  generationSchema,
  questionContentSchema,
  validationSchema,
} from '../services/workflow-schemas';
import { executeCode, isMockMode } from '../services/judge0';

export function createAIWorkflowRouter(
  dependencies: {
    ai?: typeof structuredAI;
    execute?: typeof executeCode;
    mockMode?: typeof isMockMode;
  } = {},
) {
  const ai = dependencies.ai ?? structuredAI;
  const execute = dependencies.execute ?? executeCode;
  const mockMode = dependencies.mockMode ?? isMockMode;
  const router = Router();
  router.use(adminOnly);
  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void handler(req, res).catch(next);
    };
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const serialize = (d: any) => ({
    ...d,
    content: questionContentSchema.parse(d.content),
  });

  router.get('/status', (_req, res) =>
    res.json({
      configured: aiConfigured(),
      provider: aiConfig().provider,
      model: aiConfig().model,
      canVerify: !mockMode(),
    }),
  );
  router.get(
    '/drafts',
    wrap(async (_req, res) => {
      res.json(
        (
          await prisma.aIQuestionDraft.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 200,
          })
        ).map(serialize),
      );
    }),
  );
  router.post(
    '/generate',
    wrap(async (req, res) => {
      const input = generationSchema.parse(req.body);
      const bank = await prisma.question.findMany({
        select: { title: true, statement: true },
        take: 100,
      });
      const output = await ai(
        'generated_questions',
        z.object({ questions: z.array(questionContentSchema) }),
        'Generate original, unambiguous coding/debugging questions matching every requested constraint. Include at least one sample and one hidden edge case, exact stdin/stdout specifications, a correct Python reference solution and explanation. Do not repeat supplied bank questions. Return exactly the requested count.',
        { ...input, existingQuestions: bank, _authorId: req.user!.id },
      );
      if (
        output.questions.length !== input.count ||
        output.questions.some(
          (q) =>
            q.difficulty !== input.difficulty ||
            q.questionType !== input.questionType,
        )
      )
        throw new WorkflowError(
          'AI output did not match the requested count, type or difficulty. Retry generation.',
          502,
        );
      const drafts = await prisma.$transaction(
        output.questions.map((content) =>
          prisma.aIQuestionDraft.create({
            data: { authorId: req.user!.id, content },
          }),
        ),
      );
      res.status(201).json(drafts.map(serialize));
    }),
  );
  router.post(
    '/drafts',
    wrap(async (req, res) => {
      const content = questionContentSchema.parse(req.body);
      res
        .status(201)
        .json(
          serialize(
            await prisma.aIQuestionDraft.create({
              data: { authorId: req.user!.id, content },
            }),
          ),
        );
    }),
  );
  router.put(
    '/drafts/:id',
    wrap(async (req, res) => {
      const input = z
        .object({
          content: questionContentSchema,
          revision: z.number().int().positive(),
        })
        .parse(req.body);
      const updated = await prisma.aIQuestionDraft.updateMany({
        where: {
          id: Number(req.params.id),
          revision: input.revision,
          status: { not: 'approved' },
        },
        data: {
          content: input.content,
          status: 'draft',
          validation: undefined,
          validatedRevision: null,
          revision: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new WorkflowError(
          'This draft changed or is approved. Reload before editing.',
          409,
        );
      res.json(
        serialize(
          await prisma.aIQuestionDraft.findUniqueOrThrow({
            where: { id: Number(req.params.id) },
          }),
        ),
      );
    }),
  );
  router.post(
    '/drafts/:id/validate',
    wrap(async (req, res) => {
      const draft = await prisma.aIQuestionDraft.findUnique({
        where: { id: Number(req.params.id) },
      });
      if (!draft) throw new WorkflowError('Draft not found', 404);
      if (draft.status === 'approved')
        throw new WorkflowError(
          'Approved questions cannot be revalidated',
          409,
        );
      const content = questionContentSchema.parse(draft.content);
      const bank = await prisma.question.findMany({
        select: { id: true, title: true, statement: true },
      });
      const duplicates = bank.filter(
        (q) =>
          normalize(q.title) === normalize(content.title) ||
          normalize(q.statement) === normalize(content.statement),
      );
      const otherDrafts = await prisma.aIQuestionDraft.findMany({
        where: { id: { not: draft.id }, status: { not: 'approved' } },
        select: { id: true, content: true },
      });
      const draftDuplicates = otherDrafts.filter((d) => {
        const q = questionContentSchema.parse(d.content);
        return (
          normalize(q.title) === normalize(content.title) ||
          normalize(q.statement) === normalize(content.statement)
        );
      });
      const result = await ai(
        'question_validation',
        validationSchema,
        'Independently validate all seven checks exactly once: duplicate, correctness, ambiguity, difficulty, testCases, expectedSolution, edgeCases. A passed duplicate check means no duplicate. Solve the problem and examine every expected output and reference solution. Compare to existing questions for semantic duplicates. Cite concrete evidence for each check; any uncertainty must fail that check.',
        {
          question: content,
          bank,
          otherDrafts: otherDrafts.map((d) => d.content),
        },
      );
      const keys = [
        'duplicate',
        'correctness',
        'ambiguity',
        'difficulty',
        'testCases',
        'expectedSolution',
        'edgeCases',
      ];
      if (
        new Set(result.checks.map((c) => c.key)).size !== 7 ||
        result.checks.length !== 7 ||
        !keys.every((k) => result.checks.some((c) => c.key === k))
      )
        throw new WorkflowError('Validator omitted checks. Please retry.', 502);
      if (duplicates.length || draftDuplicates.length) {
        const check = result.checks.find((c) => c.key === 'duplicate')!;
        check.passed = false;
        check.evidence = `Exact duplicate detected: bank IDs ${duplicates.map((q) => q.id).join(', ')}; draft IDs ${draftDuplicates.map((q) => q.id).join(', ')}`;
      }
      const sampleAndHidden =
        content.testCases.some((t) => t.isSample) &&
        content.testCases.some((t) => !t.isSample);
      const executions: { index: number; passed: boolean; status: string }[] =
        [];
      if (!mockMode()) {
        for (const [index, tc] of content.testCases.entries()) {
          const run = await execute({
            sourceCode: content.expectedSolutionPython,
            languageId: 71,
            stdin: tc.input,
            expectedOutput: tc.expectedOutput,
            cpuTimeLimit: 5,
            memoryLimit: 256000,
          });
          executions.push({
            index,
            passed:
              run.status.id === 3 &&
              (run.stdout || '').trim() === tc.expectedOutput.trim(),
            status: run.status.description,
          });
        }
      }
      const verified =
        executions.length === content.testCases.length &&
        executions.every((e) => e.passed);
      for (const key of ['testCases', 'expectedSolution']) {
        const check = result.checks.find((c) => c.key === key)!;
        if (!verified || !sampleAndHidden) {
          check.passed = false;
          check.evidence += mockMode()
            ? ' Real reference execution is unavailable in mock judge mode; enable JUDGE_MODE=live before approval.'
            : ' Reference execution failed or sample/hidden cases are missing.';
        }
      }
      const validation = {
        ...result,
        executions,
        executionVerified: verified,
        passed: result.checks.every((c) => c.passed),
        revision: draft.revision,
      };
      const update = await prisma.aIQuestionDraft.updateMany({
        where: {
          id: draft.id,
          revision: draft.revision,
          status: { not: 'approved' },
        },
        data: {
          validation,
          validatedRevision: draft.revision,
          status: validation.passed ? 'validated' : 'needs_changes',
        },
      });
      if (!update.count)
        throw new WorkflowError(
          'Draft was edited during validation. Validate the new revision.',
          409,
        );
      res.json(
        serialize(
          await prisma.aIQuestionDraft.findUniqueOrThrow({
            where: { id: draft.id },
          }),
        ),
      );
    }),
  );
  router.post(
    '/drafts/:id/approve',
    wrap(async (req, res) => {
      const revision = z
        .object({ revision: z.number().int().positive() })
        .parse(req.body).revision;
      const result = await prisma.$transaction(
        async (tx) => {
          const draft = await tx.aIQuestionDraft.findUnique({
            where: { id: Number(req.params.id) },
          });
          if (!draft) throw new WorkflowError('Draft not found', 404);
          if (draft.status === 'approved') return draft;
          if (
            draft.status !== 'validated' ||
            draft.revision !== revision ||
            draft.validatedRevision !== revision ||
            !(draft.validation as any)?.passed
          )
            throw new WorkflowError(
              'Save and successfully validate the latest revision before approving.',
              409,
            );
          const q = questionContentSchema.parse(draft.content);
          const bank = await tx.question.findMany({
            select: { title: true, statement: true },
          });
          if (
            bank.some(
              (b) =>
                normalize(b.title) === normalize(q.title) ||
                normalize(b.statement) === normalize(q.statement),
            )
          )
            throw new WorkflowError(
              'This question already exists in the bank.',
              409,
            );
          const created = await tx.question.create({
            data: {
              title: q.title,
              statement: q.statement,
              difficulty: q.difficulty,
              questionType: q.questionType,
              tags: JSON.stringify([
                ...new Set([...q.topics, ...q.requiredSkills]),
              ]),
              testCases: { create: q.testCases },
              starterCodes: {
                create: [
                  {
                    languageId: 71,
                    languageName: 'Python',
                    code: q.starterCodePython,
                  },
                ],
              },
            },
          });
          return tx.aIQuestionDraft.update({
            where: { id: draft.id },
            data: {
              status: 'approved',
              approvedBy: req.user!.id,
              approvedAt: new Date(),
              questionId: created.id,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      res.json(serialize(result));
    }),
  );
  return router;
}
export default createAIWorkflowRouter();
