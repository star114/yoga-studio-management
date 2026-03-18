import express from 'express';
import { body, param, query } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { getRecurringClassDates, isValidTime, timeToMinutes } from '../utils/classSchedule';
import { deductMembershipSessions, refundMembershipSessions } from '../utils/membershipUsageAudit';
import {
  getMembershipTitleMatchKind,
  isMembershipTitleMatch,
  sortMembershipRowsByTitleMatch,
} from '../utils/membershipTitleMatch';
import { validateRequest } from '../middleware/validateRequest';

const router = express.Router();

const getCustomerIdFromUser = async (userId: number): Promise<number | null> => {
  const result = await pool.query(
    'SELECT id FROM yoga_customers WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

const getLatestAttendanceIdByClassCustomer = async (
  classId: number,
  customerId: number
): Promise<number | null> => {
  const attendanceResult = await pool.query(
    `SELECT id
     FROM yoga_attendances
     WHERE class_id = $1
       AND customer_id = $2
     ORDER BY attendance_date DESC, id DESC
     LIMIT 1`,
    [classId, customerId]
  );

  if (attendanceResult.rows.length === 0) {
    return null;
  }

  return Number(attendanceResult.rows[0].id);
};

const cancelRegistrationAndRelatedAttendance = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> },
  registration: {
    id: number;
    membership_id: number | null;
    attendance_status: 'reserved' | 'attended' | 'absent';
    session_consumed?: boolean | null;
  },
  classId: string,
  customerId: number | string,
  actorUserId?: number | null
) => {
  const attendanceResult = await client.query(
    `SELECT id, membership_id, session_deducted
     FROM yoga_attendances
     WHERE class_id = $1
       AND customer_id = $2
     FOR UPDATE`,
    [classId, customerId]
  );

  const attendanceRows = attendanceResult.rows as Array<{
    id: number;
    membership_id: number | null;
    session_deducted: boolean;
  }>;
  const refundMembershipId = registration.membership_id
    ?? attendanceRows.find((attendanceRow) => attendanceRow.membership_id !== null)?.membership_id
    ?? null;

  if (registration.session_consumed && refundMembershipId !== null) {
    await refundMembershipSessions(client, {
      membershipId: refundMembershipId,
      changeAmount: 1,
      actorUserId,
      classId: Number(classId),
      registrationId: registration.id,
      reason: 'registration_cancel_refund',
      note: `Canceled registration with status ${registration.attendance_status}`,
    });
  }

  if (attendanceRows.length > 0) {
    await client.query(
      'DELETE FROM yoga_attendances WHERE id = ANY($1::int[])',
      [attendanceRows.map((attendanceRow) => attendanceRow.id)]
    );
  }

  await client.query(
    'DELETE FROM yoga_class_registrations WHERE id = $1',
    [registration.id]
  );
};

