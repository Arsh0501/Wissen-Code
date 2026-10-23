import { afterEach, it, expect, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api, * as services from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewerDashboard from './InterviewerDashboard';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bankQuestions = [
  { id: 201, title: 'Two Sum', statement: 'Find two array elements whose sum equals the target.', difficulty: 'easy', tags: '["arrays"]', questionType: 'coding' },
  { id: 202, title: 'React form design', statement: 'Describe form state management.', difficulty: 'medium', tags: '["React"]', questionType: 'written' },
];

function setupScheduledInterview() {
  vi.spyOn(services, 'getQuestions').mockResolvedValue(bankQuestions as any);
  localStorage.setItem('wissen-user', JSON.stringify({ ...adminUser, role: 'interviewer' }));
  localStorage.setItem('wissen-token', 'test-token');
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(() => 'blob:resume');
    static revokeObjectURL = vi.fn();
  });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/questions' ? bankQuestions : url.endsWith('/resume')
    ? new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' })
    : { user: JSON.parse(localStorage.getItem('wissen-user') || 'null') } }));
  const interview = {
    id: 9, title: 'Scheduled interview', candidateName: 'Maya', candidateEmail: 'maya@example.test',
    candidateResumeUrl: '/api/interviews/9/resume', status: 'scheduled', timeLimitMinutes: 45,
    extendedMinutes: 0, scheduledAt: null, questions: [] as any[],
  };
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.method === 'get') return { data: config.url === '/interviews' ? [interview] : interview };
    if (config.method === 'post') {
      const bankQuestion = bankQuestions.find((question) => question.id === config.data.questionId);
      const question = bankQuestion || { ...config.data, id: 101 };
      interview.questions.push({ questionId: question.id, question });
    }
    if (config.method === 'put') interview.questions = [{ questionId: 102, question: { ...config.data, id: 102 } }];
    return { data: { success: true } };
  });
  vi.mocked(api.post).mockResolvedValue({ data: { source: 'resume-based', questions: [{
    title: 'React resume question', statement: 'Explain your React performance work.', difficulty: 'medium', tags: ['React'], keyDiscussionPoints: ['Measure before optimizing'],
  }] } });
}

it('lets an interviewer extend a live interview without scheduling controls', async () => {
  const user = userEvent.setup();
  localStorage.setItem('wissen-user', JSON.stringify({ ...adminUser, role: 'interviewer' }));
  localStorage.setItem('wissen-token', 'test-token');
  vi.mocked(api.request).mockImplementation(async (config: any) => ({ data: config.method === 'get' ? [{
    id: 9, title: 'Live interview', candidateName: 'Maya', candidateEmail: 'maya@example.test',
    status: 'in_progress', timeLimitMinutes: 45, extendedMinutes: 0, scheduledAt: null,
  }] : { success: true } }));
  renderWithProviders(<InterviewerDashboard />);
  await user.click(await screen.findByRole('button', { name: '+15m Extend duration' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: '/interviews/9/extend', method: 'post', data: { extensionMinutes: 15 },
  })));
  expect(screen.queryByRole('button', { name: 'Edit interview' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel interview' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit Feedback' })).not.toBeInTheDocument();
});

