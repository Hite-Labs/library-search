// Run a .sql migration file against Neon.
//
//     node scripts/run-migration.mjs db/getting-started.sql          # dry run: inspect only
//     node scripts/run-migration.mjs db/getting-started.sql --apply  # actually run it
//
// Neon is shared between local dev and the droplet, so every run here touches PRODUCTION
// data. Hence the two-step: without --apply this connects, reports what the migration
// would change and what already exists, and writes nothing.
//
// Uses the @neondatabase/serverless driver already in the project rather than psql, which
// isn't installed on this machine.
//
// Reads NEON_DATABASE_URL from .env.local. This runs outside Next, so lib/env.ts isn't
// loaded — same minimal reader as scripts/whats-this-member-got.mjs.

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // Fall through to whatever is already in the environment.
  }
}
loadEnv();

const file = process.argv[2];
const apply = process.argv.includes('--apply');

if (!file) {
  console.error('Usage: node scripts/run-migration.mjs <file.sql> [--apply]');
  process.exit(1);
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('NEON_DATABASE_URL is not set (looked in .env.local and the environment).');
  process.exit(1);
}

const sql = neon(process.env.NEON_DATABASE_URL);
const source = readFileSync(file, 'utf8');

// What this migration intends to add, so the dry run can report on each piece. Parsed from
// the file rather than hardcoded, so it stays honest if the file changes. This used to check
// content_items only, which reported every other migration's columns as "will add" forever.
const tables = [...source.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map((m) => m[1]);
const touched = [
  ...new Set([...tables, ...[...source.matchAll(/ALTER TABLE (?:IF EXISTS )?(\w+)/gi)].map((m) => m[1])]),
];
const columns = [...source.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?(\w+)/gi)].map((m) => m[1]);
const indexes = [...source.matchAll(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+)/gi)].map((m) => m[1]);
const constraints = [...source.matchAll(/ADD CONSTRAINT (\w+)/gi)].map((m) => m[1]);
const functions = [...source.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/gi)].map((m) => m[1]);

async function inspect() {
  const existingTables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${touched})
  `;
  const haveTable = new Set(existingTables.map((r) => r.table_name));

  const existingCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${touched})
  `;
  const have = new Set(existingCols.map((r) => r.column_name));

  const existingIdx = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
  const haveIdx = new Set(existingIdx.map((r) => r.indexname));

  const existingCon = await sql`SELECT conname FROM pg_constraint`;
  const haveCon = new Set(existingCon.map((r) => r.conname));

  console.log('\n  tables:');
  for (const t of tables) {
    console.log(`    ${haveTable.has(t) ? 'EXISTS  ' : 'will add'}  ${t}`);
  }
  console.log('  columns:');
  for (const c of columns) {
    console.log(`    ${have.has(c) ? 'EXISTS  ' : 'will add'}  ${c}`);
  }
  console.log('  indexes:');
  for (const i of indexes) {
    console.log(`    ${haveIdx.has(i) ? 'EXISTS  ' : 'will add'}  ${i}`);
  }
  console.log('  constraints:');
  for (const c of constraints) {
    console.log(`    ${haveCon.has(c) ? 'EXISTS  ' : 'will add'}  ${c}`);
  }
  console.log('  functions:');
  for (const f of functions) {
    console.log(`    will replace  ${f}`);
  }

  const pieces = tables.length + columns.length + indexes.length;
  const alreadyApplied =
    pieces > 0 &&
    tables.every((t) => haveTable.has(t)) &&
    columns.every((c) => have.has(c)) &&
    indexes.every((i) => haveIdx.has(i));
  return { alreadyApplied };
}

console.log(`\nNeon: ${process.env.NEON_DATABASE_URL.replace(/:\/\/[^:]+:[^@]+@/, '://USER:PASS@')}`);
console.log(`\nMigration: ${file}`);
console.log(`Tables touched: ${touched.join(', ') || '(none parsed)'}`);

const { alreadyApplied } = await inspect();

if (!apply) {
  console.log('\nDRY RUN — nothing was written. Re-run with --apply to execute.\n');
  process.exit(0);
}

if (alreadyApplied) {
  console.log('\nEvery column already exists. Migration looks applied; not re-running.\n');
  process.exit(0);
}

// The file is one transaction (BEGIN … COMMIT). The HTTP driver can't send multiple
// statements in a single call, so the statements go through a transaction() batch instead,
// which is the same atomicity: all or nothing.
//
// Splitting on semicolons is safe for THIS file only because its one $$-quoted function
// body is handled explicitly below. A general splitter would need a real parser.
function splitStatements(text) {
  const withoutTxn = text.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, '');
  const out = [];
  let buf = '';
  let inDollar = false;
  for (const line of withoutTxn.split('\n')) {
    if (line.includes('$$')) {
      // A line may open or close the quoted body; count occurrences to handle both.
      const marks = (line.match(/\$\$/g) || []).length;
      if (marks % 2 === 1) inDollar = !inDollar;
    }
    buf += line + '\n';
    if (!inDollar && /;\s*$/.test(line)) {
      const stmt = buf.trim();
      // Drop comment-only chunks.
      if (stmt && !stmt.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('--'))) {
        out.push(stmt);
      }
      buf = '';
    }
  }
  return out;
}

const statements = splitStatements(source);
console.log(`\nApplying ${statements.length} statements in one transaction...`);

try {
  await sql.transaction(statements.map((s) => sql.query(s)));
  console.log('Done. Verifying...');
  await inspect();
  console.log('');
} catch (err) {
  console.error('\nFAILED — transaction rolled back, nothing changed:');
  console.error(String(err));
  process.exit(1);
}