// 수업 목록 조회
router.get('/',
  authenticate,
  query('date_from').optional().isDate(),
  query('date_to').optional().isDate(),
  query('is_open').optional().isBoolean(),
  validateRequest,
  async (req: AuthRequest, res) => {
    const { date_from, date_to, is_open } = req.query;

    try {
      let sql = `
        SELECT
          c.*,
          CASE
            WHEN (c.class_date::timestamp + c.end_time) <= CURRENT_TIMESTAMP THEN 'completed'
            WHEN (c.class_date::timestamp + c.start_time) <= CURRENT_TIMESTAMP THEN 'in_progress'
            WHEN c.is_open THEN 'open'
            ELSE 'closed'
          END AS class_status,
          COUNT(r.id)::int AS current_enrollment,
          GREATEST(c.max_capacity - COUNT(r.id), 0)::int AS remaining_seats
        FROM yoga_classes c
        LEFT JOIN yoga_class_registrations r ON c.id = r.class_id
        WHERE 1=1
      `;

      const params: Array<string | boolean> = [];
      let paramIndex = 1;

      if (typeof date_from === 'string') {
        sql += ` AND class_date >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (typeof date_to === 'string') {
        sql += ` AND class_date <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      if (typeof is_open === 'string') {
        sql += ` AND is_open = $${paramIndex}`;
        params.push(is_open === 'true');
        paramIndex++;
      }

      sql += `
        GROUP BY c.id
        ORDER BY c.class_date ASC, c.start_time ASC
      `;

      const result = await pool.query(sql, params);
      res.json(result.rows);
    } catch (error) {
      console.error('Get classes error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 내 수업 신청 목록 조회 (고객 본인)
router.get('/registrations/me',
  authenticate,
  async (req: AuthRequest, res) => {
    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin account does not have personal registrations' });
    }

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const result = await pool.query(
        `SELECT
           r.id AS registration_id,
           r.class_id,
           r.customer_id,
           r.attendance_status,
           r.registration_comment,
           r.registered_at,
           c.title,
           c.class_date,
           c.start_time,
           c.end_time,
           c.is_open
         FROM yoga_class_registrations r
         INNER JOIN yoga_classes c ON c.id = r.class_id
         WHERE r.customer_id = $1
         ORDER BY c.class_date ASC, c.start_time ASC`,
        [customerId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get my class registrations error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 상세 조회 (관리자)
router.get('/:id',
  authenticate,
  requireAdmin,
  param('id').isInt({ min: 1 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);

    try {
      const result = await pool.query(
        `SELECT
           c.*,
           CASE
             WHEN (c.class_date::timestamp + c.end_time) <= CURRENT_TIMESTAMP THEN 'completed'
             WHEN (c.class_date::timestamp + c.start_time) <= CURRENT_TIMESTAMP THEN 'in_progress'
             WHEN c.is_open THEN 'open'
             ELSE 'closed'
           END AS class_status,
           COUNT(r.id)::int AS current_enrollment,
           GREATEST(c.max_capacity - COUNT(r.id), 0)::int AS remaining_seats
         FROM yoga_classes c
         LEFT JOIN yoga_class_registrations r ON c.id = r.class_id
         WHERE c.id = $1
         GROUP BY c.id`,
        [classId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Class not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Get class detail error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 상세 조회 (고객 본인)
router.get('/:id/me',
  authenticate,
  param('id').isInt({ min: 1 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin must use admin class detail endpoint' });
    }

    const classId = Number(req.params.id);

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const result = await pool.query(
        `SELECT
           c.id,
           c.title,
           c.class_date,
           c.start_time,
           c.end_time,
           c.max_capacity,
           c.is_open,
           CASE
             WHEN (c.class_date::timestamp + c.end_time) <= CURRENT_TIMESTAMP THEN 'completed'
             WHEN (c.class_date::timestamp + c.start_time) <= CURRENT_TIMESTAMP THEN 'in_progress'
             WHEN c.is_open THEN 'open'
             ELSE 'closed'
           END AS class_status,
           r.id AS registration_id,
           r.registration_comment,
           r.attendance_status,
           a.id AS attendance_id,
           m.id AS membership_id,
           mt.name AS membership_type_name,
           m.created_at::date AS membership_created_date
         FROM yoga_classes c
         LEFT JOIN yoga_class_registrations r
           ON r.class_id = c.id
          AND r.customer_id = $2
         LEFT JOIN LATERAL (
           SELECT id, membership_id
           FROM yoga_attendances
           WHERE class_id = c.id
             AND customer_id = $2
           ORDER BY attendance_date DESC, id DESC
           LIMIT 1
         ) a ON TRUE
         LEFT JOIN yoga_memberships m
           ON m.id = COALESCE(r.membership_id, a.membership_id)
         LEFT JOIN yoga_membership_types mt
           ON mt.id = m.membership_type_id
         WHERE c.id = $1
           AND (r.id IS NOT NULL OR a.id IS NOT NULL)
         LIMIT 1`,
        [classId, customerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Class not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Get my class detail error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 신청 목록 조회 (관리자)
router.get('/:id/registrations',
  authenticate,
  requireAdmin,
  param('id').isInt({ min: 1 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);

    try {
      const classResult = await pool.query(
        'SELECT id, title FROM yoga_classes WHERE id = $1',
        [classId]
      );

      if (classResult.rows.length === 0) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const result = await pool.query(
        `SELECT
           r.id,
           r.class_id,
           r.customer_id,
         r.attendance_status,
         r.registered_at,
         r.registration_comment,
         a.id AS attendance_id,
         c.name AS customer_name,
         c.phone AS customer_phone
         FROM yoga_class_registrations r
         INNER JOIN yoga_customers c ON r.customer_id = c.id
         LEFT JOIN LATERAL (
           SELECT id
           FROM yoga_attendances
           WHERE class_id = r.class_id
             AND customer_id = r.customer_id
           ORDER BY attendance_date DESC, id DESC
           LIMIT 1
         ) a ON TRUE
         WHERE r.class_id = $1
         ORDER BY r.registered_at ASC`,
        [classId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get class registrations error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 출석 코멘트 스레드 조회 (고객 본인)
router.get('/:id/me/comment-thread',
  authenticate,
  param('id').isInt({ min: 1 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);

    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin cannot use customer comment thread endpoint' });
    }

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const attendanceId = await getLatestAttendanceIdByClassCustomer(classId, customerId);
      if (!attendanceId) {
        return res.status(404).json({ error: 'Attendance not found' });
      }

      const result = await pool.query(
        `SELECT
           m.id,
           m.attendance_id,
           m.author_role,
           m.author_user_id,
           m.message,
           m.created_at
         FROM yoga_attendance_messages m
         WHERE m.attendance_id = $1
         ORDER BY m.created_at ASC, m.id ASC`,
        [attendanceId]
      );

      res.json({
        attendance_id: attendanceId,
        messages: result.rows,
      });
    } catch (error) {
      console.error('Get my attendance comment thread error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 출석 코멘트 스레드 작성 (고객 본인)
router.post('/:id/me/comment-thread',
  authenticate,
  param('id').isInt({ min: 1 }),
  body('message').isString().trim().isLength({ min: 1, max: 1000 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);

    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin cannot use customer comment thread endpoint' });
    }

    const message = String(req.body.message).trim();

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const attendanceId = await getLatestAttendanceIdByClassCustomer(classId, customerId);
      if (!attendanceId) {
        return res.status(404).json({ error: 'Attendance not found' });
      }

      const result = await pool.query(
        `INSERT INTO yoga_attendance_messages
           (attendance_id, author_role, author_user_id, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, attendance_id, author_role, author_user_id, message, created_at`,
        [attendanceId, 'customer', req.user!.id, message]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create my attendance comment thread message error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 출석 코멘트 스레드 조회 (관리자)
router.get('/:id/registrations/:customerId/comment-thread',
  authenticate,
  requireAdmin,
  param('id').isInt({ min: 1 }),
  param('customerId').isInt({ min: 1 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    const customerId = Number(req.params.customerId);

    try {
      const attendanceId = await getLatestAttendanceIdByClassCustomer(classId, customerId);
      if (!attendanceId) {
        return res.status(404).json({ error: 'Attendance not found' });
      }

      const result = await pool.query(
        `SELECT
           m.id,
           m.attendance_id,
           m.author_role,
           m.author_user_id,
           m.message,
           m.created_at
         FROM yoga_attendance_messages m
         WHERE m.attendance_id = $1
         ORDER BY m.created_at ASC, m.id ASC`,
        [attendanceId]
      );

      res.json({
        attendance_id: attendanceId,
        messages: result.rows,
      });
    } catch (error) {
      console.error('Get attendance comment thread (admin) error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 출석 코멘트 스레드 작성 (관리자)
router.post('/:id/registrations/:customerId/comment-thread',
  authenticate,
  requireAdmin,
  param('id').isInt({ min: 1 }),
  param('customerId').isInt({ min: 1 }),
  body('message').isString().trim().isLength({ min: 1, max: 1000 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    const customerId = Number(req.params.customerId);
    const message = String(req.body.message).trim();

    try {
      const attendanceId = await getLatestAttendanceIdByClassCustomer(classId, customerId);
      if (!attendanceId) {
        return res.status(404).json({ error: 'Attendance not found' });
      }

      const result = await pool.query(
        `INSERT INTO yoga_attendance_messages
           (attendance_id, author_role, author_user_id, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, attendance_id, author_role, author_user_id, message, created_at`,
        [attendanceId, 'admin', req.user!.id, message]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create attendance comment thread message (admin) error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 수련생 코멘트 저장 (고객 본인)
router.put('/:id/registrations/me/comment',
  authenticate,
  param('id').isInt({ min: 1 }),
  body('registration_comment').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);

    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin must use customer-specific comment endpoint' });
    }

    const comment = typeof req.body.registration_comment === 'string'
      ? req.body.registration_comment.trim()
      : null;

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const result = await pool.query(
        `UPDATE yoga_class_registrations
         SET registration_comment = $3
         WHERE class_id = $1 AND customer_id = $2
         RETURNING id, class_id, customer_id, registration_comment, registered_at`,
        [classId, customerId, comment && comment.length > 0 ? comment : null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update my registration comment error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 수련생 코멘트 저장 (관리자)
router.put('/:id/registrations/:customerId/comment',
  authenticate,
  requireAdmin,
  param('id').isInt({ min: 1 }),
  param('customerId').isInt({ min: 1 }),
  body('registration_comment').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    const customerId = Number(req.params.customerId);
    const comment = typeof req.body.registration_comment === 'string'
      ? req.body.registration_comment.trim()
      : null;

    try {
      const result = await pool.query(
        `UPDATE yoga_class_registrations
         SET registration_comment = $3
         WHERE class_id = $1 AND customer_id = $2
         RETURNING id, class_id, customer_id, registration_comment, registered_at`,
        [classId, customerId, comment && comment.length > 0 ? comment : null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update registration comment error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 수련생 출석 상태 변경 (관리자)
router.put('/:id/registrations/:customerId/status',
  authenticate,
  requireAdmin,
  param('id').isInt({ min: 1 }),
  param('customerId').isInt({ min: 1 }),
  body('attendance_status').isIn(['reserved', 'attended', 'absent']),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    const customerId = Number(req.params.customerId);
    const attendanceStatus = String(req.body.attendance_status);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const registrationResult = await client.query(
      `SELECT id, class_id, customer_id, membership_id, attendance_status, session_consumed, registration_comment, registered_at
        FROM yoga_class_registrations
        WHERE class_id = $1 AND customer_id = $2
        FOR UPDATE`,
        [classId, customerId]
      );

      if (registrationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Registration not found' });
      }

      const currentRegistration = registrationResult.rows[0] as {
        id: number;
        class_id: number;
        customer_id: number;
        membership_id: number | null;
        attendance_status: 'reserved' | 'attended' | 'absent';
        session_consumed?: boolean | null;
        registration_comment: string | null;
        registered_at: string;
      };
      const currentSessionConsumed = Boolean(currentRegistration.session_consumed);

      if (currentRegistration.attendance_status === attendanceStatus) {
        await client.query('COMMIT');
        return res.json(currentRegistration);
      }

      if (attendanceStatus === 'attended') {
        const attendanceCheckResult = await client.query(
          `SELECT id
           FROM yoga_attendances
           WHERE class_id = $1 AND customer_id = $2
           LIMIT 1`,
          [classId, customerId]
        );

        if (attendanceCheckResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Attendance record not found; use check-in endpoint first' });
        }
      } else if (attendanceStatus === 'absent' && currentRegistration.attendance_status === 'reserved') {
        if (currentRegistration.membership_id === null) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Registration membership not found' });
        }

        if (!currentSessionConsumed) {
          const membershipUpdateResult = await deductMembershipSessions(client, {
            membershipId: currentRegistration.membership_id,
            changeAmount: 1,
            actorUserId: req.user!.id,
            classId,
            registrationId: currentRegistration.id,
            reason: 'registration_status_absent_deduction',
          });

          if (!membershipUpdateResult) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Membership sessions exhausted' });
          }
        }
      } else {
        const attendanceResult = await client.query(
          `SELECT id, membership_id, session_deducted
           FROM yoga_attendances
           WHERE class_id = $1 AND customer_id = $2
           FOR UPDATE`,
          [classId, customerId]
        );

        const attendanceRows = attendanceResult.rows as Array<{
          id: number;
          membership_id: number | null;
          session_deducted: boolean;
        }>;

        if (attendanceStatus === 'reserved') {
          const refundMembershipId = currentRegistration.membership_id
            ?? attendanceRows.find((attendanceRow) => attendanceRow.membership_id !== null)?.membership_id
            ?? null;

          if (currentSessionConsumed && refundMembershipId !== null) {
            await refundMembershipSessions(client, {
              membershipId: refundMembershipId,
              changeAmount: 1,
              actorUserId: req.user!.id,
              classId,
              registrationId: currentRegistration.id,
              reason: 'registration_status_reserved_refund',
              note: `Status changed from ${currentRegistration.attendance_status} to reserved`,
            });
          }
        }

        if (attendanceRows.length > 0) {
          const attendanceIds = attendanceRows.map((attendanceRow) => attendanceRow.id);
          await client.query(
            'DELETE FROM yoga_attendances WHERE id = ANY($1::int[])',
            [attendanceIds]
          );
        }
      }

      const result = await client.query(
        `UPDATE yoga_class_registrations
         SET attendance_status = $3,
             session_consumed = $4
         WHERE class_id = $1 AND customer_id = $2
         RETURNING id, class_id, customer_id, membership_id, attendance_status, session_consumed, registration_comment, registered_at`,
        [classId, customerId, attendanceStatus, attendanceStatus !== 'reserved']
      );

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update registration attendance status error:', error);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  }
);

// 수업 신청 (관리자/고객)
router.post('/:id/registrations',
  authenticate,
  body('customer_id').optional().isInt({ min: 1 }),
  body('membership_id').optional().isInt({ min: 1 }),
  body('allow_cross_membership_registration').optional().isBoolean(),
  body('mark_attended_after_register').optional().isBoolean(),
  validateRequest,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    let customerId: number | null = null;
    const allowCrossMembershipRegistration = req.body.allow_cross_membership_registration === true;

    if (req.user?.role === 'admin') {
      customerId = req.body.customer_id ? Number(req.body.customer_id) : null;
      if (!customerId) {
        return res.status(400).json({ error: 'customer_id is required for admin' });
      }
    } else {
      customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const classResult = await client.query(
        `SELECT
           id,
           title,
           is_open,
           max_capacity,
           class_date,
           start_time,
           end_time,
           (class_date::timestamp + end_time) <= CURRENT_TIMESTAMP AS is_completed
         FROM yoga_classes
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (classResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Class not found' });
      }

      const yogaClass = classResult.rows[0];

      const isCompletedClass = yogaClass.is_completed === true;
      const markAttendedAfterRegister = req.user?.role === 'admin'
        && req.body.mark_attended_after_register === true;
      const shouldCreateImmediateAttendance = isCompletedClass && markAttendedAfterRegister;

      if (markAttendedAfterRegister && !isCompletedClass) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Post-attendance registration is only available for completed classes' });
      }

      if (isCompletedClass && !shouldCreateImmediateAttendance) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class is completed' });
      }

      if (!yogaClass.is_open && !shouldCreateImmediateAttendance) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class is closed' });
      }

      const requestedMembershipId = req.body.membership_id ? Number(req.body.membership_id) : null;
      const membershipResult = await client.query(
        `SELECT
           m.id,
           m.is_active,
           m.created_at,
           m.remaining_sessions,
           mt.name AS membership_type_name
         FROM yoga_memberships m
         INNER JOIN yoga_membership_types mt ON mt.id = m.membership_type_id
         WHERE m.customer_id = $1
         FOR UPDATE OF m`,
        [customerId]
      );

      const lockedMembershipRows = sortMembershipRowsByTitleMatch((membershipResult.rows as Array<{
        id: number;
        is_active?: boolean;
        created_at?: string;
        remaining_sessions: number;
        membership_type_name?: string | null;
        is_title_match?: boolean;
        title_match_kind?: 'exact' | 'suffix' | 'none';
      }>).map((row) => ({
        ...row,
        is_active: row.is_active ?? true,
        title_match_kind: row.title_match_kind
          ?? getMembershipTitleMatchKind(row.membership_type_name, String(yogaClass.title ?? '')),
        is_title_match: typeof row.is_title_match === 'boolean'
          ? row.is_title_match
          : isMembershipTitleMatch(row.membership_type_name, String(yogaClass.title ?? '')),
      })), String(yogaClass.title ?? ''));
      const reservedCountByMembershipId = new Map<number, number>();

      if (lockedMembershipRows.length > 0) {
        const reservedCountResult = await client.query(
          `SELECT membership_id, COUNT(*)::int AS reserved_count
           FROM yoga_class_registrations
           WHERE membership_id = ANY($1::int[])
             AND attendance_status = 'reserved'
           GROUP BY membership_id`,
          [lockedMembershipRows.map((row) => row.id)]
        );

        for (const row of reservedCountResult.rows as Array<{ membership_id: number; reserved_count: number }>) {
          reservedCountByMembershipId.set(Number(row.membership_id), Number(row.reserved_count));
        }
      }

      const activeMembershipRows = lockedMembershipRows.filter((row) => row.is_active);
      const eligibleMembershipRows = activeMembershipRows
        .map((row) => ({
          ...row,
          reserved_count: reservedCountByMembershipId.get(row.id) ?? 0,
        }))
        .filter((row) => (row.remaining_sessions - row.reserved_count) > 0);

      const requestedMembership = requestedMembershipId === null
        ? null
        : eligibleMembershipRows.find((row) => row.id === requestedMembershipId) ?? null;
      const matchingMembershipRows = eligibleMembershipRows.filter((row) => row.is_title_match);
      const alternativeMembershipRows = eligibleMembershipRows.filter((row) => !row.is_title_match);
      const hasAlternativeMembership = requestedMembership
        ? !requestedMembership.is_title_match
        : matchingMembershipRows.length === 0 && alternativeMembershipRows.length > 0;

      if (requestedMembershipId !== null && !requestedMembership) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid or unavailable membership' });
      }

      if ((requestedMembership && !requestedMembership.is_title_match) || matchingMembershipRows.length === 0) {
        if (hasAlternativeMembership && !allowCrossMembershipRegistration) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'No valid membership for this class',
            reason: 'CROSS_MEMBERSHIP_CONFIRM_REQUIRED',
            checks: {
              class_title: yogaClass.title,
              has_membership: true,
              has_matching_membership_type: false,
              has_active_membership: true,
              has_remaining_sessions: true,
              has_alternative_membership: true,
              requires_confirmation: true,
              cross_membership_message: '회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.',
            },
            failed_checks: ['CLASS_TITLE_MISMATCH'],
          });
        }

        if (eligibleMembershipRows.length === 0) {
          const totalMemberships = lockedMembershipRows.length;
          const activeMemberships = activeMembershipRows.length;
          const remainingMemberships = lockedMembershipRows.filter((row) => (
            row.remaining_sessions - (reservedCountByMembershipId.get(row.id) ?? 0)
          ) > 0).length;
          const eligibleMemberships = eligibleMembershipRows.length;
          const titleMatchedMemberships = lockedMembershipRows.filter((row) => row.is_title_match).length;
          const failedChecks: string[] = [];
          if (totalMemberships <= 0) {
            failedChecks.push('NO_MEMBERSHIP');
          }
          if (titleMatchedMemberships <= 0) {
            failedChecks.push('CLASS_TITLE_MISMATCH');
          }
          if (activeMemberships <= 0) {
            failedChecks.push('NO_ACTIVE_MEMBERSHIP');
          }
          if (remainingMemberships <= 0) {
            failedChecks.push('NO_REMAINING_SESSIONS');
          }

          console.warn('Class registration blocked by membership validation', {
            class_id: Number(id),
            customer_id: Number(customerId),
            class_title: String(yogaClass.title ?? ''),
            membership_diagnostics: {
              total_memberships: totalMemberships,
              active_memberships: activeMemberships,
              remaining_memberships: remainingMemberships,
              title_matched_memberships: titleMatchedMemberships,
              failed_checks: failedChecks,
            },
          });

          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'No valid membership for this class',
            reason: failedChecks[0] ?? 'NO_ELIGIBLE_MEMBERSHIP',
            checks: {
              class_title: yogaClass.title,
              has_membership: totalMemberships > 0,
              has_matching_membership_type: titleMatchedMemberships > 0,
              has_active_membership: activeMemberships > 0,
              has_remaining_sessions: remainingMemberships > 0,
              has_alternative_membership: eligibleMemberships > 0 && titleMatchedMemberships <= 0,
            },
            failed_checks: failedChecks,
          });
        }
      }

      const usesAlternativeMembership = requestedMembership
        ? !requestedMembership.is_title_match
        : matchingMembershipRows.length === 0 && alternativeMembershipRows.length > 0;

      if (!shouldCreateImmediateAttendance) {
        const countResult = await client.query(
          'SELECT COUNT(*)::int AS count FROM yoga_class_registrations WHERE class_id = $1',
          [id]
        );
        const currentEnrollment = countResult.rows[0].count as number;

        if (currentEnrollment >= Number(yogaClass.max_capacity)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Class is full' });
        }
      }

      const selectedMembership = requestedMembership
        ?? (usesAlternativeMembership ? alternativeMembershipRows[0] : matchingMembershipRows[0]);

      const registrationResult = await client.query(
        `INSERT INTO yoga_class_registrations (class_id, customer_id, membership_id, attendance_status, session_consumed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, customer_id) DO NOTHING
         RETURNING *`,
        [id, customerId, selectedMembership.id, shouldCreateImmediateAttendance ? 'attended' : 'reserved', shouldCreateImmediateAttendance]
      );

      if (registrationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Customer already registered' });
      }

      if (shouldCreateImmediateAttendance) {
        const membershipUpdateResult = await deductMembershipSessions(client, {
          membershipId: selectedMembership.id,
          changeAmount: 1,
          actorUserId: req.user!.id,
          classId: Number(id),
          registrationId: Number(registrationResult.rows[0].id),
          reason: 'completed_class_immediate_attendance',
        });

        if (!membershipUpdateResult) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Membership sessions exhausted' });
        }

        await client.query(
          `INSERT INTO yoga_attendances (
             customer_id,
             membership_id,
             class_id,
             attendance_date,
             instructor_id,
             class_type,
             session_deducted
           )
           VALUES (
             $1,
             $2,
             $3,
             ($4::date::timestamp + $5::time),
             $6,
             $7,
             $8
           )`,
          [
            customerId,
            selectedMembership.id,
            id,
            yogaClass.class_date,
            yogaClass.end_time,
            req.user!.id,
            yogaClass.title || null,
            true,
          ]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(registrationResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Register class error:', error);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  }
);

// 수업 신청 취소 (고객 본인)
router.delete('/:id/registrations/me',
  authenticate,
  async (req: AuthRequest, res) => {
    const { id } = req.params;

    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin must use customer-specific cancel endpoint' });
    }

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const registrationResult = await client.query(
          `SELECT id, membership_id, attendance_status, session_consumed
           FROM yoga_class_registrations
           WHERE class_id = $1 AND customer_id = $2
           FOR UPDATE`,
          [id, customerId]
        );

        if (registrationResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Registration not found' });
        }

        const registration = registrationResult.rows[0] as {
          id: number;
          membership_id: number | null;
          attendance_status: 'reserved' | 'attended' | 'absent';
          session_consumed?: boolean | null;
        };

        if (registration.attendance_status !== 'reserved') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Only reserved registrations can be canceled by customer' });
        }

        await cancelRegistrationAndRelatedAttendance(
          client,
          registration,
          String(id),
          customerId,
          req.user!.id
        );

        await client.query('COMMIT');
        res.json({ message: 'Registration canceled successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Cancel class registration (self) error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 신청 취소 (관리자)
router.delete('/:id/registrations/:customerId',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const { id, customerId } = req.params;

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const registrationResult = await client.query(
          `SELECT id, membership_id, attendance_status, session_consumed
           FROM yoga_class_registrations
           WHERE class_id = $1 AND customer_id = $2
           FOR UPDATE`,
          [id, customerId]
        );

        if (registrationResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Registration not found' });
        }

        const registration = registrationResult.rows[0] as {
          id: number;
          membership_id: number | null;
          attendance_status: 'reserved' | 'attended' | 'absent';
          session_consumed?: boolean | null;
        };

        if (registration.attendance_status !== 'reserved') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Only reserved registrations can be canceled by admin' });
        }

        await cancelRegistrationAndRelatedAttendance(
          client,
          registration,
          String(id),
          customerId,
          req.user!.id
        );

        await client.query('COMMIT');
        res.json({ message: 'Registration canceled successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Cancel class registration (admin) error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 등록 (관리자)
router.post('/',
  authenticate,
  requireAdmin,
  body('title').notEmpty(),
  body('class_date').isDate(),
  body('start_time').custom(isValidTime),
  body('end_time').custom(isValidTime),
  body('max_capacity').isInt({ min: 1 }),
  validateRequest,
  async (req, res) => {
    const {
      title,
      class_date,
      start_time,
      end_time,
      max_capacity,
      is_open,
      notes,
    } = req.body;

    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO yoga_classes
        (title, class_date, start_time, end_time, max_capacity, is_open, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          title,
          class_date,
          start_time,
          end_time,
          max_capacity,
          is_open ?? true,
          notes || null,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create class error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 반복 수업 일괄 등록 (관리자)
router.post('/recurring',
  authenticate,
  requireAdmin,
  body('title').notEmpty(),
  body('recurrence_start_date').isDate(),
  body('recurrence_end_date').isDate(),
  body('weekdays').isArray({ min: 1 }),
  body('weekdays.*').isInt({ min: 0, max: 6 }),
  body('start_time').custom(isValidTime),
  body('end_time').custom(isValidTime),
  body('max_capacity').isInt({ min: 1 }),
  validateRequest,
  async (req, res) => {
    const {
      title,
      recurrence_start_date,
      recurrence_end_date,
      weekdays,
      start_time,
      end_time,
      max_capacity,
      is_open,
      notes,
    } = req.body as {
      title: string;
      recurrence_start_date: string;
      recurrence_end_date: string;
      weekdays: number[];
      start_time: string;
      end_time: string;
      max_capacity: number;
      is_open?: boolean;
      notes?: string;
    };

    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const uniqueWeekdays = Array.from(new Set(weekdays.map((value) => Number(value))));
    let classDates: string[] = [];

    try {
      classDates = getRecurringClassDates(
        recurrence_start_date,
        recurrence_end_date,
        uniqueWeekdays
      );
    } catch (recurrenceError: unknown) {
      return res.status(400).json({
        error: recurrenceError instanceof Error ? recurrenceError.message : 'Invalid recurrence rule',
      });
    }

    if (classDates.length === 0) {
      return res.status(400).json({ error: 'No classes to create for the given recurrence rule' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const classDate of classDates) {
        await client.query(
          `INSERT INTO yoga_classes
           (title, class_date, start_time, end_time, max_capacity, is_open, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            title,
            classDate,
            start_time,
            end_time,
            max_capacity,
            is_open ?? true,
            notes || null,
          ]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({
        created_count: classDates.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create recurring classes error:', error);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  }
);

// 수업 수정 (관리자)
router.put('/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const requestBody = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    const {
      title,
      class_date,
      start_time,
      end_time,
      max_capacity,
      is_open,
      notes,
    } = requestBody;
    const hasStartTimeField = Object.prototype.hasOwnProperty.call(requestBody, 'start_time');
    const hasEndTimeField = Object.prototype.hasOwnProperty.call(requestBody, 'end_time');
    const hasNotesField = Object.prototype.hasOwnProperty.call(requestBody, 'notes');
    const normalizedStartTime = typeof start_time === 'string' ? start_time : null;
    const normalizedEndTime = typeof end_time === 'string' ? end_time : null;

    if (hasStartTimeField && start_time !== null && typeof start_time !== 'string') {
      return res.status(400).json({ error: 'start_time must be a string' });
    }
    if (hasEndTimeField && end_time !== null && typeof end_time !== 'string') {
      return res.status(400).json({ error: 'end_time must be a string' });
    }
    if (normalizedStartTime && !isValidTime(normalizedStartTime)) {
      return res.status(400).json({ error: 'Invalid start_time format' });
    }
    if (normalizedEndTime && !isValidTime(normalizedEndTime)) {
      return res.status(400).json({ error: 'Invalid end_time format' });
    }
    if (
      normalizedStartTime
      && normalizedEndTime
      && timeToMinutes(normalizedStartTime) >= timeToMinutes(normalizedEndTime)
    ) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    if (max_capacity !== undefined && Number(max_capacity) < 1) {
      return res.status(400).json({ error: 'max_capacity must be at least 1' });
    }

    try {
      const result = await pool.query(
        `UPDATE yoga_classes
         SET title = COALESCE($1, title),
             class_date = COALESCE($2, class_date),
             start_time = COALESCE($3, start_time),
             end_time = COALESCE($4, end_time),
             max_capacity = COALESCE($5, max_capacity),
             is_open = COALESCE($6, is_open),
             notes = CASE
               WHEN $7 THEN $8
               ELSE notes
             END
         WHERE id = $9
         RETURNING *`,
        [
          title,
          class_date,
          normalizedStartTime,
          normalizedEndTime,
          max_capacity,
          is_open,
          hasNotesField,
          notes ?? null,
          id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Class not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update class error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 삭제 (관리자)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM yoga_classes WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Delete class error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
