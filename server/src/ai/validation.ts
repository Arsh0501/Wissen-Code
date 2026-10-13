import prisma from '../prisma';
import { executeCode, isMockMode } from '../services/judge0';
import type { CheckStatus, GeneratedQuestion, ValidationCheck, ValidationReport } from './contract';
import { getAIProvider } from './provider';

// Similarity at or above these levels (0–1) flags a question as a possible / likely duplicate
const DUPLICATE_WARN = 0.45;
const DUPLICATE_FAIL = 0.7;

const STATUS_RANK: Record<CheckStatus, number> = { skipped: 0, pass: 0, warn: 1, fail: 2 };

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function testCaseCheck(q: GeneratedQuestion): ValidationCheck {
  if (q.type === 'mcq') {
    const issues: string[] = [];
    const ids = new Set(q.options.map((o) => o.id));
    if (q.options.length < 2) issues.push('Needs at least 2 options.');
    if (new Set(q.options.map((o) => o.text.trim().toLowerCase())).size !== q.options.length) issues.push('Two options have the same text.');
    if (!q.correctOptionIds.length) issues.push('No correct option is marked.');
    if (q.correctOptionIds.some((id) => !ids.has(id))) issues.push('A correct answer refers to an option that does not exist.');
    if (q.correctOptionIds.length === q.options.length && q.options.length > 1) issues.push('Every option is marked correct.');
    return issues.length
      ? { key: 'test_cases', status: 'fail', message: 'The answer options are not valid.', details: issues }
      : { key: 'test_cases', status: 'pass', message: `${q.options.length} distinct options with ${q.correctOptionIds.length} correct answer${q.correctOptionIds.length === 1 ? '' : 's'}.` };
  }
  const samples = q.testCases.filter((t) => t.isSample).length;
  const hidden = q.testCases.length - samples;
  const issues: string[] = [];
  const warnings: string[] = [];
  if (!q.testCases.length) issues.push('There are no test cases.');
  if (samples === 0 && q.testCases.length) issues.push('No sample test case is visible to candidates.');
  if (hidden < 2) warnings.push(`Only ${hidden} hidden test case${hidden === 1 ? '' : 's'}; hard-coded answers could pass.`);
  if (q.testCases.some((t) => !t.expectedOutput.trim())) issues.push('A test case has an empty expected output.');
  const inputs = q.testCases.map((t) => t.input.trim());
  if (new Set(inputs).size !== inputs.length) warnings.push('Two test cases have identical input.');
  if (issues.length) return { key: 'test_cases', status: 'fail', message: 'The test cases have problems.', details: [...issues, ...warnings] };
  if (warnings.length) return { key: 'test_cases', status: 'warn', message: 'The test cases could be stronger.', details: warnings };
  return { key: 'test_cases', status: 'pass', message: `${samples} sample and ${hidden} hidden test cases.` };
}

async function solutionCheck(q: GeneratedQuestion): Promise<ValidationCheck> {
  if (q.type === 'mcq') {
    return q.explanation.trim()
      ? { key: 'solution', status: 'pass', message: 'An explanation of the correct answer is provided.' }
      : { key: 'solution', status: 'warn', message: 'No explanation of the correct answer is provided.' };
  }
  if (!q.referenceSolution.trim()) {
    return { key: 'solution', status: 'warn', message: 'No reference solution, so expected outputs cannot be verified.' };
  }
  if (isMockMode()) {
    return { key: 'solution', status: 'skipped', message: 'The code runner is in mock mode, so the reference solution was not run. Set JUDGE_MODE=live to verify expected outputs.' };
  }
  const mismatches: string[] = [];
  await Promise.all(
    q.testCases.map(async (tc, i) => {
      try {
        const r = await executeCode({ sourceCode: q.referenceSolution, languageId: 71, stdin: tc.input });
        const out = (r.stdout ?? '').trim();
        if (r.status.id !== 3) mismatches.push(`Test ${i + 1}: the solution failed to run (${r.status.description}).`);
        else if (out !== tc.expectedOutput.trim()) mismatches.push(`Test ${i + 1}: expected "${tc.expectedOutput.trim().slice(0, 60)}" but the solution printed "${out.slice(0, 60)}".`);
      } catch {
        mismatches.push(`Test ${i + 1}: the code runner could not be reached.`);
      }
    })
  );
  return mismatches.length
    ? { key: 'solution', status: 'fail', message: `${mismatches.length} of ${q.testCases.length} expected outputs do not match the reference solution.`, details: mismatches }
    : { key: 'solution', status: 'pass', message: `The reference solution produces every expected output (${q.testCases.length} tests).` };
}

