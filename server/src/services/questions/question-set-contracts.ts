import { z } from 'zod';

function requiredText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !value.includes('\u0000'), 'Null bytes are not allowed');
}

export const setItemSchema = z.object({
  title: requiredText(500),
  statement: requiredText(20000),
  answer: z
    .string()
    .trim()
    .max(20000)
    .refine((value) => !value.includes('\u0000'), 'Null bytes are not allowed')
    .nullable()
    .default(null),
  source: z.enum(['manual', 'ai']).default('manual'),
});

export const setSchema = z.object({
  title: requiredText(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !value.includes('\u0000'), 'Null bytes are not allowed')
    .default(''),
  questions: z
    .array(
      setItemSchema.extend({
        id: z.number().int().positive().optional(),
      }),
    )
    .max(200),
  revision: z.number().int().positive().optional(),
});

export const generationSchema = z.object({
  topics: requiredText(2000),
  description: z
    .string()
    .trim()
    .max(4000)
    .refine((value) => !value.includes('\u0000'), 'Null bytes are not allowed')
    .optional(),
  count: z.number().int().min(1).max(10),
  includeAnswers: z.boolean(),
  answerDetail: z.enum(['brief', 'standard', 'detailed']),
});

export type QuestionSetGenerationInput = z.infer<typeof generationSchema>;
export type QuestionSetDraft = z.infer<typeof setItemSchema>;
