import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { WorkflowError } from '../services/structured-ai';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const requestId = res.getHeader('X-Request-Id');
  const reply = (status: number, message: string) => res.status(status).json({ error: message, requestId });
  if (error instanceof ZodError)
    return reply(400, error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  if (error instanceof WorkflowError) return reply(error.status, error.message);
  if (error.type === 'entity.parse.failed') return reply(400, 'Request body must be valid JSON.');
  if (error.type === 'entity.too.large') return reply(413, 'Request body is too large.');
  if (error.code === 'P2034') return reply(409, 'Another request changed this record. Reload and retry.');
  if (error.code === 'P2002') return reply(409, 'A record with these details already exists.');
  if (error.code === 'P2025') return reply(404, 'The requested record was not found.');
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2021', 'P2022', 'P2024'].includes(error.code)) {
    console.error(JSON.stringify({ requestId, code: error.code, event: 'database_unavailable' }));
    return reply(503, 'The database is temporarily unavailable. Please try again shortly.');
  }
  if (error.status === 503) return reply(503, 'This service is temporarily unavailable. Please try again shortly.');
  console.error(JSON.stringify({ requestId, event: 'request_failed', code: error.code || 'unknown' }));
  return reply(500, 'The request could not be completed. Please try again.');
};
