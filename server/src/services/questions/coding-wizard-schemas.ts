import { z } from 'zod';
export const codingQuestionFields = z.object({
  title: z.string().trim().min(3).max(200),
  statement: z.string().trim().min(20).max(20000),
  inputFormat: z.string().trim().min(1).max(5000),
  outputFormat: z.string().trim().min(1).max(5000),
  constraints: z.string().trim().min(1).max(5000),
  functionSignature: z.string().regex(/^def [A-Za-z_]\w*\([^\n]*\)\s*(?:->[^:\n]+)?:$/),
});
export const wizardLanguages = [
  { id: 71, name: 'Python' },
  { id: 63, name: 'JavaScript' },
  { id: 62, name: 'Java' },
  { id: 54, name: 'C++' },
] as const;
export const wizardLanguageId = z.union([
  z.literal(71),
  z.literal(63),
  z.literal(62),
  z.literal(54),
]);
export const wizardTestCase = z.object({
  input: z.string().max(100000),
  expectedOutput: z.string().max(100000),
  isSample: z.boolean(),
  isEdgeCase: z.boolean().default(false),
  description: z.string().max(500).default(''),
});
export const codingWizardContentSchema = codingQuestionFields.extend({
  functionSignature: z.string().max(1000),
  wizardVersion: z.literal(1),
  questionType: z.literal('coding'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topics: z.array(z.string()).default([]),
  requiredSkills: z.array(z.string()).default([]),
  starterContractVersion: z.literal(2),
  starterCodePython: z.string().default(''),
  starterCodes: z
    .array(
      z.object({
        languageId: wizardLanguageId,
        languageName: z.string(),
        code: z.string().max(100000),
      }),
    )
    .default([]),
  testCases: z.array(wizardTestCase).max(30).default([]),
  expectedSolutionPython: z.string().default(''),
  solutionExplanation: z.string().default(''),
  referenceSolution: z
    .object({ languageId: wizardLanguageId, code: z.string().max(100000) })
    .nullable()
    .default(null),
});
export function asWizardContent(raw: unknown) {
  const c = raw as Record<string, unknown>;
  return codingWizardContentSchema.parse({
    ...c,
    wizardVersion: 1,
    questionType: 'coding',
    starterContractVersion: 2,
    inputFormat: c.inputFormat || 'Review and specify the input format.',
    outputFormat: c.outputFormat || 'Review and specify the output format.',
    constraints: c.constraints || 'Review and specify the constraints.',
    functionSignature: c.functionSignature || 'def solve(n: int) -> int:',
    referenceSolution:
      c.referenceSolution ??
      (c.expectedSolutionPython ? { languageId: 71, code: c.expectedSolutionPython } : null),
  });
}
