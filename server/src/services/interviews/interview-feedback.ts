import { z } from 'zod';

export const REQUIRED_FEEDBACK_CRITERIA = {
  communication_confidence: 'Communication / confidence',
  fundamentals: 'Fundamentals',
  role_alignment: 'Role alignment',
} as const;

const text = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !value.includes('\u0000'), 'Null bytes are not allowed');

const criterionSchema = z.object({
  key: z
    .string()
    .max(100)
    .regex(/^(communication_confidence|fundamentals|role_alignment|custom_[a-zA-Z0-9_-]+)$/),
  label: text(100),
  rating: z.number().int().min(1).max(5),
  feedback: z
    .string()
    .trim()
    .max(5000)
    .refine((value) => !value.includes('\u0000'), 'Null bytes are not allowed')
    .optional()
    .default(''),
});

export const feedbackCriteriaSchema = z
  .array(criterionSchema)
  .min(3)
  .max(23)
  .superRefine((criteria, context) => {
    for (const [key, label] of Object.entries(REQUIRED_FEEDBACK_CRITERIA)) {
      if (!criteria.some((criterion) => criterion.key === key)) {
        context.addIssue({ code: 'custom', message: `${label} feedback is required.` });
      }
    }
    const keys = criteria.map((criterion) => criterion.key);
    const labels = criteria.map((criterion) => criterion.label.toLowerCase());
    if (new Set(keys).size !== keys.length || new Set(labels).size !== labels.length) {
      context.addIssue({
        code: 'custom',
        message: 'Feedback criteria must have unique names and keys.',
      });
    }
    criteria.forEach((criterion, index) => {
      const fixedLabel =
        REQUIRED_FEEDBACK_CRITERIA[criterion.key as keyof typeof REQUIRED_FEEDBACK_CRITERIA];
      if (fixedLabel && criterion.label !== fixedLabel) {
        context.addIssue({
          code: 'custom',
          path: [index, 'label'],
          message: `${fixedLabel} cannot be renamed.`,
        });
      }
    });
  });

export const criteriaFeedbackSchema = z.object({
  criteria: feedbackCriteriaSchema,
  revision: z.number().int().nonnegative(),
});

export const finalInterviewFeedbackSchema = criteriaFeedbackSchema.extend({
  finalFeedback: text(20000),
  finalRating: z.number().int().min(1).max(5),
  finalRecommendation: z.enum([
    'Strong Hire',
    'Hire',
    'Leaning Hire',
    'Leaning No Hire',
    'No Hire',
    'Strong No Hire',
  ]),
});
