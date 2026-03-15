import express from 'express';
import { body } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { deductMembershipSessions, refundMembershipSessions } from '../utils/membershipUsageAudit';
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

  return Number(result.rows[0].id);
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

const isValidAttendanceDateFilter = (value: string): boolean => {
  if (isValidIsoDate(value)) {
    return true;
  }

  const normalizedValue = value.includes(' ') ? value.replace(' ', 'T') : value;
  const match = normalizedValue.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(?:Z|[+-]\d{2}:\d{2})?$/
  );

  if (!match) {
    return false;
  }

  const [, datePart, hourText, minuteText, secondText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);

  if (!isValidIsoDate(datePart)) {
    return false;
  }

  return hour >= 0
    && hour <= 23
    && minute >= 0
    && minute <= 59
    && second >= 0
    && second <= 59;
};

// 출석 기록 조회 (필터링 가능)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const { customer_id, start_date, end_date, limit = 50, offset } = req.query;

  try {
    let customerIdFilter =
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

    if (customerIdFilter && !/^\d+$/.test(customerIdFilter)) {
      return res.status(400).json({ error: 'customer_id must be a positive integer' });
    }
    if (startDateFilter && !isValidAttendanceDateFilter(startDateFilter)) {
      return res.status(400).json({ error: 'start_date must be a valid ISO date or datetime' });
    }
    if (endDateFilter && !isValidAttendanceDateFilter(endDateFilter)) {
      return res.status(400).json({ error: 'end_date must be a valid ISO date or datetime' });
    }

    if (req.user!.role !== 'admin') {
      const ownCustomerId = await getCustomerIdFromUser(req.user!.id);
      if (!ownCustomerId) {
        return res.status(403).json({ error: 'Customer account not found' });
      }

      if (customerIdFilter && customerIdFilter !== String(ownCustomerId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      customerIdFilter = String(ownCustomerId);
    }

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
    const parsedOffset = Number(offset);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 200)
      : 50;
    const safeOffset = Number.isFinite(parsedOffset)
      ? Math.max(Math.trunc(parsedOffset), 0)
      : 0;
    const isPaginatedRequest = offset !== undefined;

    if (isPaginatedRequest) {
      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM yoga_attendances a
        WHERE 1=1
        ${customerIdFilter ? ` AND a.customer_id = $1` : ''}
        ${startDateFilter ? ` AND a.attendance_date >= $${customerIdFilter ? 2 : 1}` : ''}
        ${endDateFilter ? ` AND a.attendance_date <= $${
          (customerIdFilter ? 1 : 0) + (startDateFilter ? 1 : 0) + 1
        }` : ''}
      `;
      const countParams = [...params];
      const countResult = await pool.query(countQuery, countParams);

      query += ` ORDER BY a.attendance_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(safeLimit, safeOffset);

      const result = await pool.query(query, params);
      const total = Number(countResult.rows[0]?.total ?? 0);

      return res.json({
        items: result.rows,
        total,
        limit: safeLimit,
        offset: safeOffset,
        has_more: safeOffset + result.rows.length < total,
      });
    }

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
        `SELECT cls.id, cls.title, reg.id AS registration_id, reg.membership_id, reg.attendance_status, reg.session_consumed
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
      const reservedMembershipId = classResult.rows[0].membership_id as number | null | undefined;
      const currentRegistrationStatus = String(classResult.rows[0].attendance_status ?? 'reserved') as 'reserved' | 'attended' | 'absent';
      const currentRegistrationSessionConsumed = Boolean(classResult.rows[0].session_consumed);
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
      if (reservedMembershipId !== null && reservedMembershipId !== undefined) {
        const membershipResult = await client.query(
          'SELECT * FROM yoga_memberships WHERE id = $1 AND customer_id = $2',
          [reservedMembershipId, customer_id]
        );

        if (membershipResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Reserved membership not found' });
        }
        activeMembership = membershipResult.rows[0];
      } else if (membership_id) {
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

      // 결석 처리에서 이미 차감된 등록은 체크인 시 추가 차감하지 않는다.
      const shouldDeductAtAttendance = !currentRegistrationSessionConsumed;

      // 실제 차감이 필요한 경우에만 잔여 횟수를 확인한다.
      if (
        shouldDeductAtAttendance
        && (reservedMembershipId === null || reservedMembershipId === undefined)
      ) {
        if (activeMembership.remaining_sessions <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'No remaining sessions' });
        }
      }

      // 출석 기록 생성
      const attendanceResult = await client.query(
        `INSERT INTO yoga_attendances 
         (customer_id, membership_id, class_id, instructor_id, class_type, session_deducted)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          customer_id,
          activeMembership.id,
          resolvedClassId,
          req.user!.id,
          resolvedClassType || null,
          shouldDeductAtAttendance,
        ]
      );

      await client.query(
        `UPDATE yoga_class_registrations
         SET attendance_status = 'attended',
             membership_id = COALESCE(membership_id, $3),
             session_consumed = TRUE
         WHERE class_id = $1 AND customer_id = $2`,
        [resolvedClassId, customer_id, activeMembership.id]
      );

      if (
        shouldDeductAtAttendance
      ) {
        const membershipUpdateResult = await deductMembershipSessions(client, {
          membershipId: activeMembership.id,
          changeAmount: 1,
          actorUserId: req.user!.id,
          classId: resolvedClassId,
          registrationId: Number((classResult.rows[0] as { registration_id: number }).registration_id),
          attendanceId: Number((attendanceResult.rows[0] as { id: number }).id),
          reason: 'attendance_check_in',
        });

        if (!membershipUpdateResult) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Membership sessions exhausted' });
        }
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

// 출석 기록 삭제 (관리자)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
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

    const attendance = attendanceResult.rows[0] as {
      membership_id: number | null;
      class_id: number | null;
      customer_id: number;
      session_deducted: boolean;
    };

    const registrationResult = attendance.class_id
      ? await client.query(
        `SELECT id, membership_id, session_consumed
         FROM yoga_class_registrations
         WHERE class_id = $1 AND customer_id = $2
         FOR UPDATE`,
        [attendance.class_id, attendance.customer_id]
      )
      : { rows: [] };
    const registration = registrationResult.rows[0] as {
      id: number;
      membership_id: number | null;
      session_consumed?: boolean | null;
    } | undefined;

    const refundMembershipId = registration?.membership_id ?? attendance.membership_id;
    const shouldRefundConsumedSession = registration
      ? Boolean(registration.session_consumed)
      : attendance.session_deducted;

    if (refundMembershipId !== null && shouldRefundConsumedSession) {
      await refundMembershipSessions(client, {
        membershipId: refundMembershipId,
        changeAmount: 1,
        actorUserId: req.user!.id,
        classId: attendance.class_id,
        registrationId: registration?.id,
        attendanceId: Number(id),
        reason: 'attendance_delete_refund',
      });
    }

    if (attendance.class_id) {
      await client.query(
        `UPDATE yoga_class_registrations
         SET attendance_status = 'reserved'
             , session_consumed = FALSE
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
