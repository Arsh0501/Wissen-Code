import { z } from 'zod';
export const questionContentSchema = z.object({
  title: z.string().min(3).max(200),
  statement: z.string().min(20).max(20000),
  inputFormat: z.string().max(5000).optional(),
  outputFormat: z.string().max(5000).optional(),
  functionSignature: z.string().max(1000).optional(),
  constraints: z.string().max(5000).optional(),
  starterContractVersion: z.literal(2).optional(),
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
  starterCodePython: z.string().default(''),
  starterCodes: z
    .array(
      z.object({
        languageId: z.number().int(),
        languageName: z.string(),
        code: z.string(),
      }),
    )
    .default([]),
  expectedSolutionPython: z.string().min(1),
  solutionExplanation: z.string().max(20000).default(''),
});
export const generatedQuestionSchema = questionContentSchema.extend({
  starterContractVersion: z.literal(2),
  inputFormat: z.string().trim().min(1).max(5000),
  outputFormat: z.string().trim().min(1).max(5000),
  functionSignature: z.string().trim().min(1).max(1000),
  constraints: z.string().trim().min(1).max(5000),
  starterCodePython: z.string().min(1),
});
export const mcqContentSchema = questionContentSchema
  .pick({
    title: true,
    statement: true,
    difficulty: true,
    topics: true,
    requiredSkills: true,
    solutionExplanation: true,
  })
  .extend({
    questionType: z.literal('mcq'),
    options: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(40),
          text: z.string().trim().min(1).max(2000),
        }),
      )
      .min(2)
      .max(6),
    correctOptionId: z.string().trim().min(1).max(40),
  })
  .superRefine((q, ctx) => {
    if (
      new Set(q.options.map((o) => o.id)).size !== q.options.length ||
      new Set(q.options.map((o) => o.text.toLowerCase())).size !== q.options.length
    )
      ctx.addIssue({ code: 'custom', message: 'Options must have unique IDs and distinct text.' });
    if (!q.options.some((o) => o.id === q.correctOptionId))
      ctx.addIssue({
        code: 'custom',
        message: 'Exactly one correct option must reference an existing option.',
      });
  });
export const draftContentSchema = z.union([questionContentSchema, mcqContentSchema]);
export const generationSchema = z.object({
  experienceLevel: z.string().trim().max(500).optional(),
  topic: z.string().trim().min(2).max(500).optional(),
  topics: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionType: z.enum(['coding', 'debugging', 'mcq']),
  count: z.number().int().min(1).max(10),
  requiredSkills: z.array(z.string().trim().min(1)).max(20).default([]),
  starterLanguages: z
    .array(
      z.object({
        id: z.union([z.literal(71), z.literal(63), z.literal(62), z.literal(54)]),
        name: z.string(),
      }),
    )
    .optional(),
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
