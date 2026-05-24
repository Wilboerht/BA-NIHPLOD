import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL?.replace(/^["']|["']$/g, '');

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

  // 应用退出时优雅关闭
  const shutdownHandler = async () => {
    await client.$disconnect();
    await pool.end();
  };
  process.on('beforeExit', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
