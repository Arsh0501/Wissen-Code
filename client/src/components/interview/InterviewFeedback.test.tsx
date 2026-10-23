import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewFeedback from './InterviewFeedback';
import { REQUIRED_FEEDBACK } from '../../services/interviewFeedback';

it('requires fixed criteria and supports custom criteria while the interview is ongoing', async () => {
  vi.mocked(api.request).mockImplementation(async request => ({ data: { interview: { feedbackRevision: 1, feedbackCriteria: (request.data as { criteria: unknown }).criteria } } }));
  renderWithProviders(<InterviewFeedback interview={{ id: 20, status: 'in_progress' }} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const save = screen.getByRole('button', { name: 'Save feedback criteria' });
  expect(save).toBeDisabled();
  expect(screen.queryByLabelText('Overall rating')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit final feedback' })).not.toBeInTheDocument();
  for (const { label } of REQUIRED_FEEDBACK) {
    expect(screen.queryByRole('button', { name: `Remove ${label}` })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(`${label} rating`), '4');
    expect(screen.getByLabelText(`${label} feedback`)).not.toBeRequired();
  }
  expect(save).toBeEnabled();
  await user.type(screen.getByLabelText('Additional criterion'), 'System design');
  await user.click(screen.getByRole('button', { name: 'Add criterion' }));
  expect(save).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('System design rating'), '3');
  expect(save).toBeEnabled();
  await user.click(save);
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: '/interviews/20/feedback/criteria', method: 'put', data: expect.objectContaining({ revision: 0, criteria: expect.arrayContaining([
      expect.objectContaining({ label: 'System design', rating: 3, feedback: '' }),
    ]) }),
  })));
  expect(await screen.findByText('Feedback criteria saved.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove System design' }));
  expect(screen.queryByLabelText('System design feedback')).not.toBeInTheDocument();
  expect(save).toBeEnabled();
});

it('blocks final submission until required criteria are filled after the interview ends', async () => {
  renderWithProviders(<InterviewFeedback interview={{ id: 20, status: 'completed' }} openFinal />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Overall rating'), '4');
  await user.selectOptions(screen.getByLabelText('Recommendation'), 'Hire');
  await user.type(screen.getByRole('textbox', { name: 'Final interview feedback' }), 'Overall summary.');
  expect(screen.getByRole('button', { name: 'Submit final feedback' })).toBeDisabled();
  await user.type(screen.getByLabelText('Additional criterion'), 'fundamentals');
  await user.click(screen.getByRole('button', { name: 'Add criterion' }));
  expect(screen.getByRole('alert')).toHaveTextContent('already exists');
});
