import { createHash } from 'node:crypto';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { WorkflowError } from '../ai/structured-ai';
import { executeCode, isMockMode } from '../execution/judge0';
import { draftContentSchema } from './workflow-schemas';
import { canonicalJSON } from './studio-generation';
import { verifyStarterDrivers } from './coding-question-contract';
import type { QuestionExecution } from './question-validation-feedback';

export class ReferenceVerificationFailure extends WorkflowError {
  constructor(
    message: string,
    public revision: number,
    public executions: QuestionExecution[],
    status = 422,
  ) {
    super(message, status);
  }
}

const fingerprint = (content: unknown) =>
  createHash('sha256').update(canonicalJSON(content)).digest('hex');
export function referenceIsVerified(draft: {
  revision: number;
  content: unknown;
  referenceVerification: unknown;
}) {
  const review = draft.referenceVerification as { revision?: number; contentHash?: string } | null;
  return review?.revision === draft.revision && review.contentHash === fingerprint(draft.content);
}
const independentReviewSchema = z.object({
  revision: z.number().int().positive(),
  reviewedIndependently: z.literal(true),
  sourceNote: z.string().trim().min(10).max(1000),
  trustedCases: z
    .array(z.object({ input: z.string().max(100000), expectedOutput: z.string().max(100000) }))
    .min(2)
    .max(10)
    .refine(
      (cases) => new Set(cases.map((c) => c.input)).size === cases.length,
      'Use distinct trusted test inputs',
    ),
});
export const referenceReviewSchema = z.union([
  z.object({ revision: z.number().int().positive(), mode: z.literal('generated') }).strict(),
  independentReviewSchema,
]);
export async function verifyReferenceOutputs(
  id: number,
  raw: unknown,
  adminId: number,
  dependencies: { execute?: typeof executeCode; mockMode?: () => boolean } = {},
) {
  const input = referenceReviewSchema.parse(raw);
  const execute = dependencies.execute ?? executeCode;
  if ((dependencies.mockMode ?? isMockMode)())
    throw new WorkflowError(
      'Reference verification requires live code execution; mock results cannot establish correctness.',
      503,
    );
  const draft = await prisma.aIQuestionDraft.findUnique({ where: { id } });
  if (!draft) throw new WorkflowError('Draft not found', 404);
  if (draft.revision !== input.revision || ['approved', 'rejected'].includes(draft.status))
    throw new WorkflowError('Draft changed or is no longer in review. Reload it.', 409);
  const content = draftContentSchema.parse(draft.content);
  if (content.questionType === 'mcq')
    throw new WorkflowError('Reference verification applies to coding questions', 400);
  const wizard = 'wizardVersion' in content;
  const solution = wizard ? content.referenceSolution : null;
  if (
    wizard &&
    (!solution ||
      content.testCases.length < 10 ||
      !content.starterCodes.some((s) => s.languageId === solution.languageId))
  )
    throw new WorkflowError(
      'Complete starter code, test inputs and a saved solution before verification',
      409,
    );
  const generatedMode = 'mode' in input && input.mode === 'generated';
  if (
    generatedMode &&
    (!wizard ||
      content.testCases.length < 10 ||
      content.testCases.some((test) => !test.expectedOutput.trim()))
  )
    throw new WorkflowError(
      'Generate expected outputs for all test cases in the Test cases step before verification.',
      409,
    );
  const checks = 'trustedCases' in input ? input.trustedCases : content.testCases;
  const sourceCode = solution?.code ?? content.expectedSolutionPython;
  const languageId = solution?.languageId ?? 71;
  const run = async (stdin: string, source = sourceCode, language = languageId) => {
    let result;
    try {
      result = await execute({
        sourceCode: source,
        languageId: language,
        stdin,
        cpuTimeLimit: 5,
        memoryLimit: 256000,
      });
    } catch (error) {
      throw new WorkflowError(
        `Reference execution service is unavailable. ${(error as Error).message}`,
        503,
      );
    }
    if (result.status.id !== 3)
      throw new WorkflowError(
        `Reference execution failed: ${result.status.description}. ${[result.compile_output, result.stderr, result.message].filter(Boolean).join('\n').slice(0, 2000)}`,
        422,
      );
    const output = result.stdout ?? '';
    if (output.length > 100000)
      throw new WorkflowError(
        'Reference output is too large. Check the implementation and input format.',
        422,
      );
    return output;
  };
  const computed = [];
  const executions: QuestionExecution[] = [];
  for (const [index, test] of checks.entries()) {
    if (!generatedMode) {
      const actual = await run(test.input);
      if (actual.trim() !== test.expectedOutput.trim())
        throw new WorkflowError(
          `Trusted test ${index + 1} failed. Review the reference solution, problem specification, and independently established answer. Generated outputs were not changed.`,
          422,
        );
      continue;
    }
    let actualOutput = '',
      details = '',
      status = '',
      passed = false;
    try {
      const result = await execute({
        sourceCode,
        languageId,
        stdin: test.input,
        cpuTimeLimit: 5,
        memoryLimit: 256000,
      });
      actualOutput = (result.stdout ?? '').slice(0, 100000);
      details = [result.compile_output, result.stderr, result.message]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);
      passed =
        result.status.id === 3 &&
        (result.stdout ?? '').length <= 100000 &&
        actualOutput.trim() === test.expectedOutput.trim();
      status =
        (result.stdout ?? '').length > 100000
          ? 'Output too large'
          : result.status.id === 3
            ? passed
              ? 'Passed'
              : 'Output mismatch'
            : result.status.description;
    } catch (error) {
      status = 'Execution service unavailable';
      details = (error as Error).message.slice(0, 4000);
    }
    executions.push({
      index,
      languageId,
      stage: 'reference',
      input: test.input,
      expectedOutput: test.expectedOutput,
      actualOutput,
      passed,
      status,
      details,
      fix: '',
    });
    computed.push({ ...content.testCases[index], expectedOutput: actualOutput });
  }
  if (generatedMode) {
    const current = await prisma.aIQuestionDraft.findUnique({
      where: { id },
      select: { revision: true, status: true },
    });
    if (
      !current ||
      current.revision !== draft.revision ||
      ['approved', 'rejected'].includes(current.status)
    )
      throw new WorkflowError(
        'Draft changed while verification ran. Reload and verify again.',
        409,
      );
  }
  const failed = executions.filter((result) => !result.passed);
  if (failed.length)
    throw new ReferenceVerificationFailure(
      `Test cases ${failed.map((result) => result.index + 1).join(', ')} failed. Review actual and expected outputs below. No outputs were changed.`,
      draft.revision,
      executions,
      failed.every((result) => result.status === 'Execution service unavailable') ? 503 : 422,
    );
  if (!generatedMode)
    for (const test of content.testCases)
      computed.push({ ...test, expectedOutput: await run(test.input) });
  const updatedContent = { ...content, testCases: computed };
  try {
    if (wizard) {
      const region = (code: string) => {
        const begin = /^([ \t]*)(?:#|\/\/) BEGIN CORE LOGIC[^\n]*\n/m.exec(code);
        const end = /^[ \t]*(?:#|\/\/) END CORE LOGIC/m.exec(code);
        if (!begin || !end || end.index <= begin.index)
          throw new WorkflowError(
            'Keep BEGIN CORE LOGIC / END CORE LOGIC markers in the solution',
            422,
          );
        return { start: begin.index + begin[0].length, end: end.index, indent: begin[1] };
      };
      const original = content.starterCodes.find((s) => s.languageId === languageId)!;
      const a = region(original.code),
        b = region(sourceCode);
      const lines = sourceCode.slice(b.start, b.end).trimEnd().split('\n');
      const depth = Math.min(
        ...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length),
      );
      const body = lines.map((l) => (l.trim() ? a.indent + l.slice(depth) : '')).join('\n') + '\n';
      const filled = original.code.slice(0, a.start) + body + original.code.slice(a.end);
      for (const test of computed)
        if ((await run(test.input, filled)).trim() !== test.expectedOutput.trim())
          throw new WorkflowError(
            'Saved starter input/output handling disagrees with the reviewed solution. Fix the starter driver.',
            422,
          );
      for (const starter of content.starterCodes.filter((s) => s.languageId !== languageId))
        await run(
          content.testCases.find((t) => t.isSample)!.input,
          starter.code,
          starter.languageId,
        );
    } else {
      if (content.starterContractVersion === 2) {
        let drivers;
        try {
          drivers = await verifyStarterDrivers(updatedContent, execute);
        } catch (error) {
          throw new WorkflowError(
            `Starter driver could not be verified: ${(error as Error).message}`,
            422,
          );
        }
        if (!drivers.verified) {
          const failed = drivers.executions.find((e) => !e.passed);
          throw new WorkflowError(
            `Starter input/output driver failed verification: ${failed?.status ?? 'not verified'}. Fix it before generating expected outputs.`,
            422,
          );
        }
      }
    }
  } catch (error) {
    if (generatedMode && error instanceof WorkflowError)
      throw new ReferenceVerificationFailure(
        error.message,
        draft.revision,
        executions,
        error.status,
      );
    throw error;
  }
  const revision = draft.revision + 1;
  const review = {
    revision,
    contentHash: fingerprint(updatedContent),
    verifiedBy: adminId,
    verifiedAt: new Date().toISOString(),
    sourceNote:
      'sourceNote' in input
        ? input.sourceNote
        : 'Saved solution compared with generated input/output pairs by live execution.',
    trustedCases: checks,
    trustedTestsPassed: checks.length,
    executions,
    calculatedTests: computed.length,
    method: generatedMode ? 'generated-case-execution' : 'admin-reviewed-reference',
  };
  const updated = await prisma.aIQuestionDraft.updateMany({
    where: { id, revision: draft.revision, status: { notIn: ['approved', 'rejected'] } },
    data: {
      content: updatedContent,
      requiresReferenceReview: true,
      referenceVerification: review,
      revision,
      status: 'draft',
      validation: undefined,
      validatedRevision: null,
    },
  });
  if (!updated.count)
    throw new WorkflowError(
      'Draft changed during verification. No results were saved. Reload and try again.',
      409,
    );
  return prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id } });
}
