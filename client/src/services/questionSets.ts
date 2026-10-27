export interface SetQuestion {
  id?: number;
  title: string;
  statement: string;
  answer: string | null;
  source: 'manual' | 'ai';
}
export interface QuestionSet {
  id: number;
  title: string;
  description: string;
  revision: number;
  questions: SetQuestion[];
  _count?: { questions: number };
}
export const emptySetQuestion = (): SetQuestion => ({
  title: '',
  statement: '',
  answer: null,
  source: 'manual',
});
