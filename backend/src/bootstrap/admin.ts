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

  await pool.query(
    `INSERT INTO yoga_users (login_id, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (login_id) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role = 'admin',
         updated_at = CURRENT_TIMESTAMP`,
    [adminLoginId, passwordHash]
  );

  console.log(`✅ Admin account ensured: ${adminLoginId}`);
};
