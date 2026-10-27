import { afterEach, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewFeedback from './InterviewFeedback';
import InterviewFeedbackReportDownload from './InterviewFeedbackReportDownload';
import { REQUIRED_FEEDBACK } from '../../services/interviewFeedback';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ready = {
  status: 'ready',
  feedbackRevision: 1,
  generatedAt: new Date().toISOString(),
  error: null,
  downloadUrl: '/interviews/20/feedback/report/download',
};

function mockDownload() {
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:feedback-report');
      static revokeObjectURL = vi.fn();
    },
  );
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url.endsWith('/download')
      ? new Blob(['%PDF-1.4 fixture'], { type: 'application/pdf' })
      : { user: adminUser },
  }));
  return clicked;
}

it('shows a download button on a completed interview while explaining missing final feedback', () => {
  renderWithProviders(
    <InterviewFeedbackReportDownload interviewId={20} submitted={false} completed compact />,
    { loggedInAs: adminUser },
  );
  expect(screen.getByRole('button', { name: 'Download PDF report' })).toBeDisabled();
  expect(screen.getByText('Awaiting final feedback')).toBeVisible();
  expect(api.request).not.toHaveBeenCalled();
});

it('generates an older completed interview report from the dashboard download button', async () => {
  const clicked = mockDownload();
  vi.mocked(api.request).mockImplementation(async (request) => ({
    data: request.method === 'post' ? ready : null,
  }));
  renderWithProviders(
    <InterviewFeedbackReportDownload interviewId={20} submitted completed compact />,
    { loggedInAs: adminUser },
  );
  expect(api.request).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Download PDF report' }));
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/interviews/20/feedback/report', method: 'post' }),
  );
});

it('automatically downloads the generated PDF after final feedback succeeds', async () => {
  const clicked = mockDownload();
  vi.mocked(api.request).mockImplementation(async (request) => ({
    data: request.method === 'post' ? { interview: { feedbackRevision: 1 }, report: ready } : ready,
  }));
  renderWithProviders(
    <InterviewFeedback
      interview={{
        id: 20,
        status: 'completed',
        feedbackCriteria: REQUIRED_FEEDBACK.map((criterion) => ({
          ...criterion,
          rating: 4,
          feedback: '',
        })),
      }}
      openFinal
    />,
    { loggedInAs: adminUser },
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Overall rating'), '4');
  await user.selectOptions(screen.getByLabelText('Recommendation'), 'Hire');
  await user.type(
    screen.getByRole('textbox', { name: 'Final interview feedback' }),
    'Good fundamentals.',
  );
  await user.click(screen.getByRole('button', { name: 'Submit final feedback' }));
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/interviews/20/feedback/report/download', {
      responseType: 'blob',
    }),
  );
  expect(clicked).toHaveBeenCalledOnce();
  expect(await screen.findByText('Feedback saved successfully.')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Download PDF report' })).toBeEnabled();
});

it('allows a failed report to be regenerated and downloaded without submitting feedback again', async () => {
  const clicked = mockDownload();
  vi.mocked(api.request).mockImplementation(async (request) => ({
    data:
      request.method === 'post'
        ? ready
        : {
            ...ready,
            status: 'failed',
            downloadUrl: null,
            error: 'PDF generation failed; feedback was saved.',
          },
  }));
  renderWithProviders(<InterviewFeedbackReportDownload interviewId={20} submitted />, {
    loggedInAs: adminUser,
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Regenerate PDF report' }));
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/interviews/20/feedback/report', method: 'post' }),
  );
  expect(await screen.findByRole('button', { name: 'Download PDF report' })).toBeEnabled();
});
