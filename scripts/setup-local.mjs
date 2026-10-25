import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const target = new URL('server/.env', root);
let content = readFileSync(existsSync(target) ? target : new URL('server/.env.example', root), 'utf8');
const match = content.match(/^JWT_SECRET\s*=\s*(.*)$/m);
const secret = match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2') || '';
if (secret.length < 32) {
  const setting = `JWT_SECRET="${randomBytes(48).toString('hex')}"`;
  content = match ? content.replace(/^JWT_SECRET\s*=.*$/m, setting) : `${content}\n${setting}\n`;
  writeFileSync(target, content, { mode: 0o600 });
  chmodSync(target, 0o600);
  console.log('Generated a private local JWT secret. Existing sessions must sign in again.');
} else if (!existsSync(target)) writeFileSync(target, content, { mode: 0o600 });
const client = new URL('client/.env.local', root);
if (!existsSync(client)) writeFileSync(client, readFileSync(new URL('client/.env.example', root)));
console.log(`Local configuration ready in ${fileURLToPath(root)}. Database credentials were preserved.`);
console.log('Next: npm run doctor, npm run db:setup, then npm run dev.');
