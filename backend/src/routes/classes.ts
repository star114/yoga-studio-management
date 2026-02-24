import express from 'express';
import { body, param, query } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { getRecurringClassDates, isValidTime, timeToMinutes } from '../utils/classSchedule';
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

// 수업 목록 조회
router.get('/',
  authenticate,
  query('date_from').optional().isDate(),
  query('date_to').optional().isDate(),
  query('is_open').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
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
  async (req, res) => {
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
           a.instructor_comment AS instructor_comment,
           a.customer_comment AS customer_comment
         FROM yoga_classes c
         LEFT JOIN yoga_class_registrations r
           ON r.class_id = c.id
          AND r.customer_id = $2
         LEFT JOIN LATERAL (
           SELECT id, instructor_comment, customer_comment
           FROM yoga_attendances
           WHERE class_id = c.id
             AND customer_id = $2
           ORDER BY attendance_date DESC, id DESC
           LIMIT 1
         ) a ON TRUE
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
  async (req, res) => {
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
         a.instructor_comment AS attendance_instructor_comment,
         a.customer_comment AS attendance_customer_comment,
         c.name AS customer_name,
         c.phone AS customer_phone
         FROM yoga_class_registrations r
         INNER JOIN yoga_customers c ON r.customer_id = c.id
         LEFT JOIN LATERAL (
           SELECT id, instructor_comment, customer_comment
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

// 출석 수련생 코멘트 저장 (고객 본인)
router.put('/:id/me/attendance-comment',
  authenticate,
  param('id').isInt({ min: 1 }),
  body('customer_comment').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
  validateRequest,
  async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);

    if (req.user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin cannot update customer attendance comment' });
    }

    const comment = typeof req.body.customer_comment === 'string'
      ? req.body.customer_comment.trim()
      : null;

    try {
      const customerId = await getCustomerIdFromUser(req.user!.id);
      if (!customerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      const result = await pool.query(
        `WITH latest_attendance AS (
           SELECT id
           FROM yoga_attendances
           WHERE class_id = $1
             AND customer_id = $2
           ORDER BY attendance_date DESC, id DESC
           LIMIT 1
         )
         UPDATE yoga_attendances a
         SET customer_comment = $3
         FROM latest_attendance la
         WHERE a.id = la.id
         RETURNING a.*`,
        [classId, customerId, comment && comment.length > 0 ? comment : null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Attendance not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update my attendance customer comment error:', error);
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
  async (req, res) => {
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
  async (req, res) => {
    const classId = Number(req.params.id);
    const customerId = Number(req.params.customerId);
    const attendanceStatus = String(req.body.attendance_status);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const registrationResult = await client.query(
        `SELECT id, class_id, customer_id, attendance_status, registration_comment, registered_at
         FROM yoga_class_registrations
         WHERE class_id = $1 AND customer_id = $2
         FOR UPDATE`,
        [classId, customerId]
      );

      if (registrationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Registration not found' });
      }

      const currentRegistration = registrationResult.rows[0];

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
      } else {
        const attendanceResult = await client.query(
          `SELECT id, membership_id
           FROM yoga_attendances
           WHERE class_id = $1 AND customer_id = $2
           FOR UPDATE`,
          [classId, customerId]
        );

        const attendanceRows = attendanceResult.rows as Array<{ id: number; membership_id: number | null }>;

        if (attendanceRows.length > 0) {
          const membershipUsage = new Map<number, number>();

          attendanceRows.forEach((attendanceRow) => {
            if (attendanceRow.membership_id === null) return;
            const usedCount = membershipUsage.get(attendanceRow.membership_id) ?? 0;
            membershipUsage.set(attendanceRow.membership_id, usedCount + 1);
          });

          for (const [membershipId, usedCount] of membershipUsage.entries()) {
            await client.query(
              `UPDATE yoga_memberships
               SET remaining_sessions = CASE
                     WHEN remaining_sessions IS NULL THEN NULL
                     ELSE remaining_sessions + $2
                   END,
                   is_active = CASE
                     WHEN remaining_sessions IS NULL THEN is_active
                     WHEN (remaining_sessions + $2) > 0 THEN TRUE
                     ELSE FALSE
                   END
               WHERE id = $1`,
              [membershipId, usedCount]
            );
          }

          const attendanceIds = attendanceRows.map((attendanceRow) => attendanceRow.id);
          await client.query(
            'DELETE FROM yoga_attendances WHERE id = ANY($1::int[])',
            [attendanceIds]
          );
        }
      }

      const result = await client.query(
        `UPDATE yoga_class_registrations
         SET attendance_status = $3
         WHERE class_id = $1 AND customer_id = $2
         RETURNING id, class_id, customer_id, attendance_status, registration_comment, registered_at`,
        [classId, customerId, attendanceStatus]
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
  validateRequest,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    let customerId: number | null = null;

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
        `SELECT id, is_open, max_capacity, class_date, start_time, end_time
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

      const now = new Date();
      const classEndAt = new Date(`${String(yogaClass.class_date).slice(0, 10)}T${String(yogaClass.end_time).slice(0, 8)}`);
      if (classEndAt <= now) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class is completed' });
      }

      if (!yogaClass.is_open) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class is closed' });
      }

      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM yoga_class_registrations WHERE class_id = $1',
        [id]
      );
      const currentEnrollment = countResult.rows[0].count as number;

      if (currentEnrollment >= Number(yogaClass.max_capacity)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class is full' });
      }

      const registrationResult = await client.query(
        `INSERT INTO yoga_class_registrations (class_id, customer_id)
         VALUES ($1, $2)
         ON CONFLICT (class_id, customer_id) DO NOTHING
         RETURNING *`,
        [id, customerId]
      );

      if (registrationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Customer already registered' });
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

      const result = await pool.query(
        `DELETE FROM yoga_class_registrations
         WHERE class_id = $1 AND customer_id = $2
         RETURNING id`,
        [id, customerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      res.json({ message: 'Registration canceled successfully' });
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
  async (req, res) => {
    const { id, customerId } = req.params;

    try {
      const result = await pool.query(
        `DELETE FROM yoga_class_registrations
         WHERE class_id = $1 AND customer_id = $2
         RETURNING id`,
        [id, customerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      res.json({ message: 'Registration canceled successfully' });
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

    const uniqueWeekdays = Array.from(new Set((weekdays || []).map((value) => Number(value))));
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
    const {
      title,
      class_date,
      start_time,
      end_time,
      max_capacity,
      is_open,
      notes,
    } = req.body;

    if (start_time && !isValidTime(start_time)) {
      return res.status(400).json({ error: 'Invalid start_time format' });
    }
    if (end_time && !isValidTime(end_time)) {
      return res.status(400).json({ error: 'Invalid end_time format' });
    }
    if (start_time && end_time && timeToMinutes(start_time) >= timeToMinutes(end_time)) {
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
             notes = COALESCE($7, notes)
         WHERE id = $8
         RETURNING *`,
        [
          title,
          class_date,
          start_time,
          end_time,
          max_capacity,
          is_open,
          notes,
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
