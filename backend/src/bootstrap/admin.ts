import bcrypt from 'bcrypt';
import pool from '../config/database';

export const ensureAdminUser = async (): Promise<void> => {
  const adminLoginId = process.env.ADMIN_ID || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.warn('⚠️ ADMIN_PASSWORD is not set; skipping admin bootstrap');
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const result = await pool.query(
    `INSERT INTO yoga_users (login_id, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (login_id) DO NOTHING`,
    [adminLoginId, passwordHash]
  );

  if (result.rowCount === 1) {
    console.log(`✅ Admin account ensured: ${adminLoginId}`);
    return;
  }

  console.log(`ℹ️ Admin account already exists, bootstrap skipped: ${adminLoginId}`);
};
