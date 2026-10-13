export interface QuestionGenerationParams {
  category: 'assessment' | 'interview';
  topic: string;
  difficulty: string;
  questionType: string;
  skills: string[];
  experienceLevel: string;
  context?: string; // Optional context like resume text or job description
}
