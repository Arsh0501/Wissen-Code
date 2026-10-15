import { z } from 'zod';
export const questionContentSchema = z.object({
  title: z.string().min(3).max(200),
  statement: z.string().min(20).max(20000),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionType: z.enum(['coding', 'debugging']),
  topics: z.array(z.string().min(1)).min(1).max(20),
  requiredSkills: z.array(z.string().min(1)).max(20),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        isSample: z.boolean(),
      }),
    )
    .min(2)
    .max(30),
  starterCodePython: z.string(),
  expectedSolutionPython: z.string().min(1),
  solutionExplanation: z.string().min(10),
});
export const generationSchema = z.object({
  experienceLevel: z.string().trim().max(500).optional(),
  topic: z.string().trim().min(2).max(500),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionType: z.enum(['coding', 'debugging']),
  count: z.number().int().min(1).max(10),
  requiredSkills: z.array(z.string().trim().min(1)).min(1).max(20),
});
export const validationSchema = z.object({
  checks: z.array(
    z.object({
      key: z.enum([
        'duplicate',
        'correctness',
        'ambiguity',
        'difficulty',
        'testCases',
        'expectedSolution',
        'edgeCases',
      ]),
      passed: z.boolean(),
      evidence: z.string().min(1),
    }),
  ),
  feedback: z.string(),
});
export const planInputSchema = z.object({
  jobRequirements: z.string().trim().min(10).max(10000),
  candidateExperience: z.string().trim().min(3).max(10000),
  requiredSkills: z.array(z.string().trim().min(1)).min(1).max(20),
  durationMinutes: z.number().int().min(5).max(240),
});
export const planSectionSchema = z.object({
  skill: z.string().min(1),
  minutes: z.number().int().min(1).max(240),
  objective: z.string().min(1),
  questions: z.array(z.string().min(1)).min(1).max(10),
  followUps: z.array(z.string()).max(10),
});
export const planSchema = z.object({
  sections: z.array(planSectionSchema).min(1).max(20),
});
export const skillRatingSchema = z.object({
  skill: z.string().min(1),
  rating: z.number().int().min(1).max(5).nullable(),
  rationale: z.string(),
});
export const observationSchema = z.object({
  skill: z.string(),
  observation: z.string().min(1),
  evidence: z
    .array(
      z.object({
        source: z.enum(['answer', 'code', 'execution', 'notes']),
        quote: z.string().min(1),
      }),
    )
    .min(1),
});
export const evaluationSchema = z.object({
  questionId: z
    .number()
    .int()
    .refine((n) => n !== 0),
  candidateAnswer: z.string().max(20000),
  candidateCode: z.string().max(50000),
  notes: z.string().max(20000),
  skills: z.array(skillRatingSchema).min(1).max(30),
  status: z.enum(['draft', 'final']),
});
export const observationResponseSchema = z.object({
  observations: z.array(observationSchema).max(30),
});
