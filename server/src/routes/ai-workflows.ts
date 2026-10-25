import { aiConfigured, aiConfig } from '../ai/config';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { structuredAI, WorkflowError } from '../services/structured-ai';
import {
  draftContentSchema,
  validationSchema,
} from '../services/workflow-schemas';
import { verifyStarterDrivers } from '../services/coding-question-contract';
import { executeCode, isMockMode } from '../services/judge0';
import { validationComparisons } from '../services/validation-context';
import { canonicalJSON, generateStudioDrafts } from '../services/studio-generation';
import { diagnoseQuestionExecution, QuestionExecution, questionValidationFixes } from '../services/question-validation-feedback';

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
    content: draftContentSchema.parse(d.content),
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
            where: { status: { notIn: ['approved', 'rejected'] }, questionId: null },
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
      const drafts = await generateStudioDrafts(req.body, req.user!.id, ai);
      res.status(201).json(drafts.map(serialize));
    }),
  );
  router.post(
    '/drafts',
    wrap(async (req, res) => {
      const content = draftContentSchema.parse(req.body);
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
          content: draftContentSchema,
          revision: z.number().int().positive(),
        })
        .parse(req.body);
      const previous = await prisma.aIQuestionDraft.findUnique({ where: { id: Number(req.params.id) }, select: { content: true } });
      if ((previous?.content as any)?.starterContractVersion === 2 && input.content.questionType !== 'mcq') input.content.starterContractVersion = 2;
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
      if (!updated.count) {
        const current = await prisma.aIQuestionDraft.findUnique({ where: { id: Number(req.params.id) } });
        // A lost response may be retried after the original save already committed.
        if (current?.status === 'draft' && current.revision === input.revision + 1 && canonicalJSON(current.content) === canonicalJSON(input.content)) return res.json(serialize(current));
        throw new WorkflowError('This draft changed or is approved. Reload before editing.', 409);
      }
      res.json(
        serialize(
          await prisma.aIQuestionDraft.findUniqueOrThrow({
            where: { id: Number(req.params.id) },
          }),
        ),
      );
    }),
  );
  router.delete('/drafts/:id', wrap(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { revision } = z.object({ revision: z.number().int().positive() }).parse(req.body);
    const removed = await prisma.aIQuestionDraft.deleteMany({ where: { id, revision, status: { not: 'approved' }, questionId: null } });
    if (!removed.count) {
      const existing = await prisma.aIQuestionDraft.findUnique({ where: { id } });
      if (existing) throw new WorkflowError('Only unapproved, unchanged drafts can be deleted. Refresh the queue.', 409);
    }
    res.json({ success: true });
  }));
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
      const content = draftContentSchema.parse(draft.content);
      const bank = await prisma.question.findMany({
        where: { ownerInterviewId: null },
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
        const q = draftContentSchema.parse(d.content);
        return (
          normalize(q.title) === normalize(content.title) ||
          normalize(q.statement) === normalize(content.statement)
        );
      });
      const result = await ai(
        'question_validation',
        validationSchema,
        (content.questionType === 'mcq' ? 'This is a single-choice MCQ. Independently solve it and verify exactly one option is correct. Answer explanations are optional; do not fail a missing or empty explanation. If one is supplied, check that it agrees with the answer. For testCases review option quality; for expectedSolution review the answer key; for edgeCases review counterexamples and distracting options. Code execution is not applicable. ' : 'Answer explanations are optional; do not fail a missing or empty prose explanation. The reference solution and test cases still need to be correct. ') + 'Independently validate all seven checks exactly once: duplicate, correctness, ambiguity, difficulty, testCases, expectedSolution, edgeCases. A passed duplicate check means no duplicate. Solve the problem and examine every expected output and reference solution. Compare to existing questions for semantic duplicates. Cite concrete evidence for each check; any uncertainty must fail that check. For every failed check, describe the exact inconsistency, affected field, and a concrete correction in evidence. Do not mark a concern resolved without supporting evidence.',
        {
          question: content,
          bank: validationComparisons(content, bank),
          otherDrafts: validationComparisons(content, otherDrafts.map((d) => draftContentSchema.parse(d.content)), 2000),
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
      if (content.questionType === 'mcq') {
        const validation = { ...result, checks: result.checks, passed: result.checks.every(c => c.passed),
          revision: draft.revision, executionVerified: false, executions: [], fixes: [] };
        const updated = await prisma.aIQuestionDraft.updateMany({
          where: { id: draft.id, revision: draft.revision, status: { not: 'approved' } },
          data: { validation, validatedRevision: draft.revision, status: validation.passed ? 'validated' : 'needs_changes' },
        });
        if (!updated.count) throw new WorkflowError('Draft changed during validation. Reload and retry.', 409);
        return res.json(serialize(await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: draft.id } })));
      }
      const sampleAndHidden =
        content.testCases.some((t) => t.isSample) &&
        content.testCases.some((t) => !t.isSample);
      const executions: QuestionExecution[] = [];
      if (!mockMode()) {
        for (const [index, tc] of content.testCases.entries()) {
          executions.push(await diagnoseQuestionExecution(execute, {
            sourceCode: content.expectedSolutionPython, languageId: 71, stdin: tc.input,
            expectedOutput: tc.expectedOutput, cpuTimeLimit: 5, memoryLimit: 256000,
          }, 'reference', index));
        }
      }
      const verified =
        executions.length === content.testCases.length &&
        executions.every((e) => e.passed);
      let starterVerification: { verified: boolean; executions: QuestionExecution[]; error?: string } = { verified: content.starterContractVersion !== 2, executions: [] };
      if (!mockMode()) {
        try { starterVerification = await verifyStarterDrivers(content, execute); }
        catch (error) { starterVerification = { verified: false, executions: [], error: (error as Error).message }; }
      }
      for (const key of ['testCases', 'expectedSolution']) {
        const check = result.checks.find((c) => c.key === key)!;
        if (!verified || !sampleAndHidden || !starterVerification.verified) {
          check.passed = false;
          check.evidence += mockMode()
            ? ' Real reference execution is unavailable in mock judge mode; enable JUDGE_MODE=live before approval.'
            : ' Reference execution failed or sample/hidden cases are missing.';
          if (!starterVerification.verified) check.evidence += ` Starter driver verification failed: ${starterVerification.error ?? 'check starter execution results'}.`;
        }
      }
      const validation = {
        ...result,
        executions,
        executionVerified: verified,
        starterVerified: starterVerification.verified,
        starterExecutions: starterVerification.executions,
        fixes: questionValidationFixes(result.checks, { starterError: starterVerification.error, mock: mockMode() }),
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
      const { revision, directApprove } = z
        .object({
          revision: z.number().int().positive(),
          directApprove: z.boolean().optional(),
        })
        .parse(req.body);
      let directlyVerifiedRevision: number | undefined;
      if (directApprove) {
        const draft = await prisma.aIQuestionDraft.findUnique({ where: { id: Number(req.params.id) } });
        if (!draft) throw new WorkflowError('Draft not found', 404);
        const content = draftContentSchema.parse(draft.content);
        if (draft.status !== 'approved' && content.questionType !== 'mcq' && content.starterContractVersion === 2) {
          if (draft.revision !== revision) throw new WorkflowError('Draft changed. Reload before approving.', 409);
          if (mockMode()) throw new WorkflowError('A real judge is required to verify starter input/output drivers.', 409);
          let verification: { verified: boolean; executions: QuestionExecution[]; error?: string };
          try { verification = await verifyStarterDrivers(content, execute); }
          catch (error) { verification = { verified: false, executions: [], error: (error as Error).message }; }
          if (!verification.verified) {
            const previous = draft.validatedRevision === draft.revision ? draft.validation as any : null;
            const checks = previous?.checks ?? [];
            const fixes = questionValidationFixes(checks, { starterError: verification.error });
            const failed = verification.executions.find((item) => !item.passed);
            const error = failed
              ? `Starter input/output execution failed: language ${failed.languageId}, test ${failed.index + 1}: ${failed.status}. See the results below for the required correction.`
              : `Starter input/output execution failed: ${verification.error ?? 'review the starter code'}`;
            const validation = { ...previous, reviewMode: 'direct', revision: draft.revision, passed: false, feedback: 'Direct approval was blocked. Fix the issues below, save edits, then retry. AI review was skipped.', checks,
              executionVerified: previous?.executionVerified ?? false, executions: previous?.executions ?? [], starterVerified: false, starterExecutions: verification.executions, fixes };
            await prisma.aIQuestionDraft.updateMany({ where: { id: draft.id, revision: draft.revision, status: { not: 'approved' } }, data: { validation, status: 'needs_changes', validatedRevision: draft.revision } });
            return res.status(409).json({ error, diagnostics: verification.executions.filter((item) => !item.passed), fixes });
          }
          directlyVerifiedRevision = draft.revision;
        }
      }
      const result = await prisma.$transaction(
        async (tx) => {
          const draft = await tx.aIQuestionDraft.findUnique({
            where: { id: Number(req.params.id) },
          });
          if (!draft) throw new WorkflowError('Draft not found', 404);
          if (draft.status === 'approved') return draft;
          if (
            !directApprove &&
            (draft.status !== 'validated' ||
              draft.revision !== revision ||
              draft.validatedRevision !== revision ||
              !(draft.validation as any)?.passed)
          )
            throw new WorkflowError(
              'Save and successfully validate the latest revision before approving.',
              409,
            );
          if (draft.revision !== revision) throw new WorkflowError('Draft changed. Reload before approving.', 409);
          const q = draftContentSchema.parse(draft.content);
          if (q.questionType !== 'mcq' && q.starterContractVersion === 2 && directlyVerifiedRevision !== draft.revision && (!(draft.validation as any)?.starterVerified || draft.validatedRevision !== draft.revision))
            throw new WorkflowError('Validate the starter input/output drivers for this revision before approval.', 409);
          const bank = await tx.question.findMany({
            where: { ownerInterviewId: null },
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
              ...(q.questionType === 'mcq'
                ? { settings: { options: q.options, correctOptionIds: [q.correctOptionId], multiple: false, explanation: q.solutionExplanation } }
                : {
                    testCases: { create: q.testCases },
                    starterCodes: {
                      create: q.starterCodes.length > 0
                        ? q.starterCodes.map(sc => ({ languageId: sc.languageId, languageName: sc.languageName, code: sc.code }))
                        : [{ languageId: 71, languageName: 'Python', code: q.starterCodePython || '# Write your solution here' }],
                    },
                  }),
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
