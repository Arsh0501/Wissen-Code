import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import LiveTranscript from './LiveTranscript';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('captures only supplied audio, saves text, flushes stop and leaves call tracks intact', async () => {
  const listeners: Record<string, Function> = {};
  const node = { port: { onmessage: null as any, postMessage: vi.fn(() => node.port.onmessage({ data: { flushed: true } })) }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = { resume: vi.fn().mockResolvedValue(undefined), state: 'running', audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }, createMediaStreamSource: vi.fn(() => source), createGain: vi.fn(() => gain), destination: {}, close: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('AudioContext', vi.fn(() => context));
  vi.stubGlobal('AudioWorkletNode', vi.fn(() => node));
  vi.stubGlobal('MediaStream', vi.fn((tracks: unknown[]) => ({ tracks })));
  const track = { readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn(), stop: vi.fn() };
  const audio = { getAudioTracks: () => [track] } as unknown as MediaStream;
  const socket: any = { connected: true, timeout: vi.fn().mockReturnThis(), on: vi.fn((event, fn) => { listeners[event] = fn; }), off: vi.fn(),
    emit: vi.fn((event, _payload, cb) => {
      if (!cb) return;
      if (event === 'TRANSCRIPT_HISTORY') cb({ success: true, configured: true, segments: [] });
      else if (event === 'TRANSCRIPT_START') cb(null, { success: true, sessionId: 'session' });
      else if (event === 'TRANSCRIPT_CHUNK') cb(null, { success: true, segment: { id: 'one', text: 'We used Redis.', startedAt: new Date().toISOString(), questionId: 13 } });
      else cb(null, { success: true });
    }),
  };
  const view = render(<LiveTranscript socket={socket} audio={audio} />);
  expect(screen.getByRole('button', { name: 'Start transcription' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Start transcription' }));
  await screen.findByText('Listening to candidate audio…');
  expect(context.createMediaStreamSource).toHaveBeenCalledOnce();
  expect(gain.gain.value).toBe(0);
  node.port.onmessage({ data: { audio: new ArrayBuffer(96000), duration: 3 } });
  await screen.findByText('We used Redis.');
  fireEvent.click(screen.getByRole('button', { name: 'Stop transcription' }));
  await waitFor(() => expect(context.close).toHaveBeenCalled());
  expect(track.stop).not.toHaveBeenCalled();
  expect(screen.getByText('We used Redis.')).toBeVisible();
  view.unmount();
});

it('explains missing worker configuration and requires connected candidate audio', () => {
  render(<LiveTranscript socket={null} audio={null} />);
  expect(screen.getByText('Local transcription worker is not configured.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start transcription' })).toBeDisabled();
});
