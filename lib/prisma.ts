import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
let shutdownRegistered = false;

function createPrismaClient(): PrismaClient {
  if (!connectionString) {
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        throw new Error(
          `[db] Prisma client not initialized: DATABASE_URL is not configured. ` +
          `Attempted to access "prisma.${String(prop)}". ` +
          `Please set DATABASE_URL in your .env.local file.`
        );
      },
    }) as unknown as PrismaClient;
  }

  const pool = new Pool({ connectionString });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });

  // 应用退出时优雅关闭（只注册一次）
  if (!shutdownRegistered) {
    shutdownRegistered = true;
    process.on('beforeExit', async () => {
      await client.$disconnect();
      await pool.end();
    });
  }

  return client;
}

export const prisma = createPrismaClient();
