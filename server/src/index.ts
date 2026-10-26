import { validateEnvironment } from './config/environment';
import http from 'node:http';
import app from './app';
import prisma from './prisma';
import { initSocketServer } from './socket';
import { isMockMode } from './services/judge0';
import { deliverOutbox } from './platform/communication';
import { deliverWebhooks } from './platform/webhooks';
import { sweepUngradedAttempts } from './platform/inline-grading';
import { sweepAssessmentAutomation } from './platform/batch';
import { finalizeSession } from './routes/attempts';
import { asynchronousGrading } from './platform/grading-jobs';

const { port, environment } = validateEnvironment();
const server = http.createServer(app);
const io = initSocketServer(server);

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Stop the other API process or set PORT and API_PROXY_TARGET together.`
    : `API startup failed: ${error.message}`);
  process.exit(1);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  if (outboxTimer) clearTimeout(outboxTimer);
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exit(0);
  });
  io.disconnectSockets(true);
  server.closeIdleConnections();
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
// Drain the email/webhook outbox from the API process itself unless a dedicated
// worker is in charge (OUTBOX_INLINE=false). Claims are atomic, so both may run together.
const inlineOutbox = process.env.OUTBOX_INLINE !== 'false';
let outboxTimer: NodeJS.Timeout | undefined;
let outboxTicks = 0;
async function drainOutbox() {
  if (closing) return;
  try {
    await deliverOutbox();
    await deliverWebhooks();
    // Batch automation (auto-shortlist when a batch closes) runs about once a minute.
    if (outboxTicks++ % 6 === 0) await sweepAssessmentAutomation();
  } catch (error) {
    console.error('Outbox processing failed:', error instanceof Error ? error.message : error);
  }
  if (!closing) outboxTimer = setTimeout(() => void drainOutbox(), 10000);
}

server.listen(port, () => {
  console.log(`Wissen Code API: http://localhost:${port} (${environment})`);
  console.log(`Judge: ${isMockMode() ? 'mock' : 'live'} | Database: PostgreSQL`);
  if (inlineOutbox) {
    console.log('Outbox: delivered inline every 10s (set OUTBOX_INLINE=false to use npm run worker:mail only)');
    void drainOutbox();
  }
  if (!asynchronousGrading())
    void sweepUngradedAttempts(finalizeSession)
      .then((n) => n && console.log(`Grading: re-queued ${n} submitted attempt(s) left ungraded`))
      .catch((error) => console.error('Grading sweep failed:', error instanceof Error ? error.message : error));
});

export default app;
