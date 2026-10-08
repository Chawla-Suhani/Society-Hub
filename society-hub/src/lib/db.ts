import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

// SQLite file paths are resolved from the project root (same rule as prisma.config.ts).
const raw = process.env.DATABASE_URL || 'file:./dev.db';
const url = raw.startsWith('file:') ? `file:${path.resolve(process.cwd(), raw.slice(5))}` : raw;

// One client per process. In `next dev`, hot reloads would otherwise open a new connection every time.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = g.prisma ?? new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
if (process.env.NODE_ENV !== 'production') g.prisma = db;
