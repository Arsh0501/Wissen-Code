import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionValidationFeedback from './QuestionValidationFeedback';
it('shows independent MCQ check outcomes and supporting feedback', () => {
  render(
    <QuestionValidationFeedback
      validation={{
        passed: false,
        revision: 1,
        feedback: 'Review the answer key.',
        executionVerified: false,
        executions: [],
        checks: [{ key: 'expectedSolution', passed: false, evidence: 'Two options are correct.' }],
      }}
    />,
  );
  expect(screen.getByText('expectedSolution: Needs changes')).toBeInTheDocument();
  expect(screen.getByText('Two options are correct.')).toBeInTheDocument();
});
