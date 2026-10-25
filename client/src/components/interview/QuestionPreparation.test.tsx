import { it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import * as services from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionPreparation from './QuestionPreparation';

it('shows the interview lineup in order and refreshes it after adding a question', async () => {
  const question = (id: number, title: string) => ({ id, title, statement: `Explain ${title}.`, difficulty: 'medium', questionType: 'written', tags: '[]' });
  const links = [
    { questionId: 2, orderIndex: 1, status: 'pending', question: question(2, 'Resume project') },
    { questionId: 1, orderIndex: 0, status: 'asked', sourceSetTitle: 'Backend set', question: question(1, 'System design') },
  ];
  vi.spyOn(services, 'getQuestions').mockResolvedValue([question(3, 'Database indexes')] as any);
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/questions' ? [question(3, 'Database indexes')] : { user: adminUser } }));
  vi.mocked(api.request).mockImplementation(async config => {
    if (config.url === '/interviews/20/questions' && config.method === 'post') {
      links.push({ questionId: 3, orderIndex: 2, status: 'pending', question: question(3, 'Database indexes') });
      return { data: { success: true } };
    }
    return { data: { id: 20, title: 'Interview', status: 'scheduled', candidateName: 'Candidate', questions: [...links] } };
  });
  renderWithProviders(<QuestionPreparation interviewId={20} onClose={vi.fn()} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Interview lineup (2)' }));
  const lineup = within(screen.getByRole('region', { name: 'Interview lineup' }));
  expect(lineup.getAllByRole('heading').map(el => el.textContent)).toEqual(['1. System design', '2. Resume project']);
  expect(lineup.getAllByText('Asked')).toHaveLength(1);
  await user.click(lineup.getAllByText('View question')[0]);
  expect(lineup.getByText('Explain System design.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Question bank' }));
  await user.click(await screen.findByLabelText('Select Database indexes'));
  await user.click(screen.getByRole('button', { name: 'Add selected questions (1)' }));
  await user.click(await screen.findByRole('button', { name: 'Interview lineup (3)' }));
  expect(screen.getByRole('heading', { name: '3. Database indexes' })).toBeVisible();
});

it('keeps only available question selection and preserves set selections across sources', async () => {
  vi.mocked(api.request).mockImplementation(async config => ({ data: config.url === '/questions' ? [] : { id: 20, title: 'Interview', status: 'in_progress', candidateName: 'Candidate', questions: [] } }));
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/interview-question-sets' ? [{ id: 1, title: 'Java', _count: { questions: 1 } }] : url === '/interview-question-sets/1' ? { questions: [{ id: 11, title: 'Locks', statement: 'Explain locks.' }] } : { user: adminUser } }));
  renderWithProviders(<QuestionPreparation interviewId={20} onClose={vi.fn()} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  expect(await screen.findByRole('region', { name: 'Question bank' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Generate from resume' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'View resume' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Question title')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Question sets' }));
  await user.click(await screen.findByRole('button', { name: 'Java (1)' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Locks' }));
  await user.click(screen.getByRole('button', { name: 'Question bank' }));
  await user.click(screen.getByRole('button', { name: 'Question sets' }));
  expect(screen.getByRole('checkbox', { name: 'Locks' })).toBeChecked();
});

it('reviews resume drafts and adds only selected questions to the current interview', async () => {
  const drafts = ['Project architecture', 'Database design'].map(title => ({ title, statement: `Discuss ${title}.`, difficulty: 'medium', tags: ['resume'], keyDiscussionPoints: ['Tradeoffs'], expectedSolution: 'Explain your decisions.' }));
  vi.mocked(api.request).mockImplementation(async config => ({ data:
    config.url === '/interview-workflows/20/resume-questions' ? { questions: drafts }
      : config.method === 'post' ? { success: true }
        : { id: 20, title: 'Interview', status: 'scheduled', candidateName: 'Candidate', candidateResume: 'Built a database-backed application.', questions: [] },
  }));
  renderWithProviders(<QuestionPreparation interviewId={20} onClose={vi.fn()} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Generate from resume' }));
  expect(screen.getByText('Uses the resume attached to this interview automatically.')).toBeVisible();
  expect(screen.queryByLabelText('Resume text')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Generate questions' }));
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interview-workflows/20/resume-questions', method: 'post', data: { count: 5, difficulty: 'medium', focus: '' } }));
  await user.click(await screen.findByRole('checkbox', { name: /Database design/ }));
  await user.click(screen.getByText('Edit question 1'));
  const editor = within(screen.getByRole('group', { name: 'Edit generated question 1' }));
  await user.clear(editor.getByLabelText('Question title'));
  expect(screen.getByRole('button', { name: 'Add selected resume questions (1)' })).toBeDisabled();
  await user.type(editor.getByLabelText('Question title'), 'Revised architecture');
  await user.clear(editor.getByLabelText('Question text'));
  await user.type(editor.getByLabelText('Question text'), 'Explain scaling your project.');
  await user.selectOptions(editor.getByLabelText('Question difficulty'), 'hard');
  await user.clear(editor.getByLabelText('Expected answer'));
  await user.type(editor.getByLabelText('Expected answer'), 'Discuss scaling tradeoffs.');
  await user.click(screen.getByRole('button', { name: 'Question bank' }));
  await user.click(screen.getByRole('button', { name: 'Generate from resume' }));
  expect(screen.getByRole('checkbox', { name: /Database design/ })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Add selected resume questions (1)' }));
  expect(await screen.findByText('Added 1 resume questions to this interview.')).toBeVisible();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/questions', method: 'post', data: {
    ...drafts[0], title: 'Revised architecture', statement: 'Explain scaling your project.', difficulty: 'hard', expectedSolution: 'Discuss scaling tradeoffs.',
  } }));
  expect(screen.queryByText('Edit question 1')).not.toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/questions', method: 'post', data: drafts[1] }));
});
