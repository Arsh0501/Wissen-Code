import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { monitorData, readAutomation, sendShortlist, shortlistCsv } from '../platform/batch';

const router = Router();
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('Invalid assessment id'), { status: 400 });
  return id;
};

// Live view of a batch: who is in progress, who finished (with scores), who has not started.
router.get(
  '/:id/monitor',
  adminOnly,
  wrap(async (req, res) => {
    const data = await monitorData(idParam(req));
    if (!data) return res.status(404).json({ error: 'Assessment not found' });
    res.json(data);
  }),
);

router.put(
  '/:id/automation',
  adminOnly,
  wrap(async (req, res) => {
    const id = idParam(req);
    const input = z
      .object({
        notifyOnCompletion: z.boolean().optional(),
        autoShortlist: z.boolean().optional(),
        notifyEmails: z.array(z.string().email().max(254)).max(20).optional(),
        shortlist: z
          .object({
            mode: z.enum(['top', 'threshold', 'passed']),
            topN: z.number().int().min(1).max(1000),
            minScore: z.number().min(0).max(100),
            excludeFlagged: z.boolean(),
            maxFlags: z.number().int().min(0).max(100),
          })
          .partial()
          .optional(),
        resetSent: z.boolean().optional(),
      })
      .parse(req.body);
    const existing = await prisma.assessment.findUnique({ where: { id }, select: { automation: true } });
    if (!existing) return res.status(404).json({ error: 'Assessment not found' });
    const current = readAutomation(existing.automation);
    const next = {
      ...current,
      ...(input.notifyOnCompletion !== undefined ? { notifyOnCompletion: input.notifyOnCompletion } : {}),
      ...(input.autoShortlist !== undefined ? { autoShortlist: input.autoShortlist } : {}),
      ...(input.notifyEmails ? { notifyEmails: input.notifyEmails } : {}),
      shortlist: { ...current.shortlist, ...(input.shortlist ?? {}) },
      shortlistSentAt: input.resetSent ? null : current.shortlistSentAt,
    };
    await prisma.assessment.update({ where: { id }, data: { automation: next } });
    res.json(next);
  }),
);

router.get(
  '/:id/shortlist.csv',
  adminOnly,
  wrap(async (req, res) => {
    const id = idParam(req);
    const data = await monitorData(id);
    if (!data) return res.status(404).json({ error: 'Assessment not found' });
    const rows = data.rows.filter((r) => r.shortlisted).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="shortlist-${data.assessment.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv"`,
    );
    res.send(shortlistCsv(id, rows));
  }),
);

router.post(
  '/:id/shortlist/send',
  adminOnly,
  wrap(async (req, res) => {
    const id = idParam(req);
    const { to } = z.object({ to: z.string().email().optional() }).parse(req.body ?? {});
    const sent = await sendShortlist(id, [to ?? req.user!.email], 'sent on request');
    res.json({ sent });
  }),
);

export default router;
