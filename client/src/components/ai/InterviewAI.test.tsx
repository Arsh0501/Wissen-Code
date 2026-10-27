import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIFollowUp, AINotes, AIEvaluation } from './InterviewAI';
it('lets the interviewer ask or dismiss a backend follow-up', async () => {
  const user = userEvent.setup();
  const onAsk = vi.fn();
  const onDismiss = vi.fn();
  const suggestion = {
    id: 'f1',
    context: 'Candidate mentioned useMemo.',
    question: 'When would useMemo make performance worse?',
    evidence: 'I use useMemo for every value.',
  };
  render(<AIFollowUp suggestion={suggestion} onAsk={onAsk} onDismiss={onDismiss} />);
  expect(screen.getByText(suggestion.question)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  expect(onAsk).toHaveBeenCalledWith(suggestion);
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(onDismiss).toHaveBeenCalledWith('f1');
});
it('supports editing, accepting and rejecting generated notes', async () => {
  const user = userEvent.setup();
  const accept = vi.fn();
  const reject = vi.fn();
  render(
    <AINotes
      note={{ id: 'n1', content: 'Explained memoization.' }}
      onAccept={accept}
      onReject={reject}
    />,
  );
  const input = screen.getByLabelText('Generated notes');
  await user.clear(input);
  await user.type(input, 'Explained trade-offs and dependencies.');
  await user.click(screen.getByRole('button', { name: 'Accept notes' }));
  expect(accept).toHaveBeenCalledWith('n1', 'Explained trade-offs and dependencies.');
  await user.click(screen.getByRole('button', { name: 'Reject notes' }));
  expect(reject).toHaveBeenCalledWith('n1');
});
it('renders skill evidence, coding observations, probes and summary without inventing evidence', () => {
  render(
    <AIEvaluation
      evaluation={{
        skills: [
          {
            skill: 'React',
            observation: 'Explains memoization',
            evidence: ['Candidate said: dependencies must be stable.'],
          },
          { skill: 'DSA', evidence: [] },
        ],
        codingObservations: ['Uses a Map for lookup'],
        areasToProbe: ['Discuss space complexity'],
        summary: 'Discussed React performance and arrays.',
      }}
    />,
  );
  expect(screen.getByText('Candidate said: dependencies must be stable.')).toBeInTheDocument();
  expect(screen.getByText('Supporting evidence has not been provided.')).toBeInTheDocument();
  expect(screen.getByText('Uses a Map for lookup')).toBeInTheDocument();
  expect(screen.getByText('Discuss space complexity')).toBeInTheDocument();
  expect(screen.getByText('Discussed React performance and arrays.')).toBeInTheDocument();
});
