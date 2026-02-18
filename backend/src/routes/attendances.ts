import express from 'express';
import { body } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';

const router = express.Router();

// 출석 기록 조회 (필터링 가능)
router.get('/', authenticate, async (req, res) => {
  const { customer_id, start_date, end_date, limit = 50 } = req.query;

  try {
    let query = `
      SELECT 
        a.*,
        c.name as customer_name,
        u.email as instructor_email,
        m.id as membership_id
      FROM yoga_attendances a
      LEFT JOIN yoga_customers c ON a.customer_id = c.id
      LEFT JOIN yoga_users u ON a.instructor_id = u.id
      LEFT JOIN yoga_memberships m ON a.membership_id = m.id
      WHERE 1=1
    `;

    const params: Array<string | number> = [];
    let paramIndex = 1;

    if (typeof customer_id === 'string') {
      query += ` AND a.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (typeof start_date === 'string') {
      query += ` AND a.attendance_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (typeof end_date === 'string') {
      query += ` AND a.attendance_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 200)
      : 50;

    query += ` ORDER BY a.attendance_date DESC LIMIT $${paramIndex}`;
    params.push(safeLimit);

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get attendances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 출석 체크 (관리자)
router.post('/',
  authenticate,
  requireAdmin,
  body('customer_id').isInt(),
  validateRequest,
  async (req: AuthRequest, res) => {
    const { customer_id, membership_id, instructor_comment, class_type } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 활성 회원권 확인
      let activeMembership;
      if (membership_id) {
        const membershipResult = await client.query(
          `SELECT * FROM yoga_memberships 
           WHERE id = $1 AND customer_id = $2 AND is_active = true`,
          [membership_id, customer_id]
        );

        if (membershipResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid or inactive membership' });
        }
        activeMembership = membershipResult.rows[0];
      } else {
        // 회원권 지정 안 했으면 활성 회원권 중 가장 최근 것 사용
        const membershipResult = await client.query(
          `SELECT * FROM yoga_memberships 
           WHERE customer_id = $1 AND is_active = true
           ORDER BY created_at DESC LIMIT 1`,
          [customer_id]
        );

        if (membershipResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'No active membership found' });
        }
        activeMembership = membershipResult.rows[0];
      }

      // 횟수제 회원권인 경우 잔여 횟수 확인
      if (activeMembership.remaining_sessions !== null) {
        if (activeMembership.remaining_sessions <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'No remaining sessions' });
        }
      }

      // 기간제 회원권인 경우 기간 확인
      if (activeMembership.end_date) {
        const today = new Date();
        const endDate = new Date(activeMembership.end_date);
        if (today > endDate) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Membership expired' });
        }
      }

      // 출석 기록 생성
      const attendanceResult = await client.query(
        `INSERT INTO yoga_attendances 
         (customer_id, membership_id, instructor_comment, instructor_id, class_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          customer_id,
          activeMembership.id,
          instructor_comment || null,
          req.user!.id,
          class_type || null
        ]
      );

      // 횟수제 회원권인 경우 잔여 횟수 차감
      if (activeMembership.remaining_sessions !== null) {
        await client.query(
          `UPDATE yoga_memberships 
           SET remaining_sessions = remaining_sessions - 1
           WHERE id = $1`,
          [activeMembership.id]
        );
      }

      await client.query('COMMIT');

      res.status(201).json(attendanceResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Check attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  }
);

// 출석 기록 수정 (관리자)
router.put('/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { instructor_comment, class_type } = req.body;

    try {
      const result = await pool.query(
        `UPDATE yoga_attendances 
         SET instructor_comment = COALESCE($1, instructor_comment),
             class_type = COALESCE($2, class_type)
         WHERE id = $3
         RETURNING *`,
        [instructor_comment, class_type, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 출석 기록 삭제 (관리자)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 출석 기록 조회
    const attendanceResult = await client.query(
      'SELECT * FROM yoga_attendances WHERE id = $1',
      [id]
    );

    if (attendanceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const attendance = attendanceResult.rows[0];

    // 회원권 정보 조회
    const membershipResult = await client.query(
      'SELECT * FROM yoga_memberships WHERE id = $1',
      [attendance.membership_id]
    );

    if (membershipResult.rows.length > 0) {
      const membership = membershipResult.rows[0];
      
      // 횟수제 회원권인 경우 잔여 횟수 복원
      if (membership.remaining_sessions !== null) {
        await client.query(
          `UPDATE yoga_memberships 
           SET remaining_sessions = remaining_sessions + 1
           WHERE id = $1`,
          [membership.id]
        );
      }
    }

    // 출석 기록 삭제
    await client.query('DELETE FROM yoga_attendances WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// 오늘의 출석 현황
router.get('/today', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.*,
        c.name as customer_name,
        c.phone as customer_phone
      FROM yoga_attendances a
      LEFT JOIN yoga_customers c ON a.customer_id = c.id
      WHERE DATE(a.attendance_date) = CURRENT_DATE
      ORDER BY a.attendance_date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get today attendances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
