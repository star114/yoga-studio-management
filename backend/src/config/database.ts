import { Pool, types } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Keep PostgreSQL DATE (OID 1082) as raw string (YYYY-MM-DD)
// to avoid timezone shifts when serializing/deserializing dates.
types.setTypeParser(1082, (value: string) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err: Error) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

export default pool;
