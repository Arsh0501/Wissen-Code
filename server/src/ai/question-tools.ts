import { z } from 'zod';
import prisma from '../database/prisma';
import { AgentTool } from './gateway';
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function questionTools(_authorId: number): AgentTool[] {
  return [
    {
      name: 'searchQuestionBank',
      description: 'Search existing question titles and statements before generating questions.',
      schema: z.object({ query: z.string().max(300) }),
      execute: async ({ query }) =>
        prisma.question.findMany({
          where: {
            ownerInterviewId: null,
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
          where: { ownerInterviewId: null },
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
  ];
}
