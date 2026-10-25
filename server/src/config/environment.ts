import { config } from 'dotenv';
import path from 'node:path';

// Resolve from this module so API, workers and CLI tools agree regardless of cwd.
const serverRoot = path.resolve(__dirname, '../..');
const environment = process.env.NODE_ENV || 'development';
if (!['development', 'test', 'staging', 'production'].includes(environment))
  throw new Error('NODE_ENV must be development, test, staging or production');

// Injected environment always wins. Files are loaded from most to least specific.
const specificFiles = [`.env.${environment}.local`, `.env.${environment}`];
const files = environment === 'development'
  ? [...specificFiles, '.env.local', '.env']
  : specificFiles;
for (const file of files) config({ path: path.join(serverRoot, file) });

export function validateEnvironment() {
  const errors: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    errors.push('JWT_SECRET must contain at least 32 characters (run npm run setup:local for development)');
  for (const [key, protocols] of [
    ['DATABASE_URL', ['postgres:', 'postgresql:']],
    ['REDIS_URL', ['redis:', 'rediss:']],
  ] as const) {
    try {
      const url = new URL(process.env[key] || '');
      if (!(protocols as readonly string[]).includes(url.protocol)) throw new Error();
    } catch { errors.push(`${key} must be a valid ${protocols.join(' or ')} URL`); }
  }
  const port = Number(process.env.PORT || 4001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    errors.push('PORT must be an integer between 1 and 65535');
  if (process.env.JUDGE_MODE && !['mock', 'live'].includes(process.env.JUDGE_MODE))
    errors.push('JUDGE_MODE must be mock or live');
  if (environment === 'production' || environment === 'staging') {
    if (process.env.JUDGE_MODE !== 'live') errors.push('JUDGE_MODE must be live in staging and production');
    for (const key of ['APP_URL', 'CORS_ORIGINS']) {
      const urls = (process.env[key] || '').split(',');
      if (urls.some(value => { try { return new URL(value.trim()).protocol !== 'https:'; } catch { return true; } }))
        errors.push(`${key} must contain explicit HTTPS origins`);
    }
  }
  if (errors.length) throw new Error(`Invalid server configuration:\n- ${errors.join('\n- ')}`);
  return { environment, port };
}
