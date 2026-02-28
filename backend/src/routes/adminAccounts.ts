import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticate, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, login_id, created_at, updated_at
       FROM yoga_users
       WHERE role = 'admin'
       ORDER BY created_at DESC, id DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get admin accounts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticate,
  requireAdmin,
  body('login_id').trim().notEmpty().withMessage('login_id is required'),
  body('password').isString().isLength({ min: 4 }).withMessage('password must be at least 4 chars'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const loginId = String(req.body.login_id).trim();
    const password = String(req.body.password);

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `INSERT INTO yoga_users (login_id, password_hash, role)
         VALUES ($1, $2, 'admin')
         RETURNING id, login_id, created_at, updated_at`,
        [loginId, passwordHash]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      console.error('Create admin account error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Login ID already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put(
  '/:id/password',
  authenticate,
  requireAdmin,
  body('password').isString().isLength({ min: 4 }).withMessage('password must be at least 4 chars'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const password = String(req.body.password);

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `UPDATE yoga_users
         SET password_hash = $1
         WHERE id = $2
           AND role = 'admin'
         RETURNING id`,
        [passwordHash, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Admin account not found' });
      }

      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Reset admin password error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const targetId = Number(id);

  if (!Number.isFinite(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid admin id' });
  }

  if (req.user?.id === targetId) {
    return res.status(400).json({ error: 'Cannot delete your own admin account' });
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS admin_count
       FROM yoga_users
       WHERE role = 'admin'`
    );
    const adminCount = Number(countResult.rows[0].admin_count);
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'At least one admin account must remain' });
    }

    const result = await pool.query(
      `DELETE FROM yoga_users
       WHERE id = $1
         AND role = 'admin'
       RETURNING id`,
      [targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin account not found' });
    }

    res.json({ message: 'Admin account deleted successfully' });
  } catch (error: any) {
    if (error?.code === '23503') {
      return res.status(400).json({
        error: 'Admin account is referenced by existing attendance records',
      });
    }
    console.error('Delete admin account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
