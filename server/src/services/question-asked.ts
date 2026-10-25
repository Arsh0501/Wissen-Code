import { questionNoteData } from './question-feedback';

export function questionWasAsked(notes?: string, status?: string): boolean {
  const data = questionNoteData(notes ?? '');
  const conversation = data.conversation as { turns?: unknown[] } | undefined;
  return status === 'asked' || typeof data.questionAskedAt === 'string' || !!conversation?.turns?.length;
}
