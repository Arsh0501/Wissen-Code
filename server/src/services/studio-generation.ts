import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import prisma from '../prisma';
import { structuredAI, WorkflowError } from './structured-ai';
import { generationSchema, generatedQuestionSchema, mcqContentSchema, draftContentSchema } from './workflow-schemas';
import { CORE_LOGIC_INSTRUCTIONS, prepareGeneratedQuestion } from './coding-question-contract';
import { isGeneratedSchemaError, generationErrorHint } from '../ai/generation-errors';

export function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

const transientDatabaseCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034']);
export async function retryDraftSave<T>(save: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try { return await save(); }
    catch (error) {
      if (attempt >= 2 || !transientDatabaseCodes.has((error as { code?: string }).code ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

export async function generateStudioDrafts(raw: unknown, authorId: number, ai = structuredAI) {
  const { requestId = randomUUID(), ...input } = generationSchema.extend({ requestId: z.string().uuid().optional() }).parse(raw);
  const topics = generationTopics(input);
  const kind = 'studio-question-generation';
  let job = await prisma.aIJob.findUnique({ where: { id: requestId } });
  if (!job) {
    try { job = await prisma.aIJob.create({ data: { id: requestId, authorId, kind, status: 'queued', input, output: { draftIds: [] } } }); }
    catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      job = await prisma.aIJob.findUniqueOrThrow({ where: { id: requestId } });
    }
  }
  if (job.authorId !== authorId || job.kind !== kind) throw new WorkflowError('Generation request not found.', 404);
  if (canonicalJSON(job.input) !== canonicalJSON(input)) throw new WorkflowError('Retry this request with its original generation settings.', 409);
  const output = job.output as { draftIds?: number[] } | null;
  const savedIds = output?.draftIds ?? [];
  async function savedDrafts() {
    const rows = await prisma.aIQuestionDraft.findMany({ where: { id: { in: savedIds } } });
    return savedIds.flatMap((id) => rows.filter((row) => row.id === id));
  }
  // Replaying a completed request never creates more drafts, including deleted drafts.
  if (job.status === 'completed') return savedDrafts();
  const attemptId = randomUUID();
  const claimed = await prisma.aIJob.updateMany({
    where: { id: requestId, OR: [{ status: { in: ['queued', 'failed'] } }, { status: 'running', updatedAt: { lt: new Date(Date.now() - 15 * 60000) } }] },
    data: { status: 'running', error: null, output: { draftIds: savedIds, attemptId } },
  });
  if (!claimed.count) throw new WorkflowError('This generation request is still running. Saved drafts remain in the queue; retry shortly.', 409);
  const ownsAttempt = { id: requestId, output: { path: ['attemptId'], equals: attemptId } };
  try {
    const bank = await prisma.question.findMany({ where: { ownerInterviewId: null }, select: { title: true }, take: 15, orderBy: { createdAt: 'desc' } });
    const previousTitles = [...bank.map((question) => question.title), ...(await savedDrafts()).map((draft) => (draft.content as any).title)];
    const languages = input.starterLanguages?.length ? input.starterLanguages : [{ id: 71, name: 'Python' }];
    const schema = z.object({ questions: z.array(input.questionType === 'mcq' ? mcqContentSchema : generatedQuestionSchema).length(1) });
    for (let index = savedIds.length; index < input.count; index++) {
      let prepared: z.infer<typeof draftContentSchema> | undefined;
      const assignedTopic = topics[index % topics.length];
      let previousFailure = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = schema.parse(await ai('generated_questions', schema,
            `Generate exactly one original, unambiguous question matching the requested type and difficulty. Do not generate answer explanations for any question type; set solutionExplanation to an empty string. Avoid these existing titles: ${previousTitles.slice(-15).join(', ')}. ${input.questionType === 'mcq' ? 'Generate a single-choice MCQ with 2 to 6 plausible distinct options, exactly one correctOptionId without an answer explanation. Do not generate code or test cases.' : 'Include sample and hidden edge cases, exact stdin/stdout specifications, a correct Python reference solution without a prose answer explanation. Provide starterCodes for all requested languages:'} ${input.questionType === 'mcq' ? '' : languages.map((language) => `${language.name} (${language.id})`).join(', ')}. ${input.questionType === 'mcq' ? '' : CORE_LOGIC_INSTRUCTIONS}${previousFailure ? ` The previous attempt was rejected: ${previousFailure}. Correct that issue in this attempt.` : ''}`,
            { ...input, topic: assignedTopic, topics: [assignedTopic], count: 1, requestedLanguages: input.questionType === 'mcq' ? [] : languages }));
          prepared = input.questionType === 'mcq' ? mcqContentSchema.parse(response.questions[0]) : prepareGeneratedQuestion(response.questions[0], languages);
          prepared.solutionExplanation = '';
          prepared.topics = [assignedTopic];
          if (prepared.difficulty !== input.difficulty || prepared.questionType !== input.questionType) throw new WorkflowError('Generated difficulty or question type did not match the request.', 502);
          break;
        } catch (error) {
          if (['AI_OUTPUT_LIMIT', 'AI_SCHEMA_RETRIES_EXHAUSTED'].includes((error as { code?: string }).code ?? '')) throw error;
          const status = (error as { status?: number }).status;
          if (attempt === 2 || (status && [400, 401, 403, 404, 429].includes(status) && !isGeneratedSchemaError(error))) throw error;
          previousFailure = generationErrorHint(error);
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      if (!prepared) throw new WorkflowError('Could not prepare the generated question. Retry generation.', 502);
      const draft = await retryDraftSave(() => prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${requestId} FOR UPDATE`;
        const current = await tx.aIJob.findUniqueOrThrow({ where: { id: requestId } });
        const progress = current.output as { draftIds: number[]; attemptId: string };
        if (progress.attemptId !== attemptId) throw new WorkflowError('A newer retry owns this generation request.', 409);
        if (progress.draftIds[index]) return tx.aIQuestionDraft.findUniqueOrThrow({ where: { id: progress.draftIds[index] } });
        const created = await tx.aIQuestionDraft.create({ data: { authorId, content: prepared! } });
        await tx.aIJob.update({ where: { id: requestId }, data: { output: { draftIds: [...progress.draftIds, created.id], attemptId } } });
        return created;
      }));
      savedIds.push(draft.id);
      previousTitles.push((draft.content as any).title);
    }
    await prisma.aIJob.updateMany({ where: ownsAttempt, data: { status: 'completed', error: null } });
    return savedDrafts();
  } catch (error) {
    await prisma.aIJob.updateMany({ where: ownsAttempt, data: { status: 'failed', error: (error as Error).message.slice(0, 2000) } }).catch(() => {});
    throw new WorkflowError(`Generation stopped after saving ${savedIds.length} of ${input.count} drafts. Retry generation to resume. ${(error as Error).message}`, (error as { status?: number }).status ?? 502);
  }
}

/** Total count is distributed evenly across the requested topics, preserving their order. */
export function generationTopics(input: z.infer<typeof generationSchema>): string[] {
  const values = input.topics ?? (input.topic ?? '').split(/[,;\n]/);
  const unique = new Map<string, string>();
  for (const value of values) { const topic = value.trim(); if (topic) unique.set(topic.toLowerCase(), topic); }
  const topics = [...unique.values()];
  if (!topics.length || topics.length > 20 || topics.some(topic => topic.length > 100))
    throw new WorkflowError('Enter 1 to 20 topics, each at most 100 characters.', 400);
  if (topics.length > input.count) throw new WorkflowError('Choose at least one question per topic.', 400);
  return topics;
}
