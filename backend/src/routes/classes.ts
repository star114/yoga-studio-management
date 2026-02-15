import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

const isValidTime = (value: string): boolean => {
  return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value);
};

const timeToMinutes = (value: string): number => {
  const [hour, minute] = value.split(':').map((item) => Number(item));
  return hour * 60 + minute;
};

const parseDateOnly = (value: string): Date => new Date(`${value}T00:00:00`);

const formatDateOnly = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { date_from, date_to, is_open } = req.query;

    try {
      let sql = `
        SELECT
          c.*,
          COUNT(r.id)::int AS current_enrollment,
          GREATEST(c.max_capacity - COUNT(r.id), 0)::int AS remaining_seats
        FROM yoga_classes c
        LEFT JOIN yoga_class_registrations r ON c.id = r.class_id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (date_from) {
        sql += ` AND class_date >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        sql += ` AND class_date <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      if (is_open !== undefined) {
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

// 수업 신청 목록 조회 (관리자)
router.get('/:id/registrations',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      const classResult = await pool.query(
        'SELECT id, title FROM yoga_classes WHERE id = $1',
        [id]
      );

      if (classResult.rows.length === 0) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const result = await pool.query(
        `SELECT
           r.id,
           r.class_id,
           r.customer_id,
           r.registered_at,
           c.name AS customer_name,
           c.phone AS customer_phone
         FROM yoga_class_registrations r
         INNER JOIN yoga_customers c ON r.customer_id = c.id
         WHERE r.class_id = $1
         ORDER BY r.registered_at ASC`,
        [id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get class registrations error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 수업 신청 (관리자/고객)
router.post('/:id/registrations',
  authenticate,
  body('customer_id').optional().isInt({ min: 1 }),
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
        `SELECT id, is_open, max_capacity, is_excluded
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

      if (yogaClass.is_excluded) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Class is excluded' });
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      instructor_name,
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
        (title, instructor_name, class_date, start_time, end_time, max_capacity, is_open, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          title,
          instructor_name || null,
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
  body('excluded_dates').optional().isArray(),
  body('excluded_dates.*').optional().isDate(),
  body('start_time').custom(isValidTime),
  body('end_time').custom(isValidTime),
  body('max_capacity').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      instructor_name,
      recurrence_start_date,
      recurrence_end_date,
      weekdays,
      excluded_dates,
      start_time,
      end_time,
      max_capacity,
      is_open,
      notes,
    } = req.body;

    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const startDate = parseDateOnly(recurrence_start_date);
    const endDate = parseDateOnly(recurrence_end_date);

    if (startDate > endDate) {
      return res.status(400).json({ error: 'recurrence_end_date must be on or after recurrence_start_date' });
    }

    const dayDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff > 370) {
      return res.status(400).json({ error: 'Recurring range cannot exceed 370 days' });
    }

    const uniqueWeekdays = Array.from(new Set((weekdays as number[]).map((value) => Number(value))));
    const excludedDateSet = new Set(
      Array.isArray(excluded_dates)
        ? excluded_dates.map((value: string) => value.slice(0, 10))
        : []
    );

    const classDates: string[] = [];
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const currentDate = formatDateOnly(cursor);
      if (uniqueWeekdays.includes(cursor.getDay()) && !excludedDateSet.has(currentDate)) {
        classDates.push(currentDate);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (classDates.length === 0) {
      return res.status(400).json({ error: 'No classes to create for the given recurrence rule' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const seriesResult = await client.query(
        `INSERT INTO yoga_class_series
         (title, instructor_name, start_time, end_time, max_capacity, is_open, notes, recurrence_start_date, recurrence_end_date, weekdays)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          title,
          instructor_name || null,
          start_time,
          end_time,
          max_capacity,
          is_open ?? true,
          notes || null,
          recurrence_start_date,
          recurrence_end_date,
          uniqueWeekdays,
        ]
      );

      const seriesId = seriesResult.rows[0].id as number;
      const values: any[] = [];
      const rows: string[] = [];
      let paramIndex = 1;

      classDates.forEach((classDate) => {
        rows.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, FALSE, NULL)`
        );

        values.push(
          title,
          instructor_name || null,
          classDate,
          start_time,
          end_time,
          max_capacity,
          is_open ?? true,
          notes || null,
          seriesId,
        );

        paramIndex += 9;
      });

      const insertResult = await client.query(
        `INSERT INTO yoga_classes
         (title, instructor_name, class_date, start_time, end_time, max_capacity, is_open, notes, recurring_series_id, is_excluded, excluded_reason)
         VALUES ${rows.join(', ')}
         RETURNING id`,
        values
      );

      await client.query('COMMIT');
      res.status(201).json({
        series_id: seriesId,
        created_count: insertResult.rows.length,
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

// 반복 수업 중 특정 회차 제외 (관리자)
router.post('/series/:seriesId/exclusions',
  authenticate,
  requireAdmin,
  param('seriesId').isInt({ min: 1 }),
  body('class_id').optional().isInt({ min: 1 }),
  body('class_date').isDate(),
  body('reason').optional().isString().isLength({ max: 200 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const seriesId = Number(req.params.seriesId);
    const classId = req.body.class_id ? Number(req.body.class_id) : null;
    const classDate = String(req.body.class_date).slice(0, 10);
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    try {
      const updateByClassId = classId !== null;
      const result = updateByClassId
        ? await pool.query(
          `UPDATE yoga_classes
           SET is_excluded = TRUE,
               is_open = FALSE,
               excluded_reason = CASE
                 WHEN $3 = '' THEN excluded_reason
                 ELSE $3
               END
           WHERE recurring_series_id = $1
             AND id = $2
             AND is_excluded = FALSE
           RETURNING *`,
          [seriesId, classId, reason]
        )
        : await pool.query(
          `UPDATE yoga_classes
           SET is_excluded = TRUE,
               is_open = FALSE,
               excluded_reason = CASE
                 WHEN $3 = '' THEN excluded_reason
                 ELSE $3
               END
           WHERE recurring_series_id = $1
             AND class_date = $2
             AND is_excluded = FALSE
           RETURNING *`,
          [seriesId, classDate, reason]
        );

      if (result.rows.length === 0) {
        const checkResult = updateByClassId
          ? await pool.query(
            `SELECT id, is_excluded
             FROM yoga_classes
             WHERE recurring_series_id = $1
               AND id = $2`,
            [seriesId, classId]
          )
          : await pool.query(
            `SELECT id, is_excluded
             FROM yoga_classes
             WHERE recurring_series_id = $1
               AND class_date = $2`,
            [seriesId, classDate]
          );

        if (checkResult.rows.length === 0) {
          return res.status(404).json({ error: 'Recurring class occurrence not found' });
        }

        return res.status(400).json({ error: 'Class occurrence is already excluded' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Exclude recurring class occurrence error:', error);
      res.status(500).json({ error: 'Server error' });
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
      instructor_name,
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
             instructor_name = COALESCE($2, instructor_name),
             class_date = COALESCE($3, class_date),
             start_time = COALESCE($4, start_time),
             end_time = COALESCE($5, end_time),
             max_capacity = COALESCE($6, max_capacity),
             is_open = COALESCE($7, is_open),
             notes = COALESCE($8, notes)
         WHERE id = $9
         RETURNING *`,
        [
          title,
          instructor_name,
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
