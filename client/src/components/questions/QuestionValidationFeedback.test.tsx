import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionValidationFeedback from './QuestionValidationFeedback';
import DirectApproveInfo from './DirectApproveInfo';

it('shows exact failing output and concrete required corrections', () => {
  render(
    <QuestionValidationFeedback
      validation={{
        passed: false,
        revision: 1,
        feedback: 'The sample answer is inconsistent.',
        executionVerified: false,
        checks: [{ key: 'testCases', passed: false, evidence: 'Sample output is inconsistent.' }],
        executions: [
          {
            index: 0,
            languageId: 71,
            stage: 'reference',
            passed: false,
            status: 'Output mismatch',
            input: '5\n1 100 1 1 1',
            expectedOutput: '4',
            actualOutput: '3',
            fix: 'Recalculate the sample path and update its expected output or reference algorithm.',
          },
        ],
        fixes: [
          {
            field: 'Test cases',
            problem: 'The stored answer disagrees with execution.',
            action: 'Check the path cost in the statement and correct the sample explanation.',
          },
        ],
      }}
    />,
  );
  expect(screen.getByText(/Reference solution.*Test 1: Output mismatch/)).toBeInTheDocument();
  expect(screen.getByText('Expected output')).toBeInTheDocument();
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getByText('Actual output')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.getByText(/Recalculate the sample path/)).toBeInTheDocument();
  expect(screen.getByText(/Check the path cost/)).toBeInTheDocument();
  expect(screen.getByText(/You can save edits as a draft/)).toBeInTheDocument();
});

it('explains direct approval operations using a keyboard accessible info icon', async () => {
  const user = userEvent.setup();
  render(<DirectApproveInfo id={68} verifiesStarters />);
  const info = screen.getByRole('button', { name: 'About Direct Approve' });
  expect(info).toHaveAttribute('aria-expanded', 'false');
  await user.click(info);
  expect(info).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('note', { name: 'Direct approval operations' })).toBeVisible();
  expect(screen.getByText(/Skips AI review/)).toBeInTheDocument();
  expect(screen.getByText(/runs every sample and hidden test/)).toBeInTheDocument();
  expect(
    screen.getByText(/Compiles\/runs other language starters on one sample/),
  ).toBeInTheDocument();
  expect(screen.getByText(/exact duplicate title or statement/)).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(info).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
