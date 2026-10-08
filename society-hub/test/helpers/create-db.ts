// Builds an empty SQLite database straight from prisma/schema.prisma, so tests never depend on migrations
// or on a shared dev.db. (Real databases are created with `npx prisma migrate dev`.)
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getDMMF } from '@prisma/internals';

const SQL_TYPE: Record<string, string> = { Int: 'INTEGER', String: 'TEXT', Boolean: 'BOOLEAN', DateTime: 'DATETIME', Float: 'REAL' };

type Field = {
  name: string; kind: string; type: string; isRequired: boolean; isId: boolean; isUnique: boolean; isList: boolean;
  default?: unknown; relationFromFields?: string[]; relationToFields?: string[];
};

function literal(def: unknown): string | null {
  if (def === undefined || def === null) return null;
  if (typeof def === 'object') return (def as { name?: string }).name === 'now' ? 'CURRENT_TIMESTAMP' : null; // autoincrement etc.
  if (typeof def === 'boolean') return def ? '1' : '0';
  if (typeof def === 'number') return String(def);
  return `'${String(def).replace(/'/g, "''")}'`;
}

export async function buildDdl(): Promise<string[]> {
  const dmmf = await getDMMF({ datamodel: fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8') });
  const out: string[] = [];
  const indexes: string[] = [];
  for (const model of dmmf.datamodel.models) {
    const fields = model.fields as unknown as Field[];
    const cols: string[] = [];
    for (const f of fields.filter((x) => x.kind === 'scalar' || x.kind === 'enum')) {
      const type = f.kind === 'enum' ? 'TEXT' : SQL_TYPE[f.type];
      const auto = typeof f.default === 'object' && (f.default as { name?: string })?.name === 'autoincrement';
      let col = `"${f.name}" ${type}`;
      if (f.isRequired) col += ' NOT NULL';
      if (f.isId) col += auto ? ' PRIMARY KEY AUTOINCREMENT' : ' PRIMARY KEY';
      const lit = literal(f.default);
      if (lit && !f.isId) col += ` DEFAULT ${lit}`;
      cols.push(col);
    }
    for (const f of fields.filter((x) => x.kind === 'object' && x.relationFromFields?.length)) {
      const onDelete = f.isRequired ? 'RESTRICT' : 'SET NULL';
      cols.push(`FOREIGN KEY (${f.relationFromFields!.map((c) => `"${c}"`).join(', ')}) REFERENCES "${f.type}" (${f.relationToFields!.map((c) => `"${c}"`).join(', ')}) ON DELETE ${onDelete} ON UPDATE CASCADE`);
    }
    out.push(`CREATE TABLE "${model.name}" (\n  ${cols.join(',\n  ')}\n)`);
    for (const f of fields.filter((x) => x.isUnique && !x.isId)) indexes.push(`CREATE UNIQUE INDEX "${model.name}_${f.name}_key" ON "${model.name}"("${f.name}")`);
    for (const u of model.uniqueFields as string[][]) indexes.push(`CREATE UNIQUE INDEX "${model.name}_${u.join('_')}_key" ON "${model.name}"(${u.map((c) => `"${c}"`).join(', ')})`);
  }
  return [...out, ...indexes];
}

export async function createDb(file: string): Promise<void> {
  fs.rmSync(file, { force: true });
  const sqlite = new Database(file);
  for (const stmt of await buildDdl()) sqlite.exec(stmt);
  sqlite.close();
}
