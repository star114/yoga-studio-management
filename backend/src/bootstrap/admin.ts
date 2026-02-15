import bcrypt from 'bcrypt';
import pool from '../config/database';

export const ensureAdminUser = async (): Promise<void> => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('⚠️ ADMIN_EMAIL or ADMIN_PASSWORD is not set; skipping admin bootstrap');
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await pool.query(
    `INSERT INTO yoga_users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role = 'admin',
         updated_at = CURRENT_TIMESTAMP`,
    [adminEmail, passwordHash]
  );

  console.log(`✅ Admin account ensured: ${adminEmail}`);
};
