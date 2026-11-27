import { randomUUID } from 'node:crypto';
import prisma from '../../database/prisma';
import { z } from 'zod';
import { structuredAI, WorkflowError } from '../ai/structured-ai';
import { canonicalJSON } from './studio-generation';
import {
  asWizardContent,
  codingQuestionFields,
  codingWizardContentSchema,
  wizardLanguageId,
  wizardLanguages,
  wizardTestCase,
} from './coding-wizard-schemas';
import { validateCoreLogicStarter } from './coding-question-contract';
import {
  normalizeCodingStarter,
  CODING_STARTER_LAYOUT_INSTRUCTIONS,
} from './normalize-coding-starters';
import { referenceIsVerified } from './reference-verification';

function stripStarterComments(code: string, python: boolean) {
  let output = '',
    quote = '';
  for (let i = 0; i < code.length; i++) {
    const char = code[i],
      next = code[i + 1];
    if (quote) {
      output += char;
      if (char === '\\' && next) {
        output += next;
        i++;
      } else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      if (python && code.slice(i, i + 3) === char.repeat(3))
        throw new WorkflowError(
          'Starter code must not contain explanatory docstrings or solution hints',
          502,
        );
      quote = char;
      output += char;
      continue;
    }
    if ((python && char === '#') || (!python && char === '/' && next === '/')) {
      const end = code.indexOf('\n', i),
        stop = end === -1 ? code.length : end;
      const comment = code.slice(i, stop).trim();
      if (
        /^(?:#|\/\/) (?:BEGIN CORE LOGIC|END CORE LOGIC|TODO: implement core logic)$/.test(comment)
      )
        output += comment;
      i = stop - 1;
      continue;
    }
    if (!python && char === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) throw new WorkflowError('Starter has an unfinished comment', 502);
      output += ' ' + (code.slice(i, end + 2).match(/\n/g) ?? []).join('');
      i = end + 1;
      continue;
    }
    output += char;
  }
  return output;
}
export function cleanStarter(code: string, languageId: number, signature: string) {
  code = normalizeCodingStarter(code, languageId, signature);
  validateCoreLogicStarter(code, languageId, signature);
  const marker = languageId === 71 ? '#' : '//';
  const region = new RegExp(
    `(^[ \\t]*)${marker} BEGIN CORE LOGIC[^\\n]*\\n([\\s\\S]*?)^[ \\t]*${marker} END CORE LOGIC`,
    'm',
  );
  const match = region.exec(code)!;
  const implementation = match[2]
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*(?:#|\/\/)/.test(line))
    .join('\n')
    .trim();
  if (
    languageId !== 71 &&
    !/^(?:return\s*(?:0(?:\.0)?[fLdD]?|false|true|null|nullptr|undefined|""|''|\[\]|\{\}|new\s+[\w<> ,\[\]]+(?:\(\)|\[0\]|\{\}))?)?;?$/.test(
      implementation,
    )
  )
    throw new WorkflowError(
      'Starter core must be empty with only a type-correct placeholder return. Regenerate this language.',
      502,
    );
  const body = languageId === 71 ? 'pass' : implementation;
  code = code.replace(
    region,
    `${match[1]}${marker} BEGIN CORE LOGIC\n${match[1]}${marker} TODO: implement core logic\n${match[1]}${body}\n${match[1]}${marker} END CORE LOGIC`,
  );
  // Do not preserve generated explanatory comments or solution hints.
  code = stripStarterComments(code, languageId === 71);
  validateCoreLogicStarter(code, languageId, signature);
  return code;
}
export async function getCodingDraft(id: number) {
  const d = await prisma.aIQuestionDraft.findUnique({ where: { id } });
  if (!d) throw new WorkflowError('Coding draft not found', 404);
  if ((d.content as any).questionType === 'mcq')
    throw new WorkflowError('Use the MCQ workflow for this draft', 400);
  if (['approved', 'rejected'].includes(d.status))
    throw new WorkflowError('This draft is no longer editable', 409);
  return { ...d, content: asWizardContent(d.content) };
}
async function save(
  d: Awaited<ReturnType<typeof getCodingDraft>>,
  content: z.infer<typeof codingWizardContentSchema>,
) {
  const update = await prisma.aIQuestionDraft.updateMany({
    where: { id: d.id, revision: d.revision, status: { notIn: ['approved', 'rejected'] } },
    data: {
      content,
      revision: { increment: 1 },
      requiresReferenceReview: true,
      validatedRevision: null,
      status: 'draft',
    },
  });
  if (!update.count)
    throw new WorkflowError('Draft changed in another tab. Reload before continuing.', 409);
  return prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: d.id } });
}
export async function saveCodingStage(id: number, raw: unknown) {
  const input = z
    .object({
      revision: z.number().int().positive(),
      stage: z.enum(['question', 'starter', 'tests', 'solution']),
      data: z.unknown(),
    })
    .parse(raw);
  const d = await getCodingDraft(id);
  if (d.revision !== input.revision) throw new WorkflowError('Draft changed. Reload it.', 409);
  let c = d.content;
  if (input.stage === 'question') {
    const fields = codingQuestionFields.parse(input.data);
    if (canonicalJSON(fields) !== canonicalJSON(codingQuestionFields.parse(c)))
      c = {
        ...c,
        ...fields,
        starterCodes: [],
        starterCodePython: '',
        testCases: [],
        expectedSolutionPython: '',
        referenceSolution: null,
      };
  } else if (input.stage === 'starter') {
    const item = z
      .object({ languageId: wizardLanguageId, code: z.string().max(100000) })
      .parse(input.data);
    const code = cleanStarter(item.code, item.languageId, c.functionSignature);
    c = {
      ...c,
      starterCodes: [
        ...c.starterCodes.filter((s) => s.languageId !== item.languageId),
        {
          languageId: item.languageId,
          languageName: wizardLanguages.find((l) => l.id === item.languageId)!.name,
          code,
        },
      ],
      ...(item.languageId === 71 ? { starterCodePython: code } : {}),
    };
  } else if (input.stage === 'tests') {
    const tests = z.array(wizardTestCase).min(10).max(30).parse(input.data);
    if (!tests.some((t) => t.isSample) || !tests.some((t) => !t.isSample))
      throw new WorkflowError('Include sample and hidden cases', 400);
    if (new Set(tests.map((test) => test.input)).size !== tests.length)
      throw new WorkflowError('Use distinct test inputs', 400);
    c = { ...c, testCases: tests };
  } else {
    const solution = z
      .object({ languageId: wizardLanguageId, code: z.string().min(1).max(100000) })
      .parse(input.data);
    if (!c.starterCodes.some((s) => s.languageId === solution.languageId))
      throw new WorkflowError('Generate starter code for this language first', 400);
    c = {
      ...c,
      referenceSolution: solution,
      expectedSolutionPython: solution.languageId === 71 ? solution.code : '',
    };
  }
  return save(d, c);
}
// Idempotent stage requests: retrying a lost response never creates another draft or reruns a completed stage.
export async function generateCodingStage(
  stage: 'question' | 'starter' | 'tests' | 'solution',
  raw: unknown,
  authorId: number,
  ai = structuredAI,
) {
  const input = z
    .object({
      requestId: z.string().uuid(),
      draftId: z.number().int().positive().optional(),
      revision: z.number().int().positive().optional(),
      topic: z.string().trim().min(2).max(100).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      languageId: wizardLanguageId.optional(),
      sampleCount: z.number().int().min(1).max(29).optional(),
      hiddenCount: z.number().int().min(1).max(29).optional(),
    })
    .parse(raw);
  if (stage === 'question' && (!input.topic || !input.difficulty))
    throw new WorkflowError('Enter a topic and difficulty', 400);
  if (stage !== 'question' && (!input.draftId || !input.revision))
    throw new WorkflowError('Select a saved draft and revision', 400);
  if (['starter', 'solution'].includes(stage) && !input.languageId)
    throw new WorkflowError('Select a language', 400);
  if (
    stage === 'tests' &&
    (!input.sampleCount ||
      !input.hiddenCount ||
      input.sampleCount + input.hiddenCount < 10 ||
      input.sampleCount + input.hiddenCount > 30)
  )
    throw new WorkflowError('Choose sample and hidden counts totalling 10 to 30', 400);
  const kind = `coding-wizard-${stage}`;
  await prisma.aIJob.createMany({
    data: [{ id: input.requestId, authorId, kind, status: 'queued', input }],
    skipDuplicates: true,
  });
  const job = await prisma.aIJob.findUniqueOrThrow({ where: { id: input.requestId } });
  if (
    job.authorId !== authorId ||
    job.kind !== kind ||
    canonicalJSON(job.input) !== canonicalJSON(input)
  )
    throw new WorkflowError('Retry the original stage request unchanged', 409);
  if (job.status === 'completed')
    return prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: (job.output as any).draftId } });
  const attemptId = randomUUID();
  const claim = await prisma.aIJob.updateMany({
    where: {
      id: job.id,
      OR: [
        { status: { in: ['queued', 'failed'] } },
        { status: 'running', updatedAt: { lt: new Date(Date.now() - 15 * 60000) } },
      ],
    },
    data: { status: 'running', error: null, output: { attemptId } },
  });
  if (!claim.count)
    throw new WorkflowError('This stage is still running. Wait before retrying.', 409);
  try {
    const d = stage === 'question' ? null : await getCodingDraft(input.draftId!);
    if (d && d.revision !== input.revision)
      throw new WorkflowError('Draft changed. Reload and retry this step.', 409);
    let content = d?.content;
    if (stage === 'question') {
      const fields = codingQuestionFields.parse(
        await ai(
          'coding_wizard_question',
          codingQuestionFields,
          'Generate only an original coding problem and its precise function/input/output contract. Do not generate code, test cases, a solution, algorithm hints, complexity analysis, or solved examples. functionSignature must be a valid Python def line ending in a colon.',
          { topic: input.topic, difficulty: input.difficulty },
        ),
      );
      content = asWizardContent({
        ...fields,
        difficulty: input.difficulty,
        topics: [input.topic],
        starterCodes: [],
        testCases: [],
      });
    } else if (stage === 'starter') {
      const language = wizardLanguages.find((l) => l.id === input.languageId)!;
      const schema = z.object({ code: z.string().min(1).max(100000) });
      const response = schema.parse(
        await ai(
          'coding_wizard_starter',
          schema,
          `Generate ONLY a complete runnable ${language.name} starter for this contract. All parsing, calling the named core function, and formatting output must be implemented outside the core. The core must contain ONLY BEGIN CORE LOGIC and END CORE LOGIC comment markers, a neutral TODO, and pass (Python) or a type-correct empty/literal placeholder return. Do not include the algorithm, solution approach, strategy hints, complexity discussion, explanatory comments, or a reference solution. Java uses public class Main; C++ has main. ${CODING_STARTER_LAYOUT_INSTRUCTIONS}`,
          { question: codingQuestionFields.parse(content), language },
        ),
      );
      const code = cleanStarter(response.code, language.id, content!.functionSignature);
      content = {
        ...content!,
        starterCodes: [
          ...content!.starterCodes.filter((s) => s.languageId !== language.id),
          { languageId: language.id, languageName: language.name, code },
        ],
        ...(language.id === 71 ? { starterCodePython: code } : {}),
      };
    } else if (stage === 'tests') {
      if (!content!.starterCodes.length)
        throw new WorkflowError('Generate starter code before test cases', 409);
      const total = input.sampleCount! + input.hiddenCount!;
      const schema = z.object({
        cases: z
          .array(
            z.object({
              input: z.string().max(100000),
              expectedOutput: z.string().min(1).max(100000),
              isEdgeCase: z.boolean(),
              description: z.string().max(500),
            }),
          )
          .length(total),
      });
      const response = schema.parse(
        await ai(
          'coding_wizard_tests',
          schema,
          `Generate exactly ${total} distinct valid test cases with inputs AND exact expected stdout: first ${input.sampleCount} sample cases and then ${input.hiddenCount} hidden cases. Include relevant boundary/edge cases and label their purpose. Follow the documented constraints and the provided starter's actual stdin parser and stdout formatting. Use plain stdin text, not array literals unless the parser expects them. Derive every expected output from the problem definition and double-check boundary cases. Return plain input and output text without Markdown fences. Do not include solution code.`,
          {
            question: codingQuestionFields.parse(content),
            starter: content!.starterCodes[0],
            sampleCount: input.sampleCount,
            hiddenCount: input.hiddenCount,
          },
        ),
      );
      if (
        new Set(response.cases.map((t) => t.input)).size !== total ||
        !response.cases.some((t) => t.isEdgeCase)
      )
        throw new WorkflowError(
          'Inputs must be distinct and include relevant edge cases. Retry test generation.',
          502,
        );
      content = {
        ...content!,
        testCases: response.cases.map((t, i) => ({
          ...t,
          isSample: i < input.sampleCount!,
        })),
      };
    } else {
      const starter = content!.starterCodes.find((s) => s.languageId === input.languageId);
      if (!starter || !content!.testCases.length)
        throw new WorkflowError('Generate starter code and test cases first', 409);
      const schema = z.object({ code: z.string().min(1).max(100000) });
      const response = schema.parse(
        await ai(
          'coding_wizard_solution',
          schema,
          'Implement ONLY the core logic in this starter. Keep input/output drivers, function contract and BEGIN CORE LOGIC / END CORE LOGIC markers unchanged. Return the full executable program. Do not generate tests, outputs, prose, or alternative solutions. This is a proposed solution, not independently verified.',
          { question: codingQuestionFields.parse(content), starter },
        ),
      );
      content = {
        ...content!,
        referenceSolution: { languageId: starter.languageId, code: response.code },
        expectedSolutionPython: starter.languageId === 71 ? response.code : '',
      };
    }
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${job.id} FOR UPDATE`;
      const current = await tx.aIJob.findUniqueOrThrow({ where: { id: job.id } });
      if ((current.output as any)?.attemptId !== attemptId)
        throw new WorkflowError('A newer retry owns this stage', 409);
      let saved;
      if (d) {
        const update = await tx.aIQuestionDraft.updateMany({
          where: { id: d.id, revision: d.revision, status: { notIn: ['approved', 'rejected'] } },
          data: {
            content: content!,
            revision: { increment: 1 },
            requiresReferenceReview: true,
            status: 'draft',
            validatedRevision: null,
          },
        });
        if (!update.count)
          throw new WorkflowError(
            'Draft changed during generation; generated content was not saved',
            409,
          );
        saved = await tx.aIQuestionDraft.findUniqueOrThrow({ where: { id: d.id } });
      } else
        saved = await tx.aIQuestionDraft.create({
          data: { authorId, content: content!, requiresReferenceReview: true },
        });
      await tx.aIJob.update({
        where: { id: job.id },
        data: { status: 'completed', output: { draftId: saved.id, revision: saved.revision } },
      });
      return saved;
    });
  } catch (error) {
    await prisma.aIJob.updateMany({
      where: { id: job.id, output: { path: ['attemptId'], equals: attemptId } },
      data: { status: 'failed', error: (error as Error).message.slice(0, 2000) },
    });
    throw error;
  }
}
export async function approveCodingDraft(id: number, revision: number, adminId: number) {
  return prisma.$transaction(
    async (tx) => {
      const d = await tx.aIQuestionDraft.findUniqueOrThrow({ where: { id } });
      if (d.status === 'approved') return d;
      if (d.revision !== revision || d.status === 'rejected')
        throw new WorkflowError('Draft changed. Reload before approving', 409);
      if (!referenceIsVerified(d))
        throw new WorkflowError('Complete solution verification before approval', 409);
      const c = asWizardContent(d.content);
      if (!c.starterCodes.length || c.testCases.length < 10 || !c.referenceSolution)
        throw new WorkflowError('Complete all coding steps before approval', 409);
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const bank = await tx.question.findMany({ select: { title: true, statement: true } });
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
          questionType: 'coding',
          tags: JSON.stringify([...new Set([...c.topics, ...c.requiredSkills])]),
          testCases: {
            create: c.testCases.map(({ input, expectedOutput, isSample }) => ({
              input,
              expectedOutput,
              isSample,
            })),
          },
          starterCodes: { create: c.starterCodes },
        },
      });
      return tx.aIQuestionDraft.update({
        where: { id },
        data: { status: 'approved', questionId: q.id, approvedBy: adminId, approvedAt: new Date() },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}
