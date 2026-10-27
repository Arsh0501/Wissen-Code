import type { Prisma } from '@prisma/client';
import { questionNoteData } from './question-feedback';

export interface CurrentSubquestion {
  id: string;
  question: string;
  askedAt: string;
  parentId: string | null;
}

export function currentSubquestion(notes?: string): CurrentSubquestion | null {
  const value = questionNoteData(notes ?? '').currentSubquestion as
    | Partial<CurrentSubquestion>
    | undefined;
  return value &&
    typeof value.id === 'string' &&
    typeof value.question === 'string' &&
    typeof value.askedAt === 'string'
    ? {
        id: value.id,
        question: value.question,
        askedAt: value.askedAt,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
      }
    : null;
}

// Call while holding the interview row lock so feedback/transcript notes are preserved.
export async function setCurrentSubquestion(
  tx: Prisma.TransactionClient,
  interviewId: number,
  questionId: number,
  item: { id: string; question: string } | null,
) {
  const link = await tx.interviewQuestion.findUniqueOrThrow({
    where: { interviewId_questionId: { interviewId, questionId } },
  });
  const notes = questionNoteData(link.notes);
  notes.currentSubquestion = item
    ? {
        ...item,
        askedAt: new Date().toISOString(),
        parentId: currentSubquestion(link.notes)?.id ?? null,
      }
    : null;
  await tx.interviewQuestion.update({
    where: { id: link.id },
    data: { notes: JSON.stringify(notes) },
  });
}
