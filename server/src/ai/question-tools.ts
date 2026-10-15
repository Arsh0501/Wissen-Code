import { z } from 'zod';
import prisma from '../prisma';
import { AgentTool } from './gateway';
import { questionContentSchema } from '../services/workflow-schemas';
import { executeCode, isMockMode } from '../services/judge0';
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function questionTools(
  authorId: number,
  dependencies: {
    execute?: typeof executeCode;
    mockMode?: typeof isMockMode;
  } = {},
): AgentTool[] {
  const execute = dependencies.execute ?? executeCode;
  const mockMode = dependencies.mockMode ?? isMockMode;
  return [
    {
      name: 'searchQuestionBank',
      description:
        'Search existing question titles and statements before generating questions.',
      schema: z.object({ query: z.string().max(300) }),
      execute: async ({ query }) =>
        prisma.question.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { statement: { contains: query, mode: 'insensitive' } },
            ],
          },
          select: { id: true, title: true, statement: true, difficulty: true },
          take: 20,
        }),
    },
    {
      name: 'checkDuplicate',
      description:
        'Check normalized exact title or statement duplicates in the question bank and pending drafts.',
      schema: z.object({ title: z.string(), statement: z.string() }),
      execute: async ({ title, statement }) => {
        const bank = await prisma.question.findMany({
          select: { id: true, title: true, statement: true },
        });
        const drafts = await prisma.aIQuestionDraft.findMany({
          where: { status: { not: 'approved' } },
          select: { id: true, content: true },
        });
        return {
          bankIds: bank
            .filter(
              (q) =>
                normalize(q.title) === normalize(title) ||
                normalize(q.statement) === normalize(statement),
            )
            .map((q) => q.id),
          draftIds: drafts
            .filter((d) => {
              const q = d.content as any;
              return (
                normalize(q.title) === normalize(title) ||
                normalize(q.statement) === normalize(statement)
              );
            })
            .map((d) => d.id),
        };
      },
    },
    {
      name: 'validateQuestion',
      description:
        'Validate question structure and verify its reference solution against all test cases with the real compiler.',
      schema: z.object({ question: questionContentSchema }),
      execute: async ({ question }) => {
        const q = questionContentSchema.parse(question);
        if (mockMode())
          return {
            verified: false,
            reason:
              'Real compiler required; mock verdicts cannot validate correctness',
          };
        const results = [];
        for (const t of q.testCases)
          results.push(
            await execute({
              sourceCode: q.expectedSolutionPython,
              languageId: 71,
              stdin: t.input,
              expectedOutput: t.expectedOutput,
            }),
          );
        return {
          verified: results.every(
            (r, i) =>
              r.status.id === 3 &&
              (r.stdout ?? '').trim() === q.testCases[i].expectedOutput.trim(),
          ),
          results,
        };
      },
    },
    {
      name: 'generateTestCases',
      description:
        'Execute a reference solution on proposed edge case inputs to obtain actual expected outputs.',
      schema: z.object({
        solution: z.string().max(50000),
        inputs: z.array(z.string().max(10000)).min(1).max(10),
      }),
      execute: async ({ solution, inputs }) => {
        if (mockMode())
          return { verified: false, reason: 'Real compiler required' };
        const results = [];
        for (const input of inputs) {
          const result = await execute({
            sourceCode: solution,
            languageId: 71,
            stdin: input,
          });
          results.push({ input, output: result.stdout, status: result.status });
        }
        return results;
      },
    },
    {
      name: 'saveDraftQuestion',
      description:
        'Save a question as a draft requiring validation and human approval. Never publishes to the active bank.',
      schema: z.object({ question: questionContentSchema }),
      execute: async ({ question }) => {
        const content = questionContentSchema.parse(question);
        // Repeated tool calls and queue retries return the existing identical draft.
        const existing = await prisma.aIQuestionDraft.findFirst({
          where: { authorId, content: { equals: content } },
        });
        return (
          existing ??
          prisma.aIQuestionDraft.create({ data: { authorId, content } })
        );
      },
    },
  ];
}
