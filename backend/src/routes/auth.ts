import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 로그인
router.post('/login',
  body('identifier').notEmpty().withMessage('이메일 또는 전화번호를 입력해주세요.'),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { identifier, password } = req.body as { identifier: string; password: string };
    const loginId = identifier.trim();

    try {
      const result = await pool.query(
        `
          SELECT u.*
          FROM yoga_users u
          LEFT JOIN yoga_customers c ON c.user_id = u.id
          WHERE u.email = $1
             OR regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')
                = regexp_replace($1, '[^0-9]', '', 'g')
          ORDER BY CASE WHEN u.email = $1 THEN 0 ELSE 1 END
          LIMIT 1
        `,
        [loginId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      // 고객인 경우 고객 정보도 함께 반환
      let customerInfo = null;
      if (user.role === 'customer') {
        const customerResult = await pool.query(
          'SELECT * FROM yoga_customers WHERE user_id = $1',
          [user.id]
        );
        customerInfo = customerResult.rows[0] || null;
      }

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        },
        customerInfo
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 현재 사용자 정보
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role FROM yoga_users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    // 고객인 경우 고객 정보도 함께 반환
    let customerInfo = null;
    if (user.role === 'customer') {
      const customerResult = await pool.query(
        'SELECT * FROM yoga_customers WHERE user_id = $1',
        [user.id]
      );
      customerInfo = customerResult.rows[0] || null;
    }

    res.json({ user, customerInfo });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 본인 비밀번호 변경
router.put('/password',
  authenticate,
  body('currentPassword').notEmpty().withMessage('현재 비밀번호를 입력해주세요.'),
  body('newPassword').isLength({ min: 6 }).withMessage('새 비밀번호는 6자 이상이어야 합니다.'),
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    try {
      const userResult = await pool.query(
        'SELECT id, password_hash FROM yoga_users WHERE id = $1',
        [req.user!.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const isValidCurrent = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidCurrent) {
        return res.status(400).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
      }

      const nextPasswordHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        'UPDATE yoga_users SET password_hash = $1 WHERE id = $2',
        [nextPasswordHash, req.user!.id]
      );

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;
