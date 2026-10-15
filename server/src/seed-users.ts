import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MOCK_USERS = [
  { name: 'Ava Patel', email: 'admin@wissen.dev', password: 'Admin@123', role: 'admin' },
  { name: 'Rahul Singh', email: 'rahul@wissen.dev', password: 'Candidate@123', role: 'candidate' },
  { name: 'Maria Gomez', email: 'maria@wissen.dev', password: 'Candidate@123', role: 'candidate' },
  { name: 'Alex Chen', email: 'alex@wissen.dev', password: 'Candidate@123', role: 'candidate' },
  { name: 'Priya Sharma', email: 'priya@wissen.dev', password: 'Candidate@123', role: 'candidate' },
];

async function main() {
  console.log('Seeding demo users...');
  for (const u of MOCK_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        password: hash,
        role: u.role,
      }
    });
  }
  console.log('Demo Users seeded successfully!');
}

main().finally(() => prisma.$disconnect());