it('opens and closes the full-window resume repeatedly and restores focus', async () => {
  const user = userEvent.setup();
  setupScheduledInterview();
  renderWithProviders(<InterviewerDashboard />);
  const trigger = await screen.findByRole('button', { name: 'View Resume' });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Resume: Maya' });
  expect(dialog.parentElement).toBe(document.body);
  await within(dialog).findByTitle('Candidate resume PDF');
  await user.click(within(dialog).getByRole('button', { name: 'Back to interviews' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await screen.findByRole('dialog', { name: 'Resume: Maya' });
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('generates from a PDF-only resume, adds and updates a question, and preserves edits while viewing the resume', async () => {
  const user = userEvent.setup();
  setupScheduledInterview();
  renderWithProviders(<InterviewerDashboard />);
  await user.click(await screen.findByRole('button', { name: 'View Resume' }));
  await user.click(screen.getByRole('button', { name: 'Generate questions from resume' }));
  const prep = within(await screen.findByRole('dialog', { name: 'Prepare interview questions' }));
  await prep.findByText('React resume question');
  expect(api.post).toHaveBeenCalledWith('/interviews/9/generate-resume-questions', {}, { timeout: 120000 });
  await user.click(prep.getByRole('button', { name: 'Add to interview' }));
  await user.click(prep.getByRole('button', { name: /Current questions/ }));
  await prep.findByText('Assigned questions (1)');
  await user.click(prep.getByRole('button', { name: 'Edit question' }));
  await user.clear(prep.getByLabelText('Question title'));
  await user.type(prep.getByLabelText('Question title'), 'Updated React question');
  await user.click(prep.getByRole('button', { name: 'View resume' }));
  await user.click(prep.getByRole('button', { name: 'Open full window' }));
  const resume = within(await screen.findByRole('dialog', { name: 'Resume: Maya' }));
  await user.click(resume.getByRole('button', { name: 'Back to questions' }));
  await user.click(prep.getByRole('button', { name: /Current questions/ }));
  expect(prep.getByLabelText('Question title')).toHaveValue('Updated React question');
  await user.click(prep.getByRole('button', { name: 'Update question' }));
  await prep.findByText('Question updated.');
  expect(prep.getByText('Updated React question')).toBeInTheDocument();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: '/interviews/9/questions/101', method: 'put', data: expect.objectContaining({ title: 'Updated React question' }),
  }));
  await user.click(prep.getByRole('button', { name: 'Done preparing questions' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('lets the interviewer add a question manually before starting', async () => {
  const user = userEvent.setup();
  setupScheduledInterview();
  renderWithProviders(<InterviewerDashboard />);
  await user.click(await screen.findByRole('button', { name: 'Questions & Resume AI' }));
  const prep = within(await screen.findByRole('dialog', { name: 'Prepare interview questions' }));
  await user.click(await prep.findByRole('button', { name: 'Add question' }));
  await user.type(await prep.findByLabelText('Question title'), 'API design discussion');
  await user.type(prep.getByLabelText('Question statement'), 'How would you make an API idempotent?');
  await user.click(prep.getByRole('button', { name: 'Add question' }));
  await prep.findByText('Assigned questions (1)');
  expect(prep.getByText('API design discussion')).toBeInTheDocument();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: '/interviews/9/questions', method: 'post', data: expect.objectContaining({ title: 'API design discussion' }),
  }));
  expect(api.post).not.toHaveBeenCalled();
});

it('combines resume-generated and existing DSA questions in the same interview', async () => {
  const user = userEvent.setup();
  setupScheduledInterview();
  renderWithProviders(<InterviewerDashboard />);
  await user.click(await screen.findByRole('button', { name: 'Questions & Resume AI' }));
  const prep = within(await screen.findByRole('dialog', { name: 'Prepare interview questions' }));
  await user.click(await prep.findByRole('button', { name: 'Generate from resume' }));
  await user.click(prep.getByRole('button', { name: 'Generate questions' }));
  await prep.findByText('React resume question');
  await user.click(prep.getByRole('button', { name: 'Add to interview' }));
  await user.click(prep.getByRole('button', { name: /Current questions/ }));
  await prep.findByText('Assigned questions (1)');
  await user.click(prep.getByRole('button', { name: 'Select questions' }));
  const bank = within(prep.getByRole('region', { name: 'Question bank' }));
  await bank.findByLabelText('Search questions');
  await user.type(bank.getByLabelText('Search questions'), 'Two Sum');
  await user.selectOptions(bank.getByLabelText('Question type filter'), 'coding');
  await user.selectOptions(bank.getByLabelText('Topic filter'), 'arrays');
  await user.selectOptions(bank.getByLabelText('Difficulty filter'), 'easy');
  await user.click(bank.getByRole('button', { name: 'Two Sum' }));
  expect(bank.getByText('Find two array elements whose sum equals the target.')).toBeInTheDocument();
  await user.click(bank.getByLabelText('Select Two Sum'));
  await user.click(bank.getByRole('button', { name: 'Add selected questions (1)' }));
  await waitFor(() => expect(bank.queryByLabelText('Select Two Sum')).not.toBeInTheDocument());
  await user.click(prep.getByRole('button', { name: /Current questions/ }));
  await prep.findByText('Assigned questions (2)');
  expect(prep.getByText('Two Sum')).toBeInTheDocument();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: '/interviews/9/questions', method: 'post', data: { questionId: 201 },
  }));
});

it('shows missed interviews as ended without offering Start or final feedback', async () => {
  setupScheduledInterview();
  vi.mocked(api.request).mockResolvedValue({ data: [{
    id: 9, title: 'Missed interview', candidateName: 'Maya', candidateEmail: 'maya@example.test',
    status: 'expired', timeLimitMinutes: 45, extendedMinutes: 0, scheduledAt: new Date(Date.now() - 3600000).toISOString(),
  }] });
  renderWithProviders(<InterviewerDashboard />);
  expect(await screen.findByText('Ended — not started')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start Interview' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit Feedback' })).not.toBeInTheDocument();
});

it.each(['completed', 'expired', 'cancelled'])('disables question preparation and resume generation for %s interviews', async (status) => {
  const user = userEvent.setup();
  setupScheduledInterview();
  vi.mocked(api.request).mockResolvedValue({ data: [{
    id: 9, title: 'Ended interview', candidateName: 'Maya', candidateEmail: 'maya@example.test',
    status, timeLimitMinutes: 45, extendedMinutes: 0, scheduledAt: null, candidateResumeUrl: '/api/interviews/9/resume',
  }] });
  renderWithProviders(<InterviewerDashboard />);
  expect(await screen.findByRole('button', { name: 'Questions & Resume AI' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'View Resume' }));
  const resume = within(await screen.findByRole('dialog', { name: 'Resume: Maya' }));
  expect(resume.queryByRole('button', { name: 'Generate questions from resume' })).not.toBeInTheDocument();
});
