import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Set TURSO_DATABASE_URL before applying remote migrations.');

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const migrationsPath = join(process.cwd(), 'prisma', 'migrations');

async function migrate() {
  try {
    await client.execute('CREATE TABLE IF NOT EXISTS "_UdyogMigrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const migrations = (await readdir(migrationsPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of migrations) {
      const existing = await client.execute({ sql: 'SELECT "name" FROM "_UdyogMigrations" WHERE "name" = ?', args: [name] });
      if (existing.rows.length > 0) continue;
      const sql = await readFile(join(migrationsPath, name, 'migration.sql'), 'utf8');
      await client.executeMultiple(sql);
      await client.execute({ sql: 'INSERT INTO "_UdyogMigrations" ("name") VALUES (?)', args: [name] });
      console.log(`Applied ${name}`);
    }
  } finally {
    await client.close();
  }
}

void migrate();
