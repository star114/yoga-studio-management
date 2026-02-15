import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 로그인
router.post('/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await pool.query(
        'SELECT * FROM yoga_users WHERE email = $1',
        [email]
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

export default router;
