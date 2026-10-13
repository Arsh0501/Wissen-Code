import { z } from 'zod';

export const ValidationResultSchema = z.object({
  isValid: z.boolean().describe("Whether the question passes all validation checks"),
  feedback: z.string().describe("Detailed feedback on what needs to be fixed if invalid, or praise if valid"),
  checks: z.object({
    correctness: z.boolean(),
    difficulty: z.boolean(),
    duplicate: z.boolean(),
    ambiguity: z.boolean(),
    testCases: z.boolean(),
    expectedSolution: z.boolean(),
    edgeCases: z.boolean()
  })
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;
