import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

const normalizePhoneNumber = (value: string): string | null => {
  const digits = String(value).replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) {
    return null;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

const hasCustomerAccess = async (customerId: string, userId: number) => {
  const checkResult = await pool.query(
    'SELECT id FROM yoga_customers WHERE id = $1 AND user_id = $2',
    [customerId, userId]
  );
  return checkResult.rows.length > 0;
};

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

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid customerId' });
  }

  try {
    // 일반 사용자는 자기 정보만 조회 가능
    if (req.user!.role !== 'admin') {
      const hasAccess = await hasCustomerAccess(id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

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

// 특정 고객 수업 활동(출석/예약/결석) 조회
router.get('/:id/class-activities', authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const rawPage = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
  const rawPageSize = typeof req.query.page_size === 'string' ? Number(req.query.page_size) : 10;
  const rawActivityType = typeof req.query.activity_type === 'string'
    ? req.query.activity_type
    : 'all';
  const rawSearch = typeof req.query.search === 'string' ? req.query.search : '';
  const rawDateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
  const rawDateTo = typeof req.query.date_to === 'string' ? req.query.date_to : '';

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(Math.floor(rawPageSize), 100)
    : 10;
  const offset = (page - 1) * pageSize;
  const activityType = ['all', 'attended', 'reserved', 'absent'].includes(rawActivityType)
    ? rawActivityType
    : 'all';
  const search = rawSearch.trim();
  const dateFrom = rawDateFrom.trim();
  const dateTo = rawDateTo.trim();

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid customerId' });
  }
  if (dateFrom && !isValidIsoDate(dateFrom)) {
    return res.status(400).json({ error: 'date_from must be a valid YYYY-MM-DD date' });
  }
  if (dateTo && !isValidIsoDate(dateTo)) {
    return res.status(400).json({ error: 'date_to must be a valid YYYY-MM-DD date' });
  }

  try {
    // 일반 사용자는 자기 정보만 조회 가능
    if (req.user!.role !== 'admin') {
      const hasAccess = await hasCustomerAccess(id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const whereClauses = ['1=1'];
    const queryParams: Array<number | string> = [id];

    if (activityType !== 'all') {
      queryParams.push(activityType);
      whereClauses.push(`h.activity_type = $${queryParams.length}`);
    }

    if (search) {
      queryParams.push(`%${search}%`);
      whereClauses.push(`COALESCE(h.class_title, h.class_type, '') ILIKE $${queryParams.length}`);
    }

    if (dateFrom) {
      queryParams.push(dateFrom);
      whereClauses.push(`h.class_day >= $${queryParams.length}::date`);
    }

    if (dateTo) {
      queryParams.push(dateTo);
      whereClauses.push(`h.class_day <= $${queryParams.length}::date`);
    }

    const whereSql = whereClauses.join(' AND ');
    const withSql = `
      WITH history AS (
        SELECT
          'attended'::text AS activity_type,
          a.id::int AS activity_id,
          cls.id::int AS class_id,
          cls.title::text AS class_title,
          COALESCE(a.class_type, cls.title)::text AS class_type,
          COALESCE(cls.class_date::date, a.attendance_date::date) AS class_day,
          cls.class_date,
          cls.start_time AS class_start_time,
          cls.end_time AS class_end_time,
          a.attendance_date,
          NULL::timestamp AS registered_at,
          COALESCE(
            (cls.class_date::timestamp + cls.start_time),
            a.attendance_date
          ) AS sort_at
        FROM yoga_attendances a
        LEFT JOIN yoga_classes cls ON cls.id = a.class_id
        WHERE a.customer_id = $1

        UNION ALL

        SELECT
          'reserved'::text AS activity_type,
          r.id::int AS activity_id,
          cls.id::int AS class_id,
          cls.title::text AS class_title,
          cls.title::text AS class_type,
          cls.class_date::date AS class_day,
          cls.class_date,
          cls.start_time AS class_start_time,
          cls.end_time AS class_end_time,
          NULL::timestamp AS attendance_date,
          r.registered_at,
          (cls.class_date::timestamp + cls.start_time) AS sort_at
        FROM yoga_class_registrations r
        INNER JOIN yoga_classes cls ON cls.id = r.class_id
        WHERE r.customer_id = $1
          AND r.attendance_status = 'reserved'

        UNION ALL

        SELECT
          'absent'::text AS activity_type,
          r.id::int AS activity_id,
          cls.id::int AS class_id,
          cls.title::text AS class_title,
          cls.title::text AS class_type,
          cls.class_date::date AS class_day,
          cls.class_date,
          cls.start_time AS class_start_time,
          cls.end_time AS class_end_time,
          NULL::timestamp AS attendance_date,
          r.registered_at,
          (cls.class_date::timestamp + cls.start_time) AS sort_at
        FROM yoga_class_registrations r
        INNER JOIN yoga_classes cls ON cls.id = r.class_id
        WHERE r.customer_id = $1
          AND r.attendance_status = 'absent'
      )
    `;

    const countResult = await pool.query(
      `${withSql}
       SELECT COUNT(*)::int AS total
       FROM history h
       WHERE ${whereSql}`,
      queryParams
    );
    const total = countResult.rows[0]?.total ?? 0;

    const limitParamIndex = queryParams.length + 1;
    const offsetParamIndex = queryParams.length + 2;
    const result = await pool.query(
      `${withSql}
       SELECT
         h.activity_type,
         h.activity_id,
         h.class_id,
         h.class_title,
         h.class_type,
         h.class_date,
         h.class_start_time,
         h.class_end_time,
         h.attendance_date,
         h.registered_at
       FROM history h
       WHERE ${whereSql}
       ORDER BY h.sort_at DESC, h.activity_id DESC
       LIMIT $${limitParamIndex}
       OFFSET $${offsetParamIndex}`,
      [...queryParams, pageSize, offset]
    );

    res.json({
      items: result.rows,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filter: {
        activity_type: activityType,
        search,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      },
    });
  } catch (error) {
    console.error('Get customer class activities error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 특정 고객의 회원권명 기준 예정 수업 추천 조회
router.get('/:id/recommended-classes', authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const rawMembershipName = typeof req.query.membership_name === 'string'
    ? req.query.membership_name
    : '';
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
  const membershipName = rawMembershipName.trim();
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), 100)
    : 20;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid customerId' });
  }
  if (!membershipName) {
    return res.status(400).json({ error: 'membership_name is required' });
  }

  try {
    if (req.user!.role !== 'admin') {
      const hasAccess = await hasCustomerAccess(id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
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
         COUNT(r.id)::int AS current_enrollment,
         GREATEST(c.max_capacity - COUNT(r.id), 0)::int AS remaining_seats,
         EXISTS (
           SELECT 1
           FROM yoga_class_registrations mine
           WHERE mine.class_id = c.id
             AND mine.customer_id = $1
             AND mine.attendance_status = 'reserved'
         ) AS is_registered
       FROM yoga_classes c
       LEFT JOIN yoga_class_registrations r ON r.class_id = c.id
       WHERE c.is_open = TRUE
         AND (c.class_date::timestamp + c.end_time) > CURRENT_TIMESTAMP
         AND regexp_replace(
               trim(replace(COALESCE(c.title, ''), chr(160), ' ')),
               '[[:space:]]+',
               ' ',
               'g'
             ) = regexp_replace(
               trim(replace($2::text, chr(160), ' ')),
               '[[:space:]]+',
               ' ',
               'g'
             )
       GROUP BY c.id
       ORDER BY c.class_date ASC, c.start_time ASC
       LIMIT $3`,
      [id, membershipName, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get recommended classes error:', error);
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

    const { name, phone, notes } = req.body as {
      name: string;
      phone: string;
      notes?: string;
    };
    const trimmedPhone = phone.trim();

    const normalizedPhone = normalizePhoneNumber(trimmedPhone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: '전화번호 형식은 000-0000-0000 이어야 합니다.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (normalizedPhone) {
        const phoneCheck = await client.query(
          `SELECT id
           FROM yoga_customers
           WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
                 = regexp_replace($1, '[^0-9]', '', 'g')
           LIMIT 1`,
          [normalizedPhone]
        );
        if (phoneCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Phone already exists' });
        }
      }

      // 사용자 계정 생성
      const passwordHash = await bcrypt.hash('12345', 10);
      const loginId = normalizedPhone;
      const userResult = await client.query(
        'INSERT INTO yoga_users (login_id, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [loginId, passwordHash, 'customer']
      );

      const userId = userResult.rows[0].id;

      // 고객 정보 생성
      const customerResult = await client.query(
        `INSERT INTO yoga_customers (user_id, name, phone, notes)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, name, normalizedPhone, notes || null]
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
    const requestBody = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    const { name, phone, notes } = requestBody;
    const hasPhoneField = Object.prototype.hasOwnProperty.call(requestBody, 'phone');
    const hasNotesField = Object.prototype.hasOwnProperty.call(requestBody, 'notes');
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : null;
    const normalizedPhone = hasPhoneField && trimmedPhone
      ? normalizePhoneNumber(trimmedPhone)
      : null;

    if (hasPhoneField && !trimmedPhone) {
      return res.status(400).json({ error: '전화번호는 필수입니다.' });
    }
    if (hasPhoneField && !normalizedPhone) {
      return res.status(400).json({ error: '전화번호 형식은 000-0000-0000 이어야 합니다.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE yoga_customers 
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             notes = CASE
               WHEN $3 THEN $4
               ELSE notes
             END
         WHERE id = $5
         RETURNING *`,
        [name, hasPhoneField ? normalizedPhone : null, hasNotesField, notes ?? null, id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (hasPhoneField) {
        await client.query(
          `UPDATE yoga_users u
           SET login_id = $1
           FROM yoga_customers c
           WHERE c.id = $2
             AND u.id = c.user_id`,
          [normalizedPhone, id]
        );
      }

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Update customer error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Login ID already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
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
