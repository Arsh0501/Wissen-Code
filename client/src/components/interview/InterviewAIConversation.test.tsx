import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterviewAIConversation from './InterviewAIConversation';

it('keeps activity newest first with short previews and expandable evidence', async () => {
  const user = userEvent.setup();
  const question = 'How would you protect a booking against concurrent updates? '.repeat(8);
  render(
    <InterviewAIConversation
      status="in_progress"
      onReview={vi.fn()}
      results={{
        followUps: [
          {
            id: 'f',
            context: 'Candidate discussed locking.',
            question,
            evidence: 'event:483: row locking',
            createdAt: '2026-10-19T10:02:00Z',
            trigger: { mode: 'automatic', eventId: 483, eventType: 'ANSWER_UPDATED' },
          },
        ],
        notes: [
          {
            id: 'n',
            content: 'Used transactions',
            body: 'Used transactions',
            createdAt: '2026-10-19T10:01:00Z',
            trigger: { mode: 'manual', eventId: 482, eventType: 'CODE_SUBMITTED' },
          },
        ],
      }}
    />,
  );
  const feed = screen.getByRole('region', { name: 'AI activity feed' });
  const messages = within(feed).getAllByRole('article');
  expect(within(messages[0]).getByText('AI follow-up')).toBeInTheDocument();
  expect(within(messages[1]).getByText('AI note')).toBeInTheDocument();
  expect(screen.getByText(/After answer updated #483/)).toBeInTheDocument();
  expect(screen.getByText(/Requested after code submitted #482/)).toBeInTheDocument();
  const details = messages[0].querySelector('details')!;
  expect(details.open).toBe(false);
  expect(details.querySelector('summary')!.textContent!.length).toBeLessThan(200);
  await user.click(details.querySelector('summary')!);
  expect(details.open).toBe(true);
  expect(screen.getByText('event:483: row locking')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Expand panel' }));
  expect(screen.getByRole('button', { name: 'Compact panel' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

it('lets the interviewer edit and accept a note without accepting raw evidence text', async () => {
  const user = userEvent.setup();
  const onReview = vi.fn().mockResolvedValue({});
  const note = {
    id: 'n',
    jobId: 'job',
    content: 'technicalNotes: Original\nevent:12: evidence',
    body: 'Original',
    evidence: 'event:12: evidence',
  };
  render(
    <InterviewAIConversation
      status="completed"
      onReview={onReview}
      results={{ followUps: [], notes: [note] }}
    />,
  );
  await user.click(screen.getByRole('article').querySelector('summary')!);
  const textarea = screen.getByRole('textbox', { name: 'Generated notes' });
  await user.clear(textarea);
  await user.type(textarea, 'Reviewed note');
  await user.click(screen.getByRole('button', { name: 'Accept notes' }));
  expect(onReview).toHaveBeenCalledWith(note, 'accept', 'Reviewed note');
});

it('does not offer follow-up actions after completion or note actions after cancellation', () => {
  const results = {
    followUps: [{ id: 'f', context: 'Context', question: 'Question' }],
    notes: [{ id: 'n', content: 'Note' }],
  };
  const { rerender } = render(
    <InterviewAIConversation results={results} status="completed" onReview={vi.fn()} />,
  );
  expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept notes' })).toBeInTheDocument();
  rerender(<InterviewAIConversation results={results} status="cancelled" onReview={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Accept notes' })).not.toBeInTheDocument();
});
