import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

type Segment = { id: string; text: string; questionId: number | null; startedAt: string };
type Chunk = { audio: ArrayBuffer; startedAt: string };
type Capture = { context: AudioContext; node: AudioWorkletNode; source: MediaStreamAudioSourceNode; gain: GainNode; sessionId: string; sequence: number; queue: Chunk[]; busy: boolean; stopping: boolean; flushed: boolean; cancelled: boolean; startedAt: number; seconds: number };

export default function LiveTranscript({ socket, audio }: { socket: Socket | null; audio: MediaStream | null }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [configured, setConfigured] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('Transcription is off.');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const capture = useRef<Capture | null>(null);
  const generation = useRef(0);
  const request = (event: string, payload: unknown): Promise<any> => new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Interview connection unavailable'));
    socket.timeout(25000).emit(event, payload, (err: Error | null, result: any) => {
      if (err || !result?.success) reject(new Error(result?.error || 'Transcription request timed out'));
      else resolve(result);
    });
  });
  const release = (current: Capture) => {
    current.cancelled = true; current.node.port.onmessage = null;
    current.source.disconnect(); current.node.disconnect(); current.gain.disconnect();
    void current.context.close();
    if (capture.current === current) capture.current = null;
  };
  const cancel = () => {
    generation.current++;
    if (capture.current) release(capture.current);
    if (socket?.connected) socket.emit('TRANSCRIPT_STOP', {});
    setRunning(false); setStarting(false);
  };
  const drain = async (current: Capture) => {
    if (current.busy || current.cancelled) return;
    current.busy = true;
    try {
      while (current.queue.length && !current.cancelled) {
        const chunk = current.queue.shift()!;
        const result = await request('TRANSCRIPT_CHUNK', { ...chunk, sessionId: current.sessionId, sequence: current.sequence });
        if (current.cancelled) return;
        current.sequence++;
        if (result.segment) setSegments(previous => [...previous.filter(s => s.id !== result.segment.id), result.segment].slice(-1000));
        setStatus(current.stopping ? 'Finishing transcription…' : 'Listening to candidate audio…');
      }
      if (current.stopping && current.flushed && !current.cancelled) {
        await request('TRANSCRIPT_STOP', {});
        release(current); setRunning(false); setStatus('Transcription stopped. Saved text remains available.');
      }
    } catch (err) {
      if (!current.cancelled) { cancel(); setError((err as Error).message); setStatus('Transcription stopped with an error.'); }
    } finally { current.busy = false; }
  };
  const stop = () => {
    const current = capture.current;
    if (!current || current.stopping) return;
    current.stopping = true; current.source.disconnect();
    current.node.port.postMessage('flush'); setStatus('Finishing transcription…');
  };
  const start = async () => {
    if (!audio?.getAudioTracks().some(track => track.readyState === 'live') || starting || capture.current) return;
    setStarting(true); setError('');
    const revision = ++generation.current;
    let context: AudioContext | undefined;
    try {
      context = new AudioContext(); await context.resume();
      await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/transcript-processor.js`);
      const result = await request('TRANSCRIPT_START', { consentConfirmed: consent });
      if (revision !== generation.current) { void context.close(); socket?.emit('TRANSCRIPT_STOP', {}); return; }
      const node = new AudioWorkletNode(context, 'transcript-processor');
      const source = context.createMediaStreamSource(new MediaStream(audio.getAudioTracks()));
      const gain = context.createGain(); gain.gain.value = 0;
      const current: Capture = { context, node, source, gain, sessionId: result.sessionId, sequence: 0, queue: [], busy: false, stopping: false, flushed: false, cancelled: false, startedAt: Date.now(), seconds: 0 };
      capture.current = current;
      node.port.onmessage = ({ data }: MessageEvent<{ audio?: ArrayBuffer; duration?: number; flushed?: boolean }>) => {
        if (current.cancelled) return;
        if (data.flushed) current.flushed = true;
        if (data.audio && data.duration) {
          const startedAt = new Date(current.startedAt + current.seconds * 1000).toISOString();
          current.seconds += data.duration;
          if (data.audio.byteLength >= 3200) current.queue.push({ audio: data.audio, startedAt });
          if (current.queue.length > 5) { cancel(); setError('Transcription cannot keep up. Try a smaller model or faster hardware.'); return; }
        }
        void drain(current);
      };
      source.connect(node); node.connect(gain); gain.connect(context.destination);
      setRunning(true); setStatus('Listening to candidate audio…');
    } catch (err) {
      if (context && context.state !== 'closed') void context.close();
      if (revision === generation.current) { cancel(); setError((err as Error).message); }
    } finally { if (revision === generation.current) setStarting(false); }
  };
  useEffect(() => {
    if (!socket) return;
    const load = () => socket.emit('TRANSCRIPT_HISTORY', {}, (result: any) => {
      if (result?.success) { setConfigured(result.configured); setSegments(result.segments); }
      else setError(result?.error || 'Could not load transcript');
    });
    const ended = () => { cancel(); setStatus('Interview or connection ended. Transcription stopped.'); };
    load(); socket.on('connect', load); socket.on('disconnect', ended); socket.on('INTERVIEW_ENDED', ended);
    return () => { cancel(); socket.off('connect', load); socket.off('disconnect', ended); socket.off('INTERVIEW_ENDED', ended); };
  }, [socket]);
  useEffect(() => {
    const tracks = audio?.getAudioTracks() || [];
    const ended = () => { cancel(); setStatus('Call audio ended. Transcription stopped.'); };
    tracks.forEach(track => track.addEventListener('ended', ended));
    return () => { tracks.forEach(track => track.removeEventListener('ended', ended)); cancel(); };
  }, [audio]);
  return <section aria-label="Live candidate transcript" className="border-t border-surface-800 pt-4 space-y-3">
    <h3 className="font-semibold">Live candidate transcript</h3>
    <p className="text-xs text-surface-400">Candidate speech is transcribed and saved for this interview. Text may contain recognition errors. Review selected segments using Use transcript for this question in Question &amp; code before generating AI follow-ups.</p>
    {!configured && <p className="text-sm text-amber-400">Local transcription worker is not configured.</p>}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={running || starting} onChange={e => setConsent(e.target.checked)} />Participants have agreed to audio transcription.</label>
    <div className="flex gap-2"><button type="button" className="btn-primary" disabled={!configured || !consent || !audio || running || starting || !socket?.connected} onClick={() => void start()}>{starting ? 'Starting…' : 'Start transcription'}</button>
      <button type="button" className="btn-outline" disabled={!running} onClick={stop}>Stop transcription</button></div>
    <p role="status" className="text-xs text-surface-400">{status}</p>
    {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    <div className="max-h-64 overflow-auto space-y-2" aria-label="Saved transcript segments">
      {!segments.length && <p className="text-sm text-surface-500">Finalized text appears every few seconds while the candidate speaks.</p>}
      {segments.map(segment => <p key={segment.id} className="text-sm"><span className="text-xs text-surface-500">{new Date(segment.startedAt).toLocaleTimeString()} · Candidate{segment.questionId ? ` · Question ${segment.questionId}` : ''}</span><span className="block whitespace-pre-wrap">{segment.text}</span></p>)}
    </div>
  </section>;
}
