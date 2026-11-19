#!/usr/bin/env node
/**
 * Copy the local SQLite database into a persistent libSQL/Turso database.
 *
 * Usage:
 *   npm run db:migrate:turso
 *
 * Required environment variables:
 *   TURSO_DATABASE_URL   libsql://... or https://...
 *   TURSO_AUTH_TOKEN     token created for that database
 *
 * Optional:
 *   DATABASE_PATH        source SQLite file (defaults to app/data/aiglorythm.db)
 *   TARGET_DATABASE_URL  alternative target, useful for testing with a local file
 *   --replace            overwrite rows that already exist in the target
 *
 * The script is idempotent. By default it inserts only rows that are missing
 * from the target so a second run cannot overwrite newer production data.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'libsql';

const DB_FILENAME = 'aiglorythm.db';
const replaceExisting = process.argv.includes('--replace');

// Next.js loads .env.local automatically; this standalone script does not.
function loadEnvFile(filename) {
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function resolveSourcePath() {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  const candidates = [
    path.join(process.cwd(), 'app', 'data', DB_FILENAME),
    path.join(process.cwd(), 'data', DB_FILENAME),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function normalizeTargetUrl(value) {
  const trimmed = value.trim();
  if (/^file:\/\//i.test(trimmed)) {
    const filePath = decodeURIComponent(trimmed.replace(/^file:\/\//i, ''));
    return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  }
  return trimmed;
}

const sourcePath = resolveSourcePath();
const targetUrl = (
  process.env.TURSO_DATABASE_URL ||
  process.env.LIBSQL_DATABASE_URL ||
  process.env.TARGET_DATABASE_URL ||
  ''
).trim();
const authToken = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim();

if (!fs.existsSync(sourcePath)) {
  console.error(`Source database not found: ${sourcePath}`);
  process.exit(1);
}

if (!targetUrl) {
  console.error(
    'Missing target database. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, ' +
      'or TARGET_DATABASE_URL for a local test target.',
  );
  process.exit(1);
}

const targetFilename = normalizeTargetUrl(targetUrl);
const isRemoteTarget = /^(libsql|https?|wss?):\/\//i.test(targetFilename);
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = new Database(targetFilename, authToken ? { authToken } : {});

const copyOrder = [
  'users',
  'profiles',
  'membership_applications',
  'events',
  'event_registrations',
  'opportunities',
  'bookmarks',
  'team_members',
  'partners',
  'testimonials',
  'announcements',
  'media',
  'inquiries',
  'site_settings',
  'page_sections',
  'content_versions',
  'notifications',
  'password_reset_tokens',
  'email_verification_tokens',
];

function orderedTables(tables) {
  const known = copyOrder.filter((name) => tables.includes(name));
  const remaining = tables.filter((name) => !known.includes(name)).sort();
  return [...known, ...remaining];
}

function createSchema() {
  const objects = source
    .prepare(
      "SELECT type, name, sql FROM sqlite_master " +
        "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND type IN ('table','index')",
    )
    .all();
  const existing = new Set(
    target
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')")
      .all()
      .map((row) => row.name),
  );

  const tables = objects.filter((object) => object.type === 'table').map((object) => object.name);
  const indexes = objects.filter((object) => object.type === 'index');

  for (const object of [...objects.filter((entry) => entry.type === 'table'), ...indexes]) {
    if (existing.has(object.name)) continue;
    const sql = object.sql
      .replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/^CREATE UNIQUE INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
      .replace(/^CREATE INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
    target.exec(sql);
  }

  return { tables: orderedTables(tables), indexCount: indexes.length };
}

function copyTable(table, verb) {
  const columns = source
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .map((column) => column.name);
  if (!columns.length) return { copied: 0, total: 0 };

  const rows = source
    .prepare(`SELECT ${columns.map(quoteIdentifier).join(',')} FROM ${quoteIdentifier(table)}`)
    .all();
  if (!rows.length) return { copied: 0, total: 0 };

  const statement = target.prepare(
    `${verb} INTO ${quoteIdentifier(table)} (${columns
      .map(quoteIdentifier)
      .join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
  );
  const insertBatch = target.transaction((batch) => {
    for (const row of batch) statement.run(...columns.map((column) => row[column]));
  });

  let copied = 0;
  for (let index = 0; index < rows.length; index += 200) {
    const before = Number(
      target.prepare(`SELECT count(*) AS n FROM ${quoteIdentifier(table)}`).get()?.n ?? 0,
    );
    insertBatch(rows.slice(index, index + 200));
    const after = Number(
      target.prepare(`SELECT count(*) AS n FROM ${quoteIdentifier(table)}`).get()?.n ?? 0,
    );
    copied += Math.max(0, after - before);
  }
  return { copied, total: rows.length };
}

try {
  console.log(`Source: ${sourcePath}`);
  console.log(`Target: ${isRemoteTarget ? targetFilename : path.resolve(targetFilename)}`);
  console.log(replaceExisting ? 'Mode: replace existing rows' : 'Mode: insert missing rows only');

  const { tables, indexCount } = createSchema();
  console.log(
    `Schema ready (${tables.length} tables, ${indexCount} indexes). Copying data...`,
  );

  const verb = replaceExisting ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
  let copied = 0;
  let rows = 0;
  for (const table of tables) {
    const result = copyTable(table, verb);
    copied += result.copied;
    rows += result.total;
    console.log(`  ${table}: ${result.total} source rows, ${result.copied} written`);
  }

  let mismatches = 0;
  for (const table of tables) {
    const sourceCount = Number(
      source.prepare(`SELECT count(*) AS n FROM ${quoteIdentifier(table)}`).get()?.n ?? 0,
    );
    const targetCount = Number(
      target.prepare(`SELECT count(*) AS n FROM ${quoteIdentifier(table)}`).get()?.n ?? 0,
    );
    if (sourceCount !== targetCount) {
      mismatches += 1;
      console.warn(`  Count mismatch in ${table}: source ${sourceCount}, target ${targetCount}`);
    }
  }

  console.log(`Done. ${copied} of ${rows} source rows written.`);
  if (mismatches) {
    console.error(`${mismatches} table(s) have different row counts. Review the output above.`);
    process.exitCode = 1;
  }
} finally {
  source.close();
  target.close();
}
