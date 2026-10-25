import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvaluationEditor } from './InterviewWorkspace';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import api from '../../services/api';

const evaluation = { id: 7, questionId: 3, candidateAnswer: '', candidateCode: '', notes: '', skills: [{ skill: 'Java', rating: 2, rationale: 'Explains core Java but weak in Spring Boot' }], observations: [], executionResults: {}, status: 'final', revision: 1 } as any;

it('saves edited skill feedback before requesting observations and preserves final status', async () => {
  const calls: any[] = [];
  vi.mocked(api.request).mockImplementation(async (config: any) => { calls.push(config); return { data: evaluation }; });
  renderWithProviders(<EvaluationEditor id={20} questionId={3} existing={evaluation} answer="" code="" />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Java evidence'), ' and missed transactions');
  expect(screen.getByRole('button', { name: 'Get AI observations' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Get AI observations' }));
  await waitFor(() => expect(calls.filter((call) => call.url.includes('interview-workflows'))).toHaveLength(2));
  const requests = calls.filter((call) => call.url.includes('interview-workflows'));
  expect(requests[0]).toMatchObject({ method: 'put', url: '/interview-workflows/20/evaluations', data: { status: 'final', skills: [{ skill: 'Java', rating: 2, rationale: 'Explains core Java but weak in Spring Boot and missed transactions' }] } });
  expect(requests[1]).toMatchObject({ method: 'post', url: '/interview-workflows/20/evaluations/7/observe' });
});

it('preserves a saved empty code value and enables rationale-only observations', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: evaluation });
  renderWithProviders(<EvaluationEditor id={20} questionId={3} existing={evaluation} answer="Unrecorded answer" code="Unrecorded draft code" />, { loggedInAs: adminUser });
  expect(screen.getByRole('textbox', { name: /Candidate code/ })).toHaveValue('');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Get AI observations' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interview-workflows/20/evaluations/7/observe' })));
  expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'put' }));
});

it('does not request observations without any recorded evidence', () => {
  renderWithProviders(<EvaluationEditor id={20} questionId={3} answer="" code="" />, { loggedInAs: adminUser });
  expect(screen.getByRole('button', { name: 'Get AI observations' })).toBeDisabled();
  expect(screen.getByText(/Add an answer, code, interviewer notes or skill rationale/)).toBeInTheDocument();
});

it('adds skill rows, prevents duplicate names and saves their ratings and feedback', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: evaluation });
  renderWithProviders(<EvaluationEditor id={20} questionId={3} existing={evaluation} answer="" code="" />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Skill name'), ' Spring Boot ');
  await user.click(screen.getByRole('button', { name: 'Add skill' }));
  expect(screen.getByLabelText('Spring Boot rating')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Finalize evaluation' })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Spring Boot rating'), '3');
  await user.type(screen.getByLabelText('Spring Boot evidence'), 'Explained dependency injection.');
  expect(screen.getByRole('button', { name: 'Finalize evaluation' })).toBeEnabled();
  await user.type(screen.getByLabelText('Skill name'), 'spring boot');
  expect(screen.getByRole('button', { name: 'Add skill' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save evaluation draft' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interview-workflows/20/evaluations', data: expect.objectContaining({ skills: [...evaluation.skills, { skill: 'Spring Boot', rating: 3, rationale: 'Explained dependency injection.' }] }) })));
});
