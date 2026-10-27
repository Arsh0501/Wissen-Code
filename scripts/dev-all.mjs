import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import concurrently from 'concurrently';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverDirectory = path.join(root, 'server');
const transcriptionDirectory = path.join(root, 'services/transcription');
const checkOnly = process.argv.includes('--check');

export function tcpAvailable(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (connected) => {
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

export function endpoint(value, name, defaultPort) {
  try {
    const url = new URL(value);
    if (!url.hostname) throw new Error();
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || defaultPort) };
  } catch {
    throw new Error(`Set a valid ${name} in server/.env.`);
  }
}

export async function transcriptionAlreadyRunning(port) {
  if (!(await tcpAvailable('127.0.0.1', port))) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok && (await response.json()).ready === true) return true;
  } catch {
    // An occupied port must not be mistaken for a healthy transcription worker.
  }
  throw new Error(
    `Port ${port} is occupied but transcription is not healthy. Stop that process first.`,
  );
}

function pythonExecutable() {
  const executable = path.join(
    transcriptionDirectory,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  if (!existsSync(executable)) {
    throw new Error(
      'Transcription Python environment is missing. From the project root run:\n' +
        '  python -m venv services/transcription/.venv\n' +
        (process.platform === 'win32'
          ? '  services/transcription/.venv/Scripts/python.exe'
          : '  services/transcription/.venv/bin/python') +
        ' -m pip install -r services/transcription/requirements.txt',
    );
  }
  return executable;
}

async function ensureRedis(redis, allowStart) {
  if (await tcpAvailable(redis.host, redis.port)) return;
  // Start only the existing project's local Redis container. Never create a replacement database.
  if (allowStart && ['localhost', '127.0.0.1', '::1'].includes(redis.host)) {
    const container = 'wissen-code-redis-1';
    const inspected = spawnSync('docker', ['inspect', container], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    });
    if (inspected.status === 0) {
      const bindings = JSON.parse(inspected.stdout)[0]?.HostConfig?.PortBindings?.['6379/tcp'];
      if (bindings?.some((binding) => Number(binding.HostPort) === redis.port)) {
        console.log('[setup] Starting the existing local Redis container...');
        const started = spawnSync('docker', ['start', container], {
          encoding: 'utf8',
          timeout: 15000,
          windowsHide: true,
        });
        if (started.status === 0) {
          for (let attempt = 0; attempt < 10; attempt++) {
            if (await tcpAvailable(redis.host, redis.port)) return;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    }
  }
  throw new Error(
    'Redis is unreachable. Open Docker Desktop and start your Redis container, or check REDIS_URL.',
  );
}

export async function main() {
  // A child process uses the venv directly; credentials and paths never pass through a shell.
  if (process.argv.includes('--transcription')) {
    const child = spawn(pythonExecutable(), ['-u', 'server.py'], {
      cwd: transcriptionDirectory,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', () => {
      console.error(
        '[transcript] Could not start Python. Check the transcription virtual environment.',
      );
      process.exitCode = 1;
    });
    child.once('exit', (code) => {
      process.exitCode = code ?? 1;
    });
    return;
  }

  for (const directory of ['node_modules', 'server/node_modules', 'client/node_modules']) {
    if (!existsSync(path.join(root, directory))) {
      throw new Error('Dependencies are missing. Run npm install and npm run install:all first.');
    }
  }
  const environmentFile = path.join(serverDirectory, '.env');
  if (!existsSync(environmentFile)) throw new Error('Create and configure server/.env first.');
  const requireServer = createRequire(path.join(serverDirectory, 'package.json'));
  const { parse } = requireServer('dotenv');
  const environment = { ...parse(readFileSync(environmentFile)), ...process.env };
  const database = endpoint(environment.DATABASE_URL, 'DATABASE_URL', 5432);
  const redis = endpoint(environment.REDIS_URL, 'REDIS_URL', 6379);
  if (!environment.JWT_SECRET || environment.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET to at least 32 characters in server/.env.');
  }
  if (!environment.TRANSCRIPTION_TOKEN || !environment.TRANSCRIPTION_URL) {
    throw new Error('Set TRANSCRIPTION_TOKEN and TRANSCRIPTION_URL in server/.env.');
  }
  const python = pythonExecutable();
  const pythonCheck = spawnSync(python, ['-c', 'import dotenv, numpy, faster_whisper'], {
    cwd: transcriptionDirectory,
    stdio: 'ignore',
    timeout: 30000,
    windowsHide: true,
  });
  if (pythonCheck.status !== 0) {
    throw new Error('Install the transcription requirements into services/transcription/.venv.');
  }

  if (!(await tcpAvailable(database.host, database.port))) {
    throw new Error('PostgreSQL is unreachable. Start PostgreSQL and check DATABASE_URL.');
  }
  await ensureRedis(redis, !checkOnly);
  console.log(
    '[setup] PostgreSQL and Redis ports are reachable; Python dependencies are installed.',
  );

  const ports = [
    ['frontend', 3000],
    ['backend', Number(environment.PORT || 4001)],
  ];
  for (const [name, port] of ports) {
    if (await tcpAvailable('127.0.0.1', port)) {
      throw new Error(`Port ${port} (${name}) is already in use. Stop the previous process first.`);
    }
  }
  const reuseTranscription = await transcriptionAlreadyRunning(
    Number(environment.TRANSCRIPTION_PORT || 8765),
  );
  if (reuseTranscription) {
    console.log(
      '[setup] Reusing the healthy transcription service. It will remain running on exit.',
    );
  }
  if (checkOnly) {
    console.log('[setup] Checks passed. No application processes were started.');
    return;
  }

  console.log('[setup] Starting all services. Open http://localhost:3000 after startup.');
  console.log('[setup] The speech model may take time to load or download on its first run.');
  console.log(
    '[setup] Press Ctrl+C to stop launched processes. PostgreSQL and Redis stay running.',
  );
  const { result } = concurrently(
    [
      { name: 'api', command: 'npm run dev', cwd: serverDirectory },
      { name: 'web', command: 'npm run dev', cwd: path.join(root, 'client') },
      { name: 'ai', command: 'npm run worker', cwd: serverDirectory },
      { name: 'mail', command: 'npm run worker:mail', cwd: serverDirectory },
      { name: 'grading', command: 'npm run worker:grading', cwd: serverDirectory },
      ...(!reuseTranscription
        ? [{ name: 'transcript', command: 'node scripts/dev-all.mjs --transcription', cwd: root }]
        : []),
    ],
    { prefix: 'name', prefixColors: 'auto', killOthers: ['failure', 'success'] },
  );
  try {
    await result;
  } catch (events) {
    const interrupted =
      Array.isArray(events) &&
      events.every((event) => event.killed || event.exitCode === 0 || event.exitCode === 'SIGINT');
    if (!interrupted) {
      console.error('[setup] A service stopped unexpectedly. See its labeled log above.');
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[setup] ${error.message}`);
    process.exitCode = 1;
  });
}
