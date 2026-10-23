import { randomUUID } from 'crypto';
import axios from 'axios';
import { Socket } from 'socket.io';
import { z } from 'zod';
import prisma from '../prisma';

export const transcriptionDependencies = {
  interview: (id: number) => prisma.interview.findUnique({ where: { id } }),
  history: (id: number) => prisma.interviewTranscriptSegment.findMany({ where: { interviewId: id }, orderBy: { startedAt: 'desc' }, take: 1000 }),
  save: (data: Parameters<typeof prisma.interviewTranscriptSegment.create>[0]['data']) => prisma.interviewTranscriptSegment.create({ data }),
};

const chunkSchema = z.object({
  sessionId: z.string().uuid(), sequence: z.number().int().min(0),
  startedAt: z.string().datetime(), audio: z.instanceof(Buffer).refine(b => b.length >= 3200 && b.length <= 128000 && b.length % 2 === 0),
}).strict();

export function registerTranscription(socket: Socket) {
  let session: { id: string; sequence: number; busy: boolean } | undefined;
  const workerUrl = process.env.TRANSCRIPTION_URL;
  const token = process.env.TRANSCRIPTION_TOKEN;
  const active = async () => {
    const user = socket.data.user;
    if (user?.role !== 'interviewer') throw new Error('Only the assigned interviewer can access transcripts');
    const interview = await transcriptionDependencies.interview(user.interviewId);
    if (!interview || interview.interviewerId !== user.userId) throw new Error('Interview access denied');
    return interview;
  };
  socket.on('TRANSCRIPT_HISTORY', async (_payload, callback) => {
    try {
      const interview = await active();
      const rows = await transcriptionDependencies.history(interview.id);
      callback?.({ success: true, configured: Boolean(workerUrl && token), segments: rows.reverse() });
    } catch { callback?.({ success: false, error: 'Could not load interview transcript' }); }
  });
  socket.on('TRANSCRIPT_START', async (payload, callback) => {
    try {
      const interview = await active();
      if (interview.status !== 'in_progress') throw new Error('Start the interview before transcribing');
      if (!workerUrl || !token) throw new Error('Local transcription worker is not configured');
      if (payload?.consentConfirmed !== true) throw new Error('Confirm participant consent before transcribing');
      if (session) throw new Error('Transcription is already running');
      session = { id: randomUUID(), sequence: 0, busy: false };
      socket.to(`room:interview:${interview.id}`).emit('TRANSCRIPT_CAPTURE_STATUS', { active: true });
      callback?.({ success: true, sessionId: session.id });
    } catch (error) { callback?.({ success: false, error: (error as Error).message }); }
  });
  socket.on('TRANSCRIPT_CHUNK', async (payload, callback) => {
    const current = session;
    try {
      const input = chunkSchema.parse(payload);
      if (!current || input.sessionId !== current.id) throw new Error('Start transcription again');
      if (current.busy) throw new Error('Transcription worker is busy');
      if (input.sequence !== current.sequence) throw new Error('Audio sequence is out of order');
      current.busy = true;
      const interview = await active();
      if (interview.status !== 'in_progress') throw new Error('Interview is not active');
      const start = new Date(input.startedAt);
      if (Math.abs(Date.now() - start.getTime()) > 120000) throw new Error('Audio timestamp is stale');
      const result = await axios.post(`${workerUrl!.replace(/\/$/, '')}/transcribe`, input.audio, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        timeout: 20000, maxContentLength: 20000, maxBodyLength: 128000,
      });
      const text = z.string().max(8000).parse(result.data.text).trim();
      // A stopped session must never publish or store a late recognition result.
      if (session !== current || !socket.connected) throw new Error('Transcription stopped');
      const state = await active();
      if (state.status !== 'in_progress') throw new Error('Interview has ended');
      const segment = text ? await transcriptionDependencies.save({
        id: randomUUID(), interviewId: interview.id, questionId: interview.currentQuestionId,
        sessionId: current.id, sequence: input.sequence, speaker: 'candidate', text,
        startedAt: start, endedAt: new Date(start.getTime() + input.audio.length / 32),
      }) : null;
      current.sequence++;
      callback?.({ success: true, segment });
    } catch (error) {
      callback?.({ success: false, error: axios.isAxiosError(error) ? 'Local transcription worker unavailable or too slow. Check the worker and restart transcription.' : error instanceof z.ZodError ? 'Invalid audio chunk' : (error as Error).message });
    } finally { if (current) current.busy = false; }
  });
  const stop = () => {
    session = undefined;
    if (socket.data.user?.interviewId) socket.to(`room:interview:${socket.data.user.interviewId}`).emit('TRANSCRIPT_CAPTURE_STATUS', { active: false });
  };
  socket.on('TRANSCRIPT_STOP', (_payload, callback) => {
    if (socket.data.user?.role !== 'interviewer') return callback?.({ success: false, error: 'Only the interviewer can stop transcription' });
    stop(); callback?.({ success: true });
  });
  socket.on('disconnect', stop);
}
