import express from 'express';
import { body } from 'express-validator';
import pool from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';

const router = express.Router();

// 회원권 종류 조회
router.get('/types', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM yoga_membership_types WHERE is_active = true ORDER BY created_at DESC'
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
  body('total_sessions').optional({ nullable: true }).isInt({ min: 0 }),
  validateRequest,
  async (req, res) => {
    const { name, description, total_sessions } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO yoga_membership_types (name, description, total_sessions)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, description || null, total_sessions || null]
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
  body('total_sessions').optional({ nullable: true }).isInt({ min: 0 }),
  validateRequest,
  async (req, res) => {
    const { id } = req.params;
    const { name, description, total_sessions, is_active } = req.body;

    try {
      const result = await pool.query(
        `UPDATE yoga_membership_types
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             total_sessions = COALESCE($3, total_sessions),
             is_active = COALESCE($4, is_active)
         WHERE id = $5
         RETURNING *`,
        [
          name,
          description,
          total_sessions,
          is_active,
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
router.delete('/types/:id', authenticate, requireAdmin, async (req, res) => {
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

// 특정 고객의 회원권 조회
router.get('/customer/:customerId', authenticate, async (req, res) => {
  const { customerId } = req.params;

  try {
    const result = await pool.query(`
      SELECT m.*, mt.name as membership_type_name, mt.description
      FROM yoga_memberships m
      LEFT JOIN yoga_membership_types mt ON m.membership_type_id = mt.id
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

      const result = await pool.query(
        `INSERT INTO yoga_memberships 
         (customer_id, membership_type_id, remaining_sessions, notes)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          customer_id,
          membership_type_id,
          membershipType.total_sessions || null,
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
    const { remaining_sessions, is_active, notes } = req.body;

    try {
      const result = await pool.query(
        `UPDATE yoga_memberships 
         SET remaining_sessions = COALESCE($1, remaining_sessions),
             is_active = COALESCE($2, is_active),
             notes = COALESCE($3, notes)
         WHERE id = $4
         RETURNING *`,
        [remaining_sessions, is_active, notes, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Membership not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update membership error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// 회원권 삭제 (관리자)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM yoga_memberships WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    res.json({ message: 'Membership deleted successfully' });
  } catch (error) {
    console.error('Delete membership error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
