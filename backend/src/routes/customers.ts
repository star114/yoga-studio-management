import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 모든 고객 조회 (관리자)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        c.phone AS login_id,
        COUNT(DISTINCT m.id) as membership_count,
        COUNT(DISTINCT a.id) as total_attendance
      FROM yoga_customers c
      LEFT JOIN yoga_memberships m ON c.id = m.customer_id
      LEFT JOIN yoga_attendances a ON c.id = a.customer_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 특정 고객 조회
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;

  // 일반 사용자는 자기 정보만 조회 가능
  if (req.user!.role !== 'admin') {
    const checkResult = await pool.query(
      'SELECT id FROM yoga_customers WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  try {
    const customerResult = await pool.query(`
      SELECT
        c.*,
        c.phone AS login_id
      FROM yoga_customers c
      WHERE c.id = $1
    `, [id]);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 회원권 정보
    const membershipsResult = await pool.query(`
      SELECT m.*, mt.name as membership_type_name
      FROM yoga_memberships m
      LEFT JOIN yoga_membership_types mt ON m.membership_type_id = mt.id
      WHERE m.customer_id = $1
      ORDER BY m.created_at DESC
    `, [id]);

    // 최근 출석 기록
    const attendancesResult = await pool.query(`
      SELECT
        a.*,
        u.login_id as instructor_email,
        cls.id as class_id,
        cls.title as class_title,
        cls.class_date,
        cls.start_time as class_start_time,
        cls.end_time as class_end_time,
        COALESCE(a.class_type, cls.title) as class_type
      FROM yoga_attendances a
      LEFT JOIN yoga_users u ON a.instructor_id = u.id
      LEFT JOIN yoga_classes cls ON cls.id = a.class_id
      WHERE a.customer_id = $1
      ORDER BY a.attendance_date DESC
      LIMIT 20
    `, [id]);

    res.json({
      customer: customerResult.rows[0],
      memberships: membershipsResult.rows,
      recentAttendances: attendancesResult.rows
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 고객 생성 (관리자)
router.post('/',
  authenticate,
  requireAdmin,
  body('name').notEmpty(),
  body('phone').trim().notEmpty().withMessage('전화번호는 필수입니다.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, phone, birth_date, gender, address, notes } = req.body as {
      name: string;
      phone: string;
      birth_date?: string;
      gender?: string;
      address?: string;
      notes?: string;
    };
    const trimmedPhone = (phone || '').trim();

    if (!trimmedPhone) {
      return res.status(400).json({ error: '전화번호는 필수입니다.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (trimmedPhone) {
        const phoneCheck = await client.query(
          `SELECT id
           FROM yoga_customers
           WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
                 = regexp_replace($1, '[^0-9]', '', 'g')
           LIMIT 1`,
          [trimmedPhone]
        );
        if (phoneCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Phone already exists' });
        }
      }

      // 사용자 계정 생성
      const passwordHash = await bcrypt.hash('12345', 10);
      const loginId = trimmedPhone;
      const userResult = await client.query(
        'INSERT INTO yoga_users (login_id, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [loginId, passwordHash, 'customer']
      );

      const userId = userResult.rows[0].id;

      // 고객 정보 생성
      const customerResult = await client.query(
        `INSERT INTO yoga_customers (user_id, name, phone, birth_date, gender, address, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [userId, name, trimmedPhone, birth_date || null, gender || null, address || null, notes || null]
      );

      await client.query('COMMIT');

      res.status(201).json(customerResult.rows[0]);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Create customer error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Login ID already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  }
);

// 고객 정보 수정 (관리자)
router.put('/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { name, phone, birth_date, gender, address, notes } = req.body;

    try {
      const result = await pool.query(
        `UPDATE yoga_customers 
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             birth_date = COALESCE($3, birth_date),
             gender = COALESCE($4, gender),
             address = COALESCE($5, address),
             notes = COALESCE($6, notes)
         WHERE id = $7
         RETURNING *`,
        [name, phone, birth_date, gender, address, notes, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update customer error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 고객 비밀번호 초기화 (관리자)
router.put(
  '/:id/password',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const defaultPassword = '12345';

    try {
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      const result = await pool.query(
        `UPDATE yoga_users u
         SET password_hash = $1
         FROM yoga_customers c
         WHERE c.id = $2
           AND u.id = c.user_id
         RETURNING u.id`,
        [passwordHash, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      res.json({ message: 'Password reset successfully', defaultPassword });
    } catch (error) {
      console.error('Reset customer password error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 고객 삭제 (관리자)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // user_id 조회
    const customerResult = await client.query(
      'SELECT user_id FROM yoga_customers WHERE id = $1',
      [id]
    );

    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }

    const userId = customerResult.rows[0].user_id;

    // 고객 삭제 (CASCADE로 관련 데이터 자동 삭제)
    await client.query('DELETE FROM yoga_users WHERE id = $1', [userId]);

    await client.query('COMMIT');

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
