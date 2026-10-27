// One-time provisioning tool. Reads JSON from stdin to keep the password out of shell history.
const { readFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid admin email.');
  if (
    typeof input.password !== 'string' ||
    input.password.length < 12 ||
    input.password.length > 128
  )
    throw new Error('Use an admin password between 12 and 128 characters.');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('That account already exists. No account or role was changed.');
  await prisma.user.create({
    data: {
      email,
      name: 'Administrator',
      password: await bcrypt.hash(input.password, 12),
      role: 'admin',
    },
  });
  console.log('Administrator created. Sign in through your deployed frontend.');
}

main()
  .catch((error) => {
    console.error(
      error.message.startsWith('Enter ') ||
        error.message.startsWith('Use ') ||
        error.message.startsWith('That account')
        ? error.message
        : 'Administrator creation failed. Check the database connection and migrations.',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
