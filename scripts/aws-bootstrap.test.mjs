import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../deployment/aws/bootstrap-admin.cjs', import.meta.url),
  'utf8',
);

async function bootstrap(input, existing = null) {
  const created = [];
  const messages = [];
  const process = { exitCode: 0 };
  let disconnected = false;
  class PrismaClient {
    user = {
      findUnique: async () => existing,
      create: async (value) => created.push(value.data),
    };
    async $disconnect() {
      disconnected = true;
    }
  }
  await vm.runInNewContext(source, {
    process,
    console: {
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    },
    require: (name) => {
      if (name === 'node:fs') return { readFileSync: () => JSON.stringify(input) };
      if (name === '@prisma/client') return { PrismaClient };
      if (name === 'bcryptjs') return { hash: async () => 'hashed-password' };
      throw new Error('Unexpected dependency');
    },
  });
  return { created, messages, process, disconnected };
}

test('cloud bootstrap creates a normalized admin with a hashed password without logging credentials', async () => {
  const result = await bootstrap({
    email: ' Admin@Example.com ',
    password: 'private-password-123',
  });
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].email, 'admin@example.com');
  assert.equal(result.created[0].password, 'hashed-password');
  assert.equal(result.created[0].role, 'admin');
  assert.ok(!result.messages.join(' ').includes('private-password-123'));
  assert.equal(result.disconnected, true);
});

test('cloud bootstrap cannot overwrite or promote an existing account', async () => {
  const result = await bootstrap(
    { email: 'person@example.com', password: 'private-password-123' },
    { role: 'candidate' },
  );
  assert.equal(result.created.length, 0);
  assert.equal(result.process.exitCode, 1);
  assert.ok(result.messages[0].includes('No account or role was changed'));
});

test('cloud bootstrap rejects invalid credentials before creating any account', async () => {
  for (const input of [
    { email: 'invalid', password: 'private-password-123' },
    { email: 'person@example.com', password: 'short' },
  ]) {
    const result = await bootstrap(input);
    assert.equal(result.created.length, 0);
    assert.equal(result.process.exitCode, 1);
    assert.equal(result.disconnected, true);
  }
});
