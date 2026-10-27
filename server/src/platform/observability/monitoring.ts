import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import prisma from '../../database/prisma';
import { redisConnection } from '../../ai/queue';
let requests = 0,
  failures = 0,
  duration = 0;
export function measureRequest(_req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  res.once('finish', () => {
    requests++;
    duration += performance.now() - start;
    if (res.statusCode >= 500) failures++;
  });
  next();
}
export async function readiness(_req: Request, res: Response) {
  let connection: ReturnType<typeof redisConnection> | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Database timeout')), 5000);
      }),
    ]);
    clearTimeout(timer);
    connection = redisConnection();
    await Promise.race([
      connection.connect(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis timeout')), 5000);
      }),
    ]);
    if ((await connection.ping()) !== 'PONG') throw new Error('Redis unavailable');
    if (process.env.NODE_ENV === 'production' && process.env.JUDGE_MODE === 'mock')
      throw new Error('Mock judge enabled');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  } finally {
    clearTimeout(timer);
    connection?.disconnect();
  }
}
export function metrics(req: Request, res: Response) {
  const configured = process.env.MONITORING_TOKEN ?? '';
  const provided = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  if (
    !configured ||
    configured.length !== provided.length ||
    !crypto.timingSafeEqual(Buffer.from(configured), Buffer.from(provided))
  )
    return res.sendStatus(401);
  res
    .type('text/plain')
    .send(
      `# TYPE wissen_http_requests_total counter\nwissen_http_requests_total ${requests}\n# TYPE wissen_http_failures_total counter\nwissen_http_failures_total ${failures}\n# TYPE wissen_http_duration_milliseconds_total counter\nwissen_http_duration_milliseconds_total ${duration.toFixed(3)}\n# TYPE wissen_process_uptime_seconds gauge\nwissen_process_uptime_seconds ${process.uptime().toFixed(3)}\n`,
    );
}
