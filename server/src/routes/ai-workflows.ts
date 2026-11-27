import { validationComparisons } from '../services/questions/validation-context';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../database/prisma';
import { aiConfigured, aiConfig } from '../ai/config';
import { adminOnly } from '../middleware/adminOnly';
import { structuredAI, WorkflowError } from '../services/ai/structured-ai';
import { mcqContentSchema, validationSchema } from '../services/questions/workflow-schemas';
import { canonicalJSON, generateStudioDrafts } from '../services/questions/studio-generation';
import { asWizardContent } from '../services/questions/coding-wizard-schemas';
import {
  generateCodingStage,
  saveCodingStage,
  approveCodingDraft,
} from '../services/questions/coding-wizard';
import {
  ReferenceVerificationFailure,
  referenceIsVerified,
  verifyReferenceOutputs,
} from '../services/questions/reference-verification';
import { executeCode, isMockMode } from '../services/execution/judge0';
import { diagnoseQuestionExecution } from '../services/questions/question-validation-feedback';

export function createAIWorkflowRouter(
  dependencies: {
    ai?: typeof structuredAI;
    execute?: typeof executeCode;
    mockMode?: typeof isMockMode;
  } = {},
) {
  const ai = dependencies.ai ?? structuredAI,
    execute = dependencies.execute ?? executeCode,
    mockMode = dependencies.mockMode ?? isMockMode;
  const router = Router();
  router.use(adminOnly);
  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void handler(req, res).catch(next);
    };
  const id = (req: Request) => z.coerce.number().int().positive().parse(req.params.id);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const serialize = (draft: any) => ({
    ...draft,
    content:
      draft.content.questionType === 'mcq'
        ? mcqContentSchema.parse(draft.content)
        : asWizardContent(draft.content),
    referenceVerified: referenceIsVerified(draft),
  });
  const retired = (res: Response) =>
    res.status(410).json({
      error: 'Coding questions now use the step-by-step coding wizard. Resume this draft there.',
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
    wrap(async (_req, res) =>
      res.json(
        (
          await prisma.aIQuestionDraft.findMany({
            where: { status: { notIn: ['approved', 'rejected'] }, questionId: null },
            orderBy: { updatedAt: 'desc' },
            take: 200,
          })
        ).map(serialize),
      ),
    ),
  );
  router.post(
    '/generate',
    wrap(async (req, res) => {
      if (req.body.questionType !== 'mcq') return retired(res);
      res.status(201).json((await generateStudioDrafts(req.body, req.user!.id, ai)).map(serialize));
    }),
  );
  for (const stage of ['question', 'starter', 'tests', 'solution'] as const)
    router.post(
      `/coding/generate-${stage}`,
      wrap(async (req, res) =>
        res.json(serialize(await generateCodingStage(stage, req.body, req.user!.id, ai))),
      ),
    );
  router.put(
    '/coding/:id',
    wrap(async (req, res) => res.json(serialize(await saveCodingStage(id(req), req.body)))),
  );
  router.post(
    '/coding/:id/approve',
    wrap(async (req, res) => {
      const { revision } = z.object({ revision: z.number().int().positive() }).parse(req.body);
      res.json(serialize(await approveCodingDraft(id(req), revision, req.user!.id)));
    }),
  );
  router.post(
    '/drafts',
    wrap(async (req, res) => {
      if (req.body.questionType !== 'mcq') return retired(res);
      const content = mcqContentSchema.parse(req.body);
      res
        .status(201)
        .json(
          serialize(
            await prisma.aIQuestionDraft.create({ data: { authorId: req.user!.id, content } }),
          ),
        );
    }),
  );
  router.put(
    '/drafts/:id',
    wrap(async (req, res) => {
      const d = await prisma.aIQuestionDraft.findUnique({ where: { id: id(req) } });
      if (!d) throw new WorkflowError('Draft not found', 404);
      if ((d.content as any).questionType !== 'mcq') return retired(res);
      const input = z
        .object({ revision: z.number().int().positive(), content: mcqContentSchema })
        .parse(req.body);
      const updated = await prisma.aIQuestionDraft.updateMany({
        where: { id: d.id, revision: input.revision, status: { notIn: ['approved', 'rejected'] } },
        data: {
          content: input.content,
          revision: { increment: 1 },
          status: 'draft',
          validatedRevision: null,
        },
      });
      if (!updated.count) {
        const current = await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: d.id } });
        if (
          current.status === 'draft' &&
          current.revision === input.revision + 1 &&
          canonicalJSON(current.content) === canonicalJSON(input.content)
        )
          return res.json(serialize(current));
        throw new WorkflowError('Draft changed. Reload before editing.', 409);
      }
      res.json(serialize(await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: d.id } })));
    }),
  );
  router.delete(
    '/drafts/:id',
    wrap(async (req, res) => {
      const { revision } = z.object({ revision: z.number().int().positive() }).parse(req.body);
      const removed = await prisma.aIQuestionDraft.deleteMany({
        where: { id: id(req), revision, status: { not: 'approved' }, questionId: null },
      });
      if (!removed.count && (await prisma.aIQuestionDraft.findUnique({ where: { id: id(req) } })))
        throw new WorkflowError('Only unchanged, unapproved drafts can be deleted', 409);
      res.json({ success: true });
    }),
  );
  router.post(
    '/drafts/:id/verify-reference',
    wrap(async (req, res) => {
      try {
        res.json(
          serialize(
            await verifyReferenceOutputs(id(req), req.body, req.user!.id, { execute, mockMode }),
          ),
        );
      } catch (error) {
        if (error instanceof ReferenceVerificationFailure)
          return res
            .status(error.status)
            .json({ error: error.message, revision: error.revision, executions: error.executions });
        throw error;
      }
    }),
  );
  router.post(
    '/drafts/:id/test-solution',
    wrap(async (req, res) => {
      const input = z
        .object({
          revision: z.number().int().positive(),
          languageId: z.number().int(),
          sourceCode: z.string().trim().min(1).max(100000),
        })
        .parse(req.body);
      const d = await prisma.aIQuestionDraft.findUnique({ where: { id: id(req) } });
      if (!d) throw new WorkflowError('Draft not found', 404);
      if (d.revision !== input.revision || ['approved', 'rejected'].includes(d.status))
        throw new WorkflowError('Draft changed or is no longer in review', 409);
      if ((d.content as any).questionType === 'mcq')
        throw new WorkflowError('MCQs do not have executable tests', 400);
      if (!referenceIsVerified(d))
        throw new WorkflowError(
          'Complete trusted reference verification before running all cases',
          409,
        );
      const content = asWizardContent(d.content);
      if (!content.starterCodes.some((s) => s.languageId === input.languageId))
        throw new WorkflowError('Choose a saved starter language', 400);
      if (mockMode()) throw new WorkflowError('Live judge execution is required', 503);
      const results = [];
      for (const [index, test] of content.testCases.entries())
        results.push(
          await diagnoseQuestionExecution(
            execute,
            {
              sourceCode: input.sourceCode,
              languageId: input.languageId,
              stdin: test.input,
              expectedOutput: test.expectedOutput,
              cpuTimeLimit: 5,
              memoryLimit: 256000,
            },
            'reference',
            index,
          ),
        );
      const current = await prisma.aIQuestionDraft.findUnique({ where: { id: d.id } });
      if (
        !current ||
        current.revision !== d.revision ||
        ['approved', 'rejected'].includes(current.status)
      )
        throw new WorkflowError('Draft changed while tests ran; run again', 409);
      res.json({
        revision: d.revision,
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        results,
      });
    }),
  );
  router.post(
    '/drafts/:id/validate',
    wrap(async (req, res) => {
      const d = await prisma.aIQuestionDraft.findUnique({ where: { id: id(req) } });
      if (!d) throw new WorkflowError('Draft not found', 404);
      if ((d.content as any).questionType !== 'mcq') return retired(res);
      if (['approved', 'rejected'].includes(d.status))
        throw new WorkflowError('Draft is no longer in review', 409);
      const question = mcqContentSchema.parse(d.content);
      const bank = await prisma.question.findMany({ select: { title: true, statement: true } });
      const otherDrafts = await prisma.aIQuestionDraft.findMany({
        where: { id: { not: d.id }, status: { notIn: ['approved', 'rejected'] } },
        select: { content: true },
      });
      const otherQuestions = otherDrafts.map(
        (row) => row.content as { title: string; statement: string },
      );
      const result = validationSchema.parse(
        await ai(
          'question_validation',
          validationSchema,
          'Independently solve this single-choice MCQ. Return exactly seven checks: duplicate, correctness, ambiguity, difficulty, testCases (option quality), expectedSolution (answer key), edgeCases (counterexamples). Do not require answer explanations or code execution.',
          {
            question,
            bank: validationComparisons(question, bank),
            otherDrafts: validationComparisons(question, otherQuestions, 2000),
          },
        ),
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
        result.checks.length !== 7 ||
        new Set(result.checks.map((c) => c.key)).size !== 7 ||
        !keys.every((k) => result.checks.some((c) => c.key === k))
      )
        throw new WorkflowError('Validator omitted checks. Retry.', 502);
      if (
        [...bank, ...otherQuestions].some(
          (q) =>
            normalize(q.title) === normalize(question.title) ||
            normalize(q.statement) === normalize(question.statement),
        )
      ) {
        const check = result.checks.find((c) => c.key === 'duplicate')!;
        check.passed = false;
        check.evidence = 'An exact duplicate exists in the question bank.';
      }
      const validation = {
        ...result,
        passed: result.checks.every((c) => c.passed),
        revision: d.revision,
        executionVerified: false,
        executions: [],
        fixes: [],
      };
      const updated = await prisma.aIQuestionDraft.updateMany({
        where: { id: d.id, revision: d.revision, status: { notIn: ['approved', 'rejected'] } },
        data: {
          validation,
          validatedRevision: d.revision,
          status: validation.passed ? 'validated' : 'needs_changes',
        },
      });
      if (!updated.count) throw new WorkflowError('Draft changed during validation', 409);
      res.json(serialize(await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: d.id } })));
    }),
  );
  router.post(
    '/drafts/:id/approve',
    wrap(async (req, res) => {
      const { revision, directApprove, skipValidation } = z
        .object({
          revision: z.number().int().positive(),
          directApprove: z.boolean().optional(),
          skipValidation: z.boolean().optional(),
        })
        .parse(req.body);
      const result = await prisma.$transaction(
        async (tx) => {
          const d = await tx.aIQuestionDraft.findUnique({ where: { id: id(req) } });
          if (!d) throw new WorkflowError('Draft not found', 404);
          if ((d.content as any).questionType !== 'mcq')
            throw new WorkflowError('Use the coding wizard approval step', 410);
          if (d.status === 'approved') return d;
          if (d.revision !== revision || d.status === 'rejected')
            throw new WorkflowError('Draft changed. Reload.', 409);
          if (
            !directApprove &&
            !skipValidation &&
            (d.status !== 'validated' ||
              d.validatedRevision !== revision ||
              !(d.validation as any)?.passed)
          )
            throw new WorkflowError('Validate the saved MCQ before approving', 409);
          const c = mcqContentSchema.parse(d.content),
            bank = await tx.question.findMany({ select: { title: true, statement: true } });
          if (
            bank.some(
              (q) =>
                normalize(q.title) === normalize(c.title) ||
                normalize(q.statement) === normalize(c.statement),
            )
          )
            throw new WorkflowError('Question already exists in the bank', 409);
          const q = await tx.question.create({
            data: {
              title: c.title,
              statement: c.statement,
              difficulty: c.difficulty,
              questionType: 'mcq',
              tags: JSON.stringify([...new Set([...c.topics, ...c.requiredSkills])]),
              settings: {
                options: c.options,
                correctOptionIds: [c.correctOptionId],
                multiple: false,
                explanation: c.solutionExplanation,
              },
            },
          });
          return tx.aIQuestionDraft.update({
            where: { id: d.id },
            data: {
              status: 'approved',
              questionId: q.id,
              approvedBy: req.user!.id,
              approvedAt: new Date(),
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
