import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import CollaborativeEditor from './CollaborativeEditor';
vi.mock('../CodeEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Live code" value={value} onChange={(event) => onChange(event.target.value)} /> }));

it('refreshes displayed code when a newer server snapshot arrives after mount', () => {
  const props = { socket: null, languageId: 71, readOnly: true, onCode: vi.fn() };
  const view = render(<CollaborativeEditor {...props} initialCode="print(1)" serverRevision={1} />);
  view.rerender(<CollaborativeEditor {...props} initialCode="print(2)" serverRevision={2} />);
  expect(screen.getByLabelText('Live code')).toHaveValue('print(2)');
  view.rerender(<CollaborativeEditor {...props} initialCode="stale code" serverRevision={1} />);
  expect(screen.getByLabelText('Live code')).toHaveValue('print(2)');
});

function linkedEditors(ackDelay = 10) {
  let revision = 0;
  let code = '';
  const sockets: any[] = [];
  function create(id: string) {
    const handlers = new Map<string, Set<(value: any) => void>>();
    const socket: any = { id, connected: true,
      on: (name: string, handler: (value: any) => void) => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(handler); },
      off: (name: string, handler: (value: any) => void) => handlers.get(name)?.delete(handler),
      receive: (name: string, value: any) => handlers.get(name)?.forEach((handler) => handler(value)),
      timeout() { return this; },
      emit: vi.fn((name: string, body: any, callback?: any) => {
        if (name === 'JOIN_INTERVIEW') socket.receive('SYNC_STATE', { currentCode: code, codeRevision: revision, currentLanguageId: 71 });
        if (name !== 'UPDATE_CODE') return;
        if (body.baseRevision !== revision) { callback?.(null, { success: false, state: { currentCode: code, codeRevision: revision } }); return; }
        code = body.code; revision++;
        const responseRevision = revision;
        for (const target of sockets) target.receive('CODE_CHANGED', { code, revision, languageId: 71, authorSocketId: id });
        setTimeout(() => callback?.(null, { success: true, revision: responseRevision }), ackDelay);
      }),
    };
    sockets.push(socket);
    return socket as Socket & { receive: (name: string, value: any) => void };
  }
  const candidate = create('candidate');
  const interviewer = create('interviewer');
  const view = render(<>
    <CollaborativeEditor socket={candidate} initialCode="" languageId={71} readOnly={false} onCode={vi.fn()} />
    <CollaborativeEditor socket={interviewer} initialCode="" languageId={71} readOnly={false} onCode={vi.fn()} />
  </>);
  return { candidate, interviewer, view, editors: screen.getAllByLabelText('Live code'), savedCode: () => code };
}

it('streams continuous typing before a pause and synchronizes edits in both directions', () => {
  vi.useFakeTimers();
  const pair = linkedEditors();
  try {
    const text = 'continuous candidate typing';
    for (let index = 1; index <= text.length; index++) {
      fireEvent.change(pair.editors[0], { target: { value: text.slice(0, index) } });
      act(() => { vi.advanceTimersByTime(40); });
      if (index === 12) expect((pair.editors[1] as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    }
    act(() => { vi.advanceTimersByTime(300); });
    expect(pair.editors[1]).toHaveValue(text);
    fireEvent.change(pair.editors[1], { target: { value: 'interviewer correction' } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(pair.editors[0]).toHaveValue('interviewer correction');
    expect(pair.savedCode()).toBe('interviewer correction');
  } finally { pair.view.unmount(); vi.useRealTimers(); }
});

it('accepts a newer remote edit while an earlier committed save acknowledgement is delayed', () => {
  vi.useFakeTimers();
  const pair = linkedEditors(500);
  try {
    fireEvent.change(pair.editors[0], { target: { value: 'candidate draft' } });
    act(() => { vi.advanceTimersByTime(120); });
    fireEvent.change(pair.editors[1], { target: { value: 'reviewed candidate draft' } });
    act(() => { vi.advanceTimersByTime(120); });
    expect(pair.editors[0]).toHaveValue('reviewed candidate draft');
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole('button', { name: 'Use saved version' })).not.toBeInTheDocument();
    expect(pair.editors[0]).toHaveValue('reviewed candidate draft');
  } finally { pair.view.unmount(); vi.useRealTimers(); }
});

it('resumes sending a pending draft after rejoining an unchanged server version', () => {
  vi.useFakeTimers();
  const pair = linkedEditors();
  try {
    fireEvent.change(pair.editors[0], { target: { value: 'pending local work' } });
    act(() => pair.candidate.receive('SYNC_STATE', { currentCode: '', codeRevision: 0 }));
    act(() => { vi.advanceTimersByTime(300); });
    expect(pair.editors[1]).toHaveValue('pending local work');
    expect(screen.queryByRole('button', { name: 'Use saved version' })).not.toBeInTheDocument();
  } finally { pair.view.unmount(); vi.useRealTimers(); }
});

it('continues streaming after the author receives commit events even when callbacks are delayed', () => {
  vi.useFakeTimers();
  const pair = linkedEditors(12000);
  try {
    fireEvent.change(pair.editors[0], { target: { value: 'first committed update' } });
    act(() => { vi.advanceTimersByTime(120); });
    fireEvent.change(pair.editors[0], { target: { value: 'second committed update' } });
    act(() => { vi.advanceTimersByTime(120); });
    expect(pair.editors[1]).toHaveValue('second committed update');
    act(() => { vi.advanceTimersByTime(12500); });
    expect(screen.queryByRole('button', { name: 'Use saved version' })).not.toBeInTheDocument();
  } finally { pair.view.unmount(); vi.useRealTimers(); }
});

it('preserves local edits while a server refresh is received', () => {
  const props = { socket: null, languageId: 71, readOnly: false, onCode: vi.fn() };
  const view = render(<CollaborativeEditor {...props} initialCode="print(1)" serverRevision={1} />);
  fireEvent.change(screen.getByLabelText('Live code'), { target: { value: 'local draft' } });
  view.rerender(<CollaborativeEditor {...props} initialCode="new server code" serverRevision={2} />);
  expect(screen.getByLabelText('Live code')).toHaveValue('local draft');
});
