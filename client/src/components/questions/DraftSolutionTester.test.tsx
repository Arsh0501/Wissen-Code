import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import DraftSolutionTester from './DraftSolutionTester';
import type { QuestionContent } from '../../services/workflows';
vi.mock('../editor/CodeEditor', () => ({
  default: ({ value, onChange, options }: any) => (
    <textarea
      aria-label="Test solution code"
      value={value}
      readOnly={options.readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
const content: QuestionContent = {
  title: 'Add',
  statement: 'Return the given integer',
  difficulty: 'easy',
  questionType: 'coding',
  topics: [],
  requiredSkills: [],
  starterContractVersion: 2,
  starterCodePython: 'def solve(n):\n    return 0\nprint(solve(int(input())))',
  expectedSolutionPython: 'def solve(n):\n    return n\nprint(solve(int(input())))',
  solutionExplanation: '',
  testCases: [
    { input: '1', expectedOutput: '1', isSample: true },
    {
      input: '0',
      expectedOutput: '0',
      isSample: false,
      isEdgeCase: true,
      description: 'Zero boundary',
    },
  ],
};
it('runs reviewer code, shows pass/fail and errors, and clears stale results when code changes', async () => {
  vi.mocked(api.request).mockResolvedValue({
    data: {
      revision: 1,
      total: 2,
      passed: 1,
      results: [
        { index: 0, passed: true, status: 'Accepted', actualOutput: '1' },
        {
          index: 1,
          passed: false,
          status: 'Compilation Error',
          actualOutput: '',
          details: 'Missing return',
        },
      ],
    },
  });
  const user = userEvent.setup();
  renderWithProviders(
    <DraftSolutionTester
      draftId={5}
      revision={1}
      content={content}
      dirty={false}
      disabled={false}
    />,
    { loggedInAs: adminUser },
  );
  expect(screen.queryByText(/Implement only the marked core logic/)).not.toBeInTheDocument();
  await user.clear(screen.getByRole('textbox', { name: 'Test solution code' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Test solution code' }),
    content.expectedSolutionPython,
  );
  await user.click(screen.getByRole('button', { name: 'Run all test cases' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('1 / 2 passed, 1 failed'),
  );
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/ai/drafts/5/test-solution',
      data: { revision: 1, languageId: 71, sourceCode: content.expectedSolutionPython },
    }),
  );
  expect(screen.getByText('Passed')).toBeInTheDocument();
  expect(screen.getByText('Compilation Error')).toBeInTheDocument();
  await user.click(screen.getByText('Test 2'));
  expect(screen.getByText('Missing return')).toBeVisible();
  expect(screen.getByText('Edge case')).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'Test solution code' }), '# edited');
  expect(screen.queryByText('Passed')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Not run');
});
it('requires saving changed question cases before running', () => {
  renderWithProviders(
    <DraftSolutionTester draftId={5} revision={1} content={content} dirty disabled={false} />,
    { loggedInAs: adminUser },
  );
  expect(screen.getByRole('button', { name: 'Run all test cases' })).toBeDisabled();
  expect(screen.getByText(/Save question edits/)).toBeInTheDocument();
});
