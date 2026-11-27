import { beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import AIQuestions from './AIQuestions';
vi.mock('../../components/editor/CodeEditor', () => ({
  default: ({ value, onChange, options }: any) => (
    <textarea
      aria-label="Code editor"
      value={value}
      readOnly={options.readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
beforeEach(() => sessionStorage.clear());
const starter =
  'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO: implement core logic\n    pass\n    # END CORE LOGIC\nprint(solve(int(input())))';
const initial = {
  id: 10,
  revision: 1,
  status: 'draft',
  requiresReferenceReview: true,
  referenceVerified: false,
  questionId: null,
  content: {
    wizardVersion: 1,
    title: 'Integer identity',
    statement: 'Return the input integer unchanged using the core function.',
    inputFormat: 'One integer',
    outputFormat: 'One integer',
    constraints: '-5 <= n <= 4',
    functionSignature: 'def solve(n: int) -> int:',
    difficulty: 'easy',
    questionType: 'coding',
    topics: ['integers'],
    requiredSkills: [],
    starterContractVersion: 2,
    starterCodePython: '',
    starterCodes: [] as any[],
    testCases: [] as any[],
    referenceSolution: null as any,
    expectedSolutionPython: '',
    solutionExplanation: '',
  },
};
it('shows one coding step at a time and completes staged generation, execution verification, and approval', async () => {
  let d: any = null;
  const calls: any[] = [];
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url === '/ai/drafts') return { data: d ? [d] : [] };
    calls.push(config);
    if (config.url === '/ai/coding/generate-question') {
      d = structuredClone(initial);
      return { data: d };
    }
    if (config.url === '/ai/coding/generate-starter') {
      const l = config.data.languageId;
      d = {
        ...d,
        revision: d.revision + 1,
        content: {
          ...d.content,
          starterCodePython: starter,
          starterCodes: [
            ...d.content.starterCodes,
            { languageId: l, languageName: l === 71 ? 'Python' : 'JavaScript', code: starter },
          ],
        },
      };
      return { data: d };
    }
    if (config.url === '/ai/coding/generate-tests') {
      d = {
        ...d,
        revision: d.revision + 1,
        content: {
          ...d.content,
          testCases: Array.from({ length: 10 }, (_, i) => ({
            input: String(i - 5),
            expectedOutput: String(i - 5),
            isSample: i < config.data.sampleCount,
            isEdgeCase: i === 0,
            description: 'Valid integer',
          })),
        },
      };
      return { data: d };
    }
    if (config.url === '/ai/coding/generate-solution') {
      d = {
        ...d,
        revision: d.revision + 1,
        content: {
          ...d.content,
          referenceSolution: {
            languageId: config.data.languageId,
            code: starter.replace('pass', 'return n'),
          },
        },
      };
      return { data: d };
    }
    if (config.url === '/ai/drafts/10/verify-reference') {
      d = {
        ...d,
        revision: d.revision + 1,
        referenceVerified: true,
        referenceVerification: {
          trustedTestsPassed: 2,
          calculatedTests: 10,
          sourceNote: config.data.sourceNote,
        },
        content: {
          ...d.content,
          testCases: d.content.testCases.map((t: any) => ({ ...t, expectedOutput: t.input })),
        },
      };
      return { data: d };
    }
    if (config.url === '/ai/drafts/10/test-solution')
      return {
        data: {
          total: 10,
          passed: 10,
          results: d.content.testCases.map((t: any, index: number) => ({
            index,
            passed: true,
            status: 'Accepted',
            actualOutput: t.input,
          })),
        },
      };
    if (config.url === '/ai/coding/10/approve') {
      d = { ...d, status: 'approved', questionId: 22 };
      return { data: d };
    }
    throw new Error('Unexpected path ' + config.url);
  });
  const user = userEvent.setup();
  renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
  expect(screen.queryByText('Validate through AI')).not.toBeInTheDocument();
  expect(screen.queryByText('Starter code languages')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Topic'), 'Integer identity');
  await user.click(screen.getByRole('button', { name: 'Generate question' }));
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Integer identity'));
  await user.click(screen.getByRole('button', { name: 'Collapse Title' }));
  expect(screen.getByLabelText('Title')).not.toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Expand Title' }));
  expect(screen.getByLabelText('Title')).toHaveValue('Integer identity');
  await user.click(screen.getByRole('button', { name: 'Collapse saved drafts' }));
  expect(screen.queryByText('Saved coding drafts')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue('Integer identity');
  await user.click(screen.getByRole('button', { name: 'Expand saved drafts' }));
  expect(screen.getByText('Saved coding drafts')).toBeInTheDocument();
  expect(screen.queryByLabelText('Hidden cases')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByLabelText('JavaScript'));
  await user.click(screen.getByRole('button', { name: 'Generate selected starters' }));
  await waitFor(() =>
    expect(calls.filter((c) => c.url === '/ai/coding/generate-starter')).toHaveLength(2),
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByLabelText('Sample / non-hidden cases')).toHaveValue(2);
  expect(screen.getByLabelText('Hidden cases')).toHaveValue(8);
  await user.click(screen.getByRole('button', { name: 'Generate test cases' }));
  await waitFor(() => expect(screen.getByText(/Test 10/)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('textbox', { name: 'Code editor' })).toHaveValue(starter);
  await user.click(screen.getByRole('button', { name: 'Generate solution with AI' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Code editor' })).toHaveValue(
      starter.replace('pass', 'return n'),
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Verify solution against test cases' }));
  await user.click(screen.getByRole('button', { name: 'Solution test runner' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Test solution' })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole('button', { name: 'Run all test cases' }));
  await waitFor(() => expect(screen.getByText('10 / 10 passed, 0 failed')).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Approve into Question Bank' }));
  await waitFor(() =>
    expect(screen.getByText('Question approved into the Question Bank.')).toBeInTheDocument(),
  );
  expect(calls.some((c) => /\/validate$/.test(c.url))).toBe(false);
  expect(calls.find((c) => c.url === '/ai/coding/generate-question').data).not.toHaveProperty(
    'starterLanguages',
  );
});
it('retains a completed starter and retries only the failed language with the original request ID', async () => {
  let d: any = structuredClone(initial);
  let fail = true;
  const requests: any[] = [];
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url === '/ai/drafts') return { data: [d] };
    if (config.url === '/ai/coding/generate-starter') {
      requests.push(config.data);
      if (config.data.languageId === 63 && fail) throw new Error('Language service unavailable');
      d = {
        ...d,
        revision: d.revision + 1,
        content: {
          ...d.content,
          starterCodePython: starter,
          starterCodes: [
            ...d.content.starterCodes,
            {
              languageId: config.data.languageId,
              languageName: config.data.languageId === 71 ? 'Python' : 'JavaScript',
              code: starter,
            },
          ],
        },
      };
      return { data: d };
    }
    throw new Error(config.url);
  });
  const user = userEvent.setup();
  renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
  await user.click(await screen.findByRole('button', { name: 'Integer identity' }));
  await user.click(screen.getByLabelText('JavaScript'));
  await user.click(screen.getByRole('button', { name: 'Generate selected starters' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Language service unavailable');
  expect(screen.getByText('Saved')).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Retry request' }));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[0].languageId).toBe(71);
  expect(requests[1].requestId).toBe(requests[2].requestId);
  expect(requests.filter((r) => r.languageId === 71)).toHaveLength(1);
});
it('keeps MCQ generation separate from the coding wizard', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data: config.url === '/ai/status' ? { configured: true, canVerify: true } : [],
  }));
  const user = userEvent.setup();
  renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
  await user.click(screen.getByRole('tab', { name: 'MCQ' }));
  expect(await screen.findByLabelText('Topics (comma separated)')).toBeInTheDocument();
  expect(screen.queryByLabelText('Coding question steps')).not.toBeInTheDocument();
});
