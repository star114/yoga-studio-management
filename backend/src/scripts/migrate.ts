import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database';

interface MigrationRecord {
  filename: string;
  checksum: string;
}

const migrationsDir = path.resolve(__dirname, '../../migrations');

const ensureMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getAppliedMigrations = async (): Promise<Map<string, string>> => {
  const result = await pool.query<MigrationRecord>(
    'SELECT filename, checksum FROM schema_migrations ORDER BY id ASC'
  );
  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
};

const getSqlFiles = async (): Promise<string[]> => {
  let entries;
  try {
    entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const checksumOf = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const runMigrations = async () => {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = await getSqlFiles();

  if (files.length === 0) {
    console.log('ℹ️ No migration files found.');
    return;
  }

  for (const filename of files) {
    const filePath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(filePath, 'utf8');
    const checksum = checksumOf(sql);
    const appliedChecksum = applied.get(filename);

    if (appliedChecksum) {
      if (appliedChecksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${filename}.`);
      }
      console.log(`⏭️  Skipping already applied migration: ${filename}`);
      continue;
    }

    console.log(`🚀 Applying migration: ${filename}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
      await client.query('COMMIT');
      console.log(`✅ Applied migration: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

runMigrations()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  });
