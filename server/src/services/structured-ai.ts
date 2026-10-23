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
  return runAgent(name, schema, instructions, input, tools);
}
