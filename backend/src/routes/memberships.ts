import express from 'express';
import { body } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';

const router = express.Router();

const hasCustomerAccess = async (customerId: string, userId: number) => {
  const checkResult = await pool.query(
    'SELECT id FROM yoga_customers WHERE id = $1 AND user_id = $2',
    [customerId, userId]
  );
  return checkResult.rows.length > 0;
};

// 회원권 종류 조회
router.get('/types', authenticate, async (req: AuthRequest, res) => {
  try {
    const includeInactive = req.user?.role === 'admin' && req.query.include_inactive === 'true';
    const result = await pool.query(
      includeInactive
        ? 'SELECT * FROM yoga_membership_types ORDER BY created_at DESC'
        : 'SELECT * FROM yoga_membership_types WHERE is_active = true ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get membership types error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 회원권 종류 생성 (관리자)
router.post('/types',
  authenticate,
  requireAdmin,
  body('name').notEmpty(),
  body('total_sessions').isInt({ min: 1 }),
  validateRequest,
  async (req, res) => {
    const { name, description, total_sessions } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO yoga_membership_types (name, description, total_sessions)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, description || null, total_sessions]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create membership type error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 회원권 종류 수정 (관리자)
router.put('/types/:id',
  authenticate,
  requireAdmin,
  body('total_sessions').optional().isInt({ min: 1 }),
  validateRequest,
  async (req, res) => {
    const { id } = req.params;
    const { name, description, total_sessions, is_active } = req.body;

    try {
      const result = await pool.query(
        `UPDATE yoga_membership_types
         SET name = CASE
               WHEN $1::text IS NULL THEN name
               ELSE $1::text
             END,
             description = CASE
               WHEN $2::boolean THEN $3::text
               ELSE description
             END,
             total_sessions = CASE
               WHEN $4::boolean THEN $5::integer
               ELSE total_sessions
             END,
             is_active = CASE
               WHEN $6::boolean IS NULL THEN is_active
               ELSE $6::boolean
             END
         WHERE id = $7::integer
         RETURNING *`,
        [
          name ?? null,
          Object.prototype.hasOwnProperty.call(req.body, 'description'),
          description ?? null,
          Object.prototype.hasOwnProperty.call(req.body, 'total_sessions'),
          total_sessions,
          is_active ?? null,
          id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Membership type not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update membership type error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 회원권 종류 비활성화 (관리자)
router.post('/types/:id/deactivate', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE yoga_membership_types
       SET is_active = false
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membership type not found' });
    }

    res.json({ message: 'Membership type deactivated successfully' });
  } catch (error) {
    console.error('Deactivate membership type error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 회원권 종류 실제 삭제 (관리자)
router.delete('/types/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM yoga_membership_types
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membership type not found' });
    }

    res.json({ message: 'Membership type deleted successfully' });
  } catch (error) {
    console.error('Delete membership type error:', error);
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === '23503'
    ) {
      return res.status(409).json({
        error: 'Membership type cannot be deleted while memberships still reference it',
      });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// 특정 고객의 회원권 조회
router.get('/customer/:customerId', authenticate, async (req: AuthRequest, res) => {
  const { customerId } = req.params;

  if (!/^\d+$/.test(customerId)) {
    return res.status(400).json({ error: 'Invalid customerId' });
  }

  try {
    if (req.user!.role !== 'admin') {
      const allowed = await hasCustomerAccess(customerId, req.user!.id);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await pool.query(`
      SELECT
        m.*,
        mt.name as membership_type_name,
        mt.description,
        mt.total_sessions,
        COALESCE(reserved_summary.reserved_count, 0) AS reserved_count,
        GREATEST(m.remaining_sessions - COALESCE(reserved_summary.reserved_count, 0), 0) AS available_sessions,
        COALESCE(usage_summary.consumed_sessions, 0) AS consumed_sessions,
        usage.start_date,
        projection.expected_end_date
      FROM yoga_memberships m
      LEFT JOIN yoga_membership_types mt ON m.membership_type_id = mt.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS reserved_count
        FROM yoga_class_registrations r
        WHERE r.membership_id = m.id
          AND r.attendance_status = 'reserved'
      ) reserved_summary ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS consumed_sessions
        FROM yoga_class_registrations r
        WHERE r.membership_id = m.id
          AND r.attendance_status IN ('attended', 'absent')
      ) usage_summary ON true
      LEFT JOIN LATERAL (
        SELECT MIN(events.class_date) AS start_date
        FROM (
          SELECT COALESCE(cls.class_date, a.attendance_date::date) AS class_date
          FROM yoga_attendances a
          LEFT JOIN yoga_classes cls ON cls.id = a.class_id
          WHERE a.membership_id = m.id

          UNION ALL

          SELECT cls.class_date
          FROM yoga_class_registrations r
          INNER JOIN yoga_classes cls ON cls.id = r.class_id
          WHERE r.membership_id = m.id
            AND r.attendance_status = 'reserved'
        ) events
      ) usage ON true
      LEFT JOIN LATERAL (
        SELECT projected.class_date AS expected_end_date
        FROM (
          SELECT
            cls.class_date,
            ROW_NUMBER() OVER (
              ORDER BY cls.class_date ASC, cls.start_time ASC, cls.id ASC
            ) AS row_num
          FROM yoga_class_registrations r
          INNER JOIN yoga_classes cls ON cls.id = r.class_id
          WHERE r.membership_id = m.id
            AND r.attendance_status = 'reserved'
            AND cls.class_date >= CURRENT_DATE
        ) projected
        WHERE m.remaining_sessions IS NOT NULL
          AND m.remaining_sessions > 0
          AND projected.row_num = m.remaining_sessions
        LIMIT 1
      ) projection ON true
      WHERE m.customer_id = $1
      ORDER BY m.created_at DESC
    `, [customerId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get customer memberships error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 회원권 생성 (관리자)
router.post('/',
  authenticate,
  requireAdmin,
  body('customer_id').isInt(),
  body('membership_type_id').isInt(),
  validateRequest,
  async (req, res) => {
    const { customer_id, membership_type_id, notes } = req.body;

    try {
      // 회원권 종류 정보 조회
      const typeResult = await pool.query(
        'SELECT * FROM yoga_membership_types WHERE id = $1',
        [membership_type_id]
      );

      if (typeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Membership type not found' });
      }

      const membershipType = typeResult.rows[0];
      const initialRemainingSessions = Number(membershipType.total_sessions);

      if (!Number.isInteger(initialRemainingSessions) || initialRemainingSessions <= 0) {
        return res.status(400).json({ error: 'Membership type must have a positive total_sessions value' });
      }

      const result = await pool.query(
        `INSERT INTO yoga_memberships 
         (customer_id, membership_type_id, remaining_sessions, is_active, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          customer_id,
          membership_type_id,
          initialRemainingSessions,
          true,
          notes || null
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create membership error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 회원권 수정 (관리자)
router.put('/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const requestBody = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : null;

    if (requestBody === null) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }

    const { remaining_sessions, is_active, notes } = requestBody;
    const hasRemainingSessions = Object.prototype.hasOwnProperty.call(requestBody, 'remaining_sessions');
    const hasIsActive = Object.prototype.hasOwnProperty.call(requestBody, 'is_active');
    const hasNotes = Object.prototype.hasOwnProperty.call(requestBody, 'notes');

    if (
      hasRemainingSessions
      && (!Number.isInteger(remaining_sessions) || Number(remaining_sessions) < 0)
    ) {
      return res.status(400).json({ error: 'remaining_sessions must be a non-negative integer' });
    }

    if (hasIsActive && typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be boolean' });
    }

    if (hasIsActive) {
      return res.status(400).json({
        error: 'is_active is managed automatically from remaining_sessions',
      });
    }

    let client: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
      release: () => void;
    } | null = null;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const existingResult = await client.query(
        `SELECT *
         FROM yoga_memberships
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (existingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Membership not found' });
      }

      const currentMembership = existingResult.rows[0];

      if (!hasRemainingSessions && !hasNotes) {
        await client.query('COMMIT');
        return res.json(currentMembership);
      }

      const updateResult = await client.query(
        `UPDATE yoga_memberships
         SET remaining_sessions = CASE
               WHEN $1 THEN $2
               ELSE remaining_sessions
             END,
             notes = CASE
               WHEN $3 THEN $4
               ELSE notes
             END,
             is_active = CASE
               WHEN $1 THEN $2 > 0
               ELSE is_active
             END
         WHERE id = $7
         RETURNING *`,
        [
          hasRemainingSessions,
          remaining_sessions,
          hasNotes,
          notes,
          id,
        ]
      );

      await client.query('COMMIT');
      res.json(updateResult.rows[0]);
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Update membership error:', error);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client?.release();
    }
  }
);

// 회원권 삭제 (관리자)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  let client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
    release: () => void;
  } | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const membershipResult = await client.query(
      'SELECT id FROM yoga_memberships WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (membershipResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Membership not found' });
    }

    await client.query(
      `UPDATE yoga_attendances
       SET membership_id = NULL
       WHERE membership_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM yoga_class_registrations
       WHERE membership_id = $1
         AND attendance_status = 'reserved'`,
      [id]
    );

    await client.query(
      `UPDATE yoga_class_registrations
       SET membership_id = NULL
       WHERE membership_id = $1
         AND attendance_status IN ('attended', 'absent')`,
      [id]
    );

    await client.query(
      'DELETE FROM yoga_memberships WHERE id = $1 RETURNING id',
      [id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Membership deleted successfully' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Delete membership error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client?.release();
  }
});

export default router;
