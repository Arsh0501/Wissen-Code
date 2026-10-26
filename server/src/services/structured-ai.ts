import { z } from 'zod';

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function structuredAI<T extends z.ZodType>(
  name: string,
  schema: T,
  instructions: string,
  input: unknown,
): Promise<z.infer<T>> {
  const { runAgent } = await import('../ai/gateway');
  const actorId = (input as any)?._authorId;
  const tools =
    name === 'generated_questions' && Number.isInteger(actorId)
      ? (await import('../ai/question-tools'))
          .questionTools(actorId)
          .filter((t) => t.name !== 'saveDraftQuestion')
      : [];
  try {
    return await runAgent(name, schema, instructions, input, tools);
  } catch (error: any) {
    const status = Number(error?.status);
    if (status >= 400 && status < 500 && status !== 503) {
      const detail = error?.error?.message || error?.message || 'request rejected';
      const hint =
        status === 401
          ? 'Check OPENAI_API_KEY.'
          : status === 429
            ? 'Rate limit or quota reached. Wait a minute and retry.'
            : status === 413
              ? 'Request too large for this model.'
              : '';
      throw new WorkflowError(`AI provider error: ${detail} ${hint}`.trim(), 502);
    }
    throw error;
  }
}
