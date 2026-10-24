import { validateEnvironment } from './environment';
import { Prisma, PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

async function main() {
  validateEnvironment();
  console.log('Configuration: valid');
  const db = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    const checks = await Promise.allSettled([
      (async () => {
        await db.$queryRaw`SELECT 1`;
        const tables = await db.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`;
        const present = new Set(tables.map(row => row.table_name));
        const missing = Prisma.dmmf.datamodel.models.filter(model => !present.has(model.dbName || model.name));
        if (missing.length) throw new Error(`Missing tables: ${missing.map(model => model.name).join(', ')}`);
        const failed = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
        if (Number(failed[0].count)) throw new Error('Unfinished database migration');
        return 'PostgreSQL: reachable; all application tables and migration history available';
      })(),
      (async () => { await redis.connect(); await redis.ping(); return 'Redis: reachable'; })(),
    ]);
    for (const [index, result] of checks.entries()) {
      if (result.status === 'fulfilled') console.log(result.value);
      else {
        console.error(`${index === 0 ? 'PostgreSQL' : 'Redis'}: unavailable. ${index === 0 ? 'Check DATABASE_URL and run npm run db:setup.' : 'Start Redis and check REDIS_URL.'}`);
        console.error(result.reason instanceof Error ? result.reason.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database URL]') : 'Dependency check failed');
        process.exitCode = 1;
      }
    }
  } finally { redis.disconnect(); await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