/**
 * Validates questions before they can be approved: duplicates, answer/test integrity and the
 * expected solution are checked deterministically here; wording, correctness, difficulty and
 * missing edge cases come from the AI provider.
 */
export async function validateQuestions(questions: GeneratedQuestion[], opts: { excludeQuestionIds?: number[] } = {}): Promise<ValidationReport[]> {
  const bank = await prisma.question.findMany({
    where: { status: { in: ['active', 'pending_review'] }, id: { notIn: opts.excludeQuestionIds ?? [] } },
    select: { id: true, title: true, statement: true },
  });
  const bankTokens = bank.map((b) => ({ ...b, tokens: tokens(`${b.title} ${b.statement}`) }));
  const provider = getAIProvider();
  const batchTokens = questions.map((q) => tokens(`${q.title} ${q.statement}`));

  return Promise.all(
    questions.map(async (q, i) => {
      // Duplicates — against the bank, then earlier questions in the same batch
      let best: { questionId: number; title: string; similarity: number } | null = null;
      for (const b of bankTokens) {
        const s = similarity(batchTokens[i], b.tokens);
        if (!best || s > best.similarity) best = { questionId: b.id, title: b.title, similarity: Math.round(s * 100) / 100 };
      }
      const batchDup = batchTokens.slice(0, i).findIndex((t) => similarity(batchTokens[i], t) >= DUPLICATE_FAIL);
      const dupCheck: ValidationCheck =
        batchDup >= 0
          ? { key: 'duplicate', status: 'fail', message: `Duplicates question ${batchDup + 1} in this batch.` }
          : best && best.similarity >= DUPLICATE_FAIL
            ? { key: 'duplicate', status: 'fail', message: `Very similar to "${best.title}" already in the bank.`, details: [`${Math.round(best.similarity * 100)}% wording overlap`] }
            : best && best.similarity >= DUPLICATE_WARN
              ? { key: 'duplicate', status: 'warn', message: `Partly overlaps with "${best.title}".`, details: [`${Math.round(best.similarity * 100)}% wording overlap`] }
              : { key: 'duplicate', status: 'pass', message: 'No similar question found in the bank.' };

      const [review, solution] = await Promise.all([provider.reviewQuestion(q), solutionCheck(q)]);

      const difficultyCheck: ValidationCheck =
        review.assessedDifficulty === q.difficulty
          ? { key: 'difficulty', status: 'pass', message: `Difficulty "${q.difficulty}" looks right.` }
          : { key: 'difficulty', status: 'warn', message: `Labelled "${q.difficulty}" but reads as "${review.assessedDifficulty}".` };

      const edgeCheck: ValidationCheck =
        q.type === 'mcq'
          ? { key: 'edge_cases', status: 'skipped', message: 'Not applicable to multiple-choice questions.' }
          : review.suggestedEdgeCases.length
            ? { key: 'edge_cases', status: 'warn', message: `${review.suggestedEdgeCases.length} edge case${review.suggestedEdgeCases.length === 1 ? '' : 's'} may be missing.`, details: review.suggestedEdgeCases.map((e) => `${e.input} — ${e.reason}`) }
            : { key: 'edge_cases', status: 'pass', message: 'Edge cases are covered.' };

      const checks: ValidationCheck[] = [
        dupCheck,
        { key: 'correctness', ...review.correctness },
        { key: 'ambiguity', ...review.ambiguity },
        difficultyCheck,
        testCaseCheck(q),
        solution,
        edgeCheck,
      ];
      const worst = checks.reduce((m, c) => (STATUS_RANK[c.status] > STATUS_RANK[m] ? c.status : m), 'pass' as CheckStatus);
      return {
        verdict: worst === 'skipped' ? 'pass' : (worst as 'pass' | 'warn' | 'fail'),
        checks,
        assessedDifficulty: review.assessedDifficulty,
        suggestedEdgeCases: review.suggestedEdgeCases,
        duplicateOf: best && best.similarity >= DUPLICATE_WARN ? best : null,
        checkedAt: new Date().toISOString(),
      };
    })
  );
}
