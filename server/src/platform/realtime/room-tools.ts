import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { registerTranscription } from './transcription';
const point = z.object({ x: z.number().min(0).max(1000), y: z.number().min(0).max(600) }).strict();
const stroke = z
  .object({
    id: z.string().uuid(),
    color: z.enum(['#2563eb', '#16a34a', '#ef4444', '#f59e0b']),
    points: z.array(point).min(2).max(1000),
  })
  .strict();
export function registerRoomTools(io: Server, socket: Socket) {
  registerTranscription(socket);
  let windowStart = Date.now();
  let count = 0;
  socket.use(([_event], next) => {
    if (Date.now() - windowStart > 10000) {
      windowStart = Date.now();
      count = 0;
    }
    if (++count > 250) return next(new Error('Too many realtime events. Please slow down.'));
    next();
  });
  const room = () => `room:interview:${socket.data.user?.interviewId}`;
  socket.on('ROOM_TOOLS', async (_payload, callback) => {
    try {
      const rows = await prisma.interviewEvent.findMany({
        where: {
          interviewId: socket.data.user.interviewId,
          eventType: {
            in: ['CHAT_MESSAGE', 'WHITEBOARD_STROKE', 'WHITEBOARD_CLEARED'],
          },
        },
        orderBy: { id: 'desc' },
        take: 500,
      });
      let servers: unknown = [];
      try {
        servers = JSON.parse(process.env.WEBRTC_ICE_SERVERS || '[]');
      } catch {}
      callback?.({
        success: true,
        events: rows.reverse().map((e) => ({ ...e, payload: JSON.parse(e.payload) })),
        iceServers: servers,
      });
    } catch {
      callback?.({ success: false, error: 'Could not load room tools' });
    }
  });
  socket.on('CHAT_MESSAGE', async (payload, callback) => {
    try {
      const input = z
        .object({ text: z.string().trim().min(1).max(4000) })
        .strict()
        .parse(payload);
      const data = {
        ...input,
        name: socket.data.user.name,
        role: socket.data.user.role,
        timestamp: new Date().toISOString(),
      };
      const event = await prisma.interviewEvent.create({
        data: {
          interviewId: socket.data.user.interviewId,
          eventType: 'CHAT_MESSAGE',
          actorRole: socket.data.user.role,
          payload: JSON.stringify(data),
        },
      });
      io.to(room()).emit('CHAT_MESSAGE', { id: event.id, ...data });
      callback?.({ success: true });
    } catch {
      callback?.({ success: false, error: 'Message could not be sent' });
    }
  });
  socket.on('WHITEBOARD_STROKE', async (payload, callback) => {
    try {
      const input = stroke.parse(payload);
      await prisma.interviewEvent.create({
        data: {
          interviewId: socket.data.user.interviewId,
          eventType: 'WHITEBOARD_STROKE',
          actorRole: socket.data.user.role,
          payload: JSON.stringify(input),
        },
      });
      socket.to(room()).emit('WHITEBOARD_STROKE', input);
      callback?.({ success: true });
    } catch {
      callback?.({
        success: false,
        error: 'Whiteboard stroke could not be saved',
      });
    }
  });
  socket.on('WHITEBOARD_CLEARED', async (_payload, callback) => {
    try {
      if (socket.data.user.role !== 'interviewer')
        return callback?.({
          success: false,
          error: 'Only the interviewer can clear the whiteboard',
        });
      await prisma.interviewEvent.create({
        data: {
          interviewId: socket.data.user.interviewId,
          eventType: 'WHITEBOARD_CLEARED',
          actorRole: 'interviewer',
          payload: '{}',
        },
      });
      io.to(room()).emit('WHITEBOARD_CLEARED', {});
      callback?.({ success: true });
    } catch {
      callback?.({ success: false, error: 'Whiteboard could not be cleared' });
    }
  });
  socket.on('RTC_SIGNAL', (payload, callback) => {
    try {
      const input = z
        .object({
          type: z.enum(['offer', 'answer', 'ice', 'hangup', 'media-state']),
          data: z.unknown(),
        })
        .strict()
        .parse(payload);
      if (JSON.stringify(input).length > 20000) throw new Error('Signal too large');
      socket.to(room()).emit('RTC_SIGNAL', {
        ...input,
        sender: socket.id,
        role: socket.data.user.role,
      });
      callback?.({ success: true });
    } catch {
      callback?.({ success: false, error: 'Invalid video signal' });
    }
  });
  socket.on('CURSOR_CHANGED', (payload) => {
    const position = z
      .object({
        lineNumber: z.number().int().min(1).max(100000),
        column: z.number().int().min(1).max(100000),
      })
      .safeParse(payload);
    if (position.success)
      socket.to(room()).emit('CURSOR_CHANGED', {
        ...position.data,
        name: socket.data.user.name,
        role: socket.data.user.role,
      });
  });
}
