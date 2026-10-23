import { beforeEach, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../../services/api';
import CandidateInterview from './CandidateInterview';

const socket = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => void>(), emit: vi.fn(), disconnect: vi.fn(), connect: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: () => ({
  connected: false, on: (event: string, handler: (...args: any[]) => void) => socket.handlers.set(event, handler),
  emit: socket.emit, disconnect: socket.disconnect, connect: socket.connect,
}) }));
vi.mock('../../components/interview/RoomTools', () => ({ default: () => <p>Room tools</p> }));
vi.mock('../../components/interview/CollaborativeEditor', () => ({ default: ({ initialCode, onCode }: { initialCode: string; onCode: (value: string) => void }) => (
  <textarea aria-label="Shared code" value={initialCode} onChange={(event) => onCode(event.target.value)} />
) }));
const room = {
  id: 64, title: 'Live DSA interview', candidateName: 'Maya', status: 'in_progress',
  currentQuestionId: 12, currentLanguageId: 71, currentCode: 'print("saved code")', currentCandidateAnswer: 'Saved answer',
  currentQuestion: { id: 12, title: 'Two Sum', statement: 'Find two values with the target sum.', questionType: 'coding', tags: '[]', starterCodes: [], testCases: [
    { id: 1, input: '2 7\n9', expectedOutput: '0 1', isSample: true },
    { id: 2, input: 'HIDDEN INPUT', expectedOutput: 'HIDDEN OUTPUT', isSample: false },
  ] },
  questions: [{ questionId: 12 }],
};
beforeEach(() => socket.handlers.clear());
function renderRoom() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/interview/room-token']}>
    <Routes><Route path="/interview/:token" element={<CandidateInterview />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

it('renders after the initial request finishes and loads saved code without a socket connection', async () => {
  let finish: (value: any) => void = () => {};
  vi.mocked(api.request).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderRoom();
  expect(screen.queryByRole('heading', { name: room.title })).not.toBeInTheDocument();
  await act(async () => finish({ data: room }));
  expect(await screen.findByRole('heading', { name: room.title })).toBeInTheDocument();
  expect(screen.getByLabelText('Shared code')).toHaveValue(room.currentCode);
  expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save answer for interviewer' })).not.toBeInTheDocument();
  expect(screen.getByText('Sample 1 input')).toBeInTheDocument();
  expect(screen.getByText('0 1')).toBeInTheDocument();
  expect(screen.queryByText('HIDDEN INPUT')).not.toBeInTheDocument();
  await act(async () => socket.handlers.get('connect_error')!(new Error('Connection unavailable')));
  expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable');
  expect(screen.getByRole('heading', { name: 'Two Sum' })).toBeInTheDocument();
});

it('keeps unsaved candidate edits when polling returns the same question', async () => {
  const user = userEvent.setup();
  vi.mocked(api.request).mockResolvedValue({ data: room });
  const client = renderRoom();
  await screen.findByRole('heading', { name: room.title });
  await user.clear(screen.getByLabelText('Shared code'));
  await user.type(screen.getByLabelText('Shared code'), 'print("my draft")');
  await act(async () => { await client.invalidateQueries({ queryKey: ['candidate-room', 'room-token'] }); });
  expect(screen.getByLabelText('Shared code')).toHaveValue('print("my draft")');
});

it('updates live question text without replacing the candidate draft or answer', async () => {
  const user = userEvent.setup();
  vi.mocked(api.request).mockResolvedValue({ data: room });
  renderRoom();
  await screen.findByRole('heading', { name: room.title });
  await user.clear(screen.getByLabelText('Shared code'));
  await user.type(screen.getByLabelText('Shared code'), 'print("working draft")');
  await act(async () => socket.handlers.get('QUESTIONS_UPDATED')!({ questionId: 12, question: { ...room.currentQuestion, title: 'Updated Two Sum' } }));
  expect(screen.getByRole('heading', { name: 'Updated Two Sum' })).toBeInTheDocument();
  expect(screen.getByLabelText('Shared code')).toHaveValue('print("working draft")');
  expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
});

it('shows only a waiting room until the interviewer starts, then loads the current question', async () => {
  let started = false;
  vi.mocked(api.request).mockImplementation(async () => ({ data: { ...room, status: started ? 'in_progress' : 'scheduled' } }));
  renderRoom();
  expect(await screen.findByRole('heading', { name: 'Waiting for interviewer to start the interview' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: room.title })).not.toBeInTheDocument();
  expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Shared code')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
  expect(screen.queryByText('Room tools')).not.toBeInTheDocument();
  await act(async () => socket.handlers.get('QUESTION_CHANGED')!({ questionId: 12, question: room.currentQuestion, code: room.currentCode }));
  expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
  started = true;
  await act(async () => socket.handlers.get('INTERVIEW_STARTED')!({}));
  expect(await screen.findByRole('heading', { name: 'Two Sum' })).toBeInTheDocument();
  expect(screen.getByLabelText('Shared code')).toBeInTheDocument();
  expect(screen.getByText('Room tools')).toBeInTheDocument();
});
