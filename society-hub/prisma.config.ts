import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// SQLite file paths are resolved from the project root, the same way src/lib/db.ts does it,
// so the CLI (migrate) and the running app always point at the same file.
const raw = process.env.DATABASE_URL || 'file:./dev.db';
const url = raw.startsWith('file:') ? `file:${path.resolve(process.cwd(), raw.slice(5))}` : raw;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url },
});
