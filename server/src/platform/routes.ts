// Shared interview communication; Hiring Operations endpoints have been removed.
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOrInterviewer } from '../middleware/adminOnly';
import { WorkflowError } from '../services/structured-ai';
import { appURL, calendarEvent, enqueueMail, mailConfigured } from './communication';
const router = Router();
router.use(adminOrInterviewer);
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
const idOf = (value: unknown) => z.coerce.number().int().positive().parse(value);
router.get(
  '/interviews/:id/calendar',
  wrap(async (req, res) => {
    const interview = await prisma.interview.findFirst({
      where: { id: idOf(req.params.id), interviewerId: req.user!.id },
    });
    if (!interview || !interview.scheduledAt)
      throw new WorkflowError(
        'Schedule the interview before downloading its calendar event',
        400,
      );
    res
      .type('text/calendar')
      .attachment(`interview-${interview.id}.ics`)
      .send(
        calendarEvent({ ...interview, scheduledAt: interview.scheduledAt }),
      );
  }),
);
router.post(
  '/interviews/:id/invitation',
  wrap(async (req, res) => {
    if (!mailConfigured())
      throw new WorkflowError(
        'Configure email delivery before sending invitations',
        503,
      );
    const interview = await prisma.interview.findFirst({
      where: { id: idOf(req.params.id), interviewerId: req.user!.id },
    });
    if (!interview || interview.status !== 'scheduled')
      throw new WorkflowError('Scheduled interview not found', 404);
    await enqueueMail(
      interview.candidateEmail,
      interview.title,
      `Hello ${interview.candidateName},\n\nYour interview: ${interview.title}\n${interview.scheduledAt?.toISOString() ?? 'Time to be confirmed'}\nDuration: ${interview.timeLimitMinutes} minutes\nJoin: ${appURL(`/interview/${interview.roomToken}`)}`,
      req.user!.id,
    );
    res.status(202).json({ message: 'Interview invitation queued' });
  }),
);

export default router;
