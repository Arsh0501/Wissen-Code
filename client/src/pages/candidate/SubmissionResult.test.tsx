import { it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import * as services from '../../services/api';
import SubmissionResult from './SubmissionResult';
import { renderWithProviders, candidateUser } from '../../test/test-utils';
it('does not confirm a submission when results fail and supports retry', async () => {
  const get = vi
    .spyOn(services, 'getSubmissionResults')
    .mockRejectedValueOnce({
      response: { data: { error: 'Results still processing' } },
    })
    .mockResolvedValueOnce({
      resultsHidden: true,
      evaluation: {
        assessment: { name: 'Candidate test' },
        candidateName: candidateUser.name,
      },
    } as any);
  renderWithProviders(
    <Routes>
      <Route path="/exam/:assessmentId/result" element={<SubmissionResult />} />
    </Routes>,
    { loggedInAs: candidateUser, initialEntries: ['/exam/1/result'] },
  );
  expect(await screen.findByText('Results unavailable')).toBeInTheDocument();
  expect(screen.queryByText('Your test has been submitted successfully.')).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Refresh Results' }));
  expect(await screen.findByText('Candidate test')).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

it('shows queued grading without presenting a zero score', async () => {
  vi.spyOn(services, 'getSubmissionResults').mockResolvedValue({
    resultsPending: true,
    sessionId: 3,
    evaluation: { assessment: { name: 'Queued assessment' } },
  } as any);
  renderWithProviders(
    <Routes>
      <Route path="/exam/:assessmentId/result" element={<SubmissionResult />} />
    </Routes>,
    { loggedInAs: candidateUser, initialEntries: ['/exam/1/result'] },
  );
  expect(await screen.findByText('Your answers have been received')).toBeInTheDocument();
  expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
});

it('retries failed grading using the saved attempt', async () => {
  const get = vi
    .spyOn(services, 'getSubmissionResults')
    .mockResolvedValueOnce({
      resultsPending: true,
      gradingFailed: true,
      sessionId: 3,
      evaluation: { assessment: { name: 'Retry assessment' } },
    } as any)
    .mockResolvedValue({
      resultsPending: true,
      sessionId: 3,
      evaluation: { assessment: { name: 'Retry assessment' } },
    } as any);
  const finish = vi.spyOn(services, 'finishSession').mockResolvedValue({} as any);
  renderWithProviders(
    <Routes>
      <Route path="/exam/:assessmentId/result" element={<SubmissionResult />} />
    </Routes>,
    { loggedInAs: candidateUser, initialEntries: ['/exam/1/result'] },
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Retry grading' }));
  expect(finish).toHaveBeenCalledWith(3);
  expect(await screen.findByText('Your answers have been received')).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});
