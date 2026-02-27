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
    const customerIdFilter =
      typeof customer_id === 'string' && customer_id.trim() !== ''
        ? customer_id.trim()
        : null;
    const startDateFilter =
      typeof start_date === 'string' && start_date.trim() !== ''
        ? start_date.trim()
        : null;
    const endDateFilter =
      typeof end_date === 'string' && end_date.trim() !== ''
        ? end_date.trim()
        : null;

    let query = `
      SELECT 
        a.*,
        c.name as customer_name,
        u.login_id as instructor_email,
        m.id as membership_id,
        cls.id as class_id,
        cls.title as class_title,
        cls.class_date,
        cls.start_time as class_start_time,
        cls.end_time as class_end_time,
        COALESCE(a.class_type, cls.title) as class_type
      FROM yoga_attendances a
      LEFT JOIN yoga_customers c ON a.customer_id = c.id
      LEFT JOIN yoga_users u ON a.instructor_id = u.id
      LEFT JOIN yoga_memberships m ON a.membership_id = m.id
      LEFT JOIN yoga_classes cls ON cls.id = a.class_id
      WHERE 1=1
    `;

    const params: Array<string | number> = [];
    let paramIndex = 1;

    if (customerIdFilter) {
      query += ` AND a.customer_id = $${paramIndex}`;
      params.push(customerIdFilter);
      paramIndex++;
    }

    if (startDateFilter) {
      query += ` AND a.attendance_date >= $${paramIndex}`;
      params.push(startDateFilter);
      paramIndex++;
    }

    if (endDateFilter) {
      query += ` AND a.attendance_date <= $${paramIndex}`;
      params.push(endDateFilter);
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
  body('class_id').isInt({ min: 1 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const { customer_id, membership_id, class_type, class_id } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let resolvedClassId: number | null = null;
      let resolvedClassType = typeof class_type === 'string' ? class_type.trim() : '';

      const classId = Number(class_id);
      const classResult = await client.query(
        `SELECT cls.id, cls.title
         FROM yoga_classes cls
         INNER JOIN yoga_class_registrations reg ON reg.class_id = cls.id
         WHERE cls.id = $1 AND reg.customer_id = $2
         FOR UPDATE OF reg
         LIMIT 1`,
        [classId, customer_id]
      );

      if (classResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class not found or customer not registered' });
      }

      resolvedClassId = classResult.rows[0].id as number;
      if (!resolvedClassType) {
        resolvedClassType = String(classResult.rows[0].title ?? '').trim();
      }

      const existingAttendanceResult = await client.query(
        `SELECT id
         FROM yoga_attendances
         WHERE class_id = $1
           AND customer_id = $2
         LIMIT 1`,
        [resolvedClassId, customer_id]
      );

      if (existingAttendanceResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Attendance already exists for this class and customer' });
      }

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
        // 회원권 지정이 없으면 수업명과 회원권명 일치 항목을 우선 선택
        const membershipResult = await client.query(
          `SELECT m.*, mt.name AS membership_type_name
           FROM yoga_memberships m
           LEFT JOIN yoga_membership_types mt ON mt.id = m.membership_type_id
           WHERE m.customer_id = $1
             AND m.is_active = true
           ORDER BY
             CASE
               WHEN mt.name = $2 THEN 0
               ELSE 1
             END,
             m.created_at DESC
           LIMIT 1`,
          [customer_id, resolvedClassType]
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

      // 출석 기록 생성
      const attendanceResult = await client.query(
        `INSERT INTO yoga_attendances 
         (customer_id, membership_id, class_id, instructor_id, class_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          customer_id,
          activeMembership.id,
          resolvedClassId,
          req.user!.id,
          resolvedClassType || null
        ]
      );

      await client.query(
        `UPDATE yoga_class_registrations
         SET attendance_status = 'attended'
         WHERE class_id = $1 AND customer_id = $2`,
        [resolvedClassId, customer_id]
      );

      // 횟수제 회원권인 경우 잔여 횟수 차감
      if (activeMembership.remaining_sessions !== null) {
        await client.query(
          `UPDATE yoga_memberships 
           SET remaining_sessions = remaining_sessions - 1,
               is_active = CASE
                 WHEN (remaining_sessions - 1) <= 0 THEN false
                 ELSE true
               END
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
  body('class_id').optional().isInt({ min: 1 }),
  validateRequest,
  async (req, res) => {
    const { id } = req.params;
    const { class_type, class_id } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingAttendanceResult = await client.query(
        `SELECT id, customer_id, class_id
         FROM yoga_attendances
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (existingAttendanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      const currentAttendance = existingAttendanceResult.rows[0] as {
        id: number;
        customer_id: number;
        class_id: number | null;
      };

      let resolvedClassId: number | null | undefined;
      let resolvedClassType = typeof class_type === 'string' ? class_type.trim() : undefined;

      if (class_id !== undefined && class_id !== null) {
        const classId = Number(class_id);
        const classResult = await client.query(
          'SELECT id, title FROM yoga_classes WHERE id = $1',
          [classId]
        );

        if (classResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Class not found' });
        }

        resolvedClassId = classResult.rows[0].id as number;
        if (!resolvedClassType) {
          resolvedClassType = String(classResult.rows[0].title ?? '').trim() || undefined;
        }

        if (resolvedClassId !== currentAttendance.class_id) {
          const registrationResult = await client.query(
            `SELECT id
             FROM yoga_class_registrations
             WHERE class_id = $1 AND customer_id = $2
             LIMIT 1`,
            [resolvedClassId, currentAttendance.customer_id]
          );

          if (registrationResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Target class registration not found' });
          }

          const duplicateAttendanceResult = await client.query(
            `SELECT id
             FROM yoga_attendances
             WHERE class_id = $1
               AND customer_id = $2
               AND id <> $3
             LIMIT 1`,
            [resolvedClassId, currentAttendance.customer_id, id]
          );

          if (duplicateAttendanceResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Attendance already exists for target class and customer' });
          }
        }
      } else {
        resolvedClassId = undefined;
      }

      const result = await client.query(
        `UPDATE yoga_attendances 
         SET class_type = COALESCE($1, class_type),
             class_id = COALESCE($2, class_id)
         WHERE id = $3
         RETURNING *`,
        [resolvedClassType, resolvedClassId, id]
      );

      const updatedAttendance = result.rows[0] as {
        id: number;
        customer_id: number;
        class_id: number | null;
      };

      if (
        resolvedClassId !== undefined
        && currentAttendance.class_id !== null
        && resolvedClassId !== currentAttendance.class_id
      ) {
        await client.query(
          `UPDATE yoga_class_registrations r
           SET attendance_status = 'reserved'
           WHERE r.class_id = $1
             AND r.customer_id = $2
             AND r.attendance_status = 'attended'
             AND NOT EXISTS (
               SELECT 1
               FROM yoga_attendances a
               WHERE a.class_id = r.class_id
                 AND a.customer_id = r.customer_id
             )`,
          [currentAttendance.class_id, currentAttendance.customer_id]
        );

        if (updatedAttendance.class_id !== null) {
          await client.query(
            `UPDATE yoga_class_registrations
             SET attendance_status = 'attended'
             WHERE class_id = $1
               AND customer_id = $2`,
            [updatedAttendance.class_id, updatedAttendance.customer_id]
          );
        }
      }

      await client.query('COMMIT');
      res.json(updatedAttendance);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
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
           SET remaining_sessions = remaining_sessions + 1,
               is_active = CASE
                 WHEN (remaining_sessions + 1) > 0 THEN true
                 ELSE false
               END
           WHERE id = $1`,
          [membership.id]
        );
      }
    }

    if (attendance.class_id) {
      await client.query(
        `UPDATE yoga_class_registrations
         SET attendance_status = 'reserved'
         WHERE class_id = $1
           AND customer_id = $2
           AND attendance_status = 'attended'`,
        [attendance.class_id, attendance.customer_id]
      );
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
        c.phone as customer_phone,
        cls.id as class_id,
        cls.title as class_title,
        cls.class_date,
        cls.start_time as class_start_time,
        cls.end_time as class_end_time,
        COALESCE(a.class_type, cls.title) as class_type
      FROM yoga_attendances a
      LEFT JOIN yoga_customers c ON a.customer_id = c.id
      LEFT JOIN yoga_classes cls ON cls.id = a.class_id
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
