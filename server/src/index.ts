import { validateEnvironment } from './config/environment';
import http from 'node:http';
import app from './app';
import prisma from './prisma';
import { initSocketServer } from './socket';
import { isMockMode } from './services/judge0';

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
server.listen(port, () => {
  console.log(`Wissen Code API: http://localhost:${port} (${environment})`);
  console.log(`Judge: ${isMockMode() ? 'mock' : 'live'} | Database: PostgreSQL`);
});

export default app;
