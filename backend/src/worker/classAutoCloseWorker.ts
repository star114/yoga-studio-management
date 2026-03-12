import pool from '../config/database';

const toBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toPositiveInt = (value: string | undefined, defaultValue: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.floor(parsed);
};

export const startClassAutoCloseWorker = () => {
  const enabled = toBool(process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED, true);
  const intervalMs = toPositiveInt(process.env.CLASS_AUTO_CLOSE_INTERVAL_MS, 60_000);

  if (!enabled) {
    console.log('ℹ️ Class auto-close worker is disabled');
    return () => undefined;
  }

  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const attendanceSyncResult = await pool.query(
        `WITH eligible AS (
           SELECT
             r.id AS registration_id,
             r.class_id,
             r.customer_id,
             c.title AS class_title,
             r.membership_id AS reserved_membership_id,
             r.session_consumed
           FROM yoga_class_registrations r
           INNER JOIN yoga_classes c ON c.id = r.class_id
           WHERE c.is_open = TRUE
             AND r.attendance_status = 'reserved'
             AND (c.class_date::timestamp + c.end_time) <= CURRENT_TIMESTAMP
           FOR UPDATE OF r SKIP LOCKED
         ),
         without_attendance AS (
           SELECT e.*
           FROM eligible e
           WHERE NOT EXISTS (
             SELECT 1
             FROM yoga_attendances a
             WHERE a.class_id = e.class_id
               AND a.customer_id = e.customer_id
           )
         ),
         membership_candidates AS (
           SELECT
             wa.registration_id,
             wa.class_id,
             wa.customer_id,
             wa.class_title,
             m.id AS membership_id,
             NOT wa.session_consumed AS should_decrement_membership,
             m.remaining_sessions,
             ROW_NUMBER() OVER (
               PARTITION BY wa.registration_id
               ORDER BY
                 CASE
                   WHEN wa.reserved_membership_id IS NOT NULL
                     AND m.id = wa.reserved_membership_id THEN -1
                   WHEN mt.name = wa.class_title THEN 0
                   ELSE 1
                 END,
                 m.created_at DESC,
                 m.id DESC
             ) AS rn
           FROM without_attendance wa
           INNER JOIN yoga_memberships m ON (
             (wa.reserved_membership_id IS NOT NULL AND m.id = wa.reserved_membership_id)
             OR (
               wa.reserved_membership_id IS NULL
               AND m.customer_id = wa.customer_id
               AND m.is_active = TRUE
               AND m.remaining_sessions > 0
             )
           )
           LEFT JOIN yoga_membership_types mt ON mt.id = m.membership_type_id
         ),
         selected_memberships AS (
           SELECT
             registration_id,
             class_id,
             customer_id,
             class_title,
             membership_id,
             should_decrement_membership,
             remaining_sessions
           FROM membership_candidates
           WHERE rn = 1
         ),
         decrementable_events AS (
           SELECT
             sm.registration_id,
             sm.class_id,
             sm.customer_id,
             sm.class_title,
             sm.membership_id,
             sm.should_decrement_membership,
             sm.remaining_sessions,
             ROW_NUMBER() OVER (
               PARTITION BY sm.membership_id
               ORDER BY sm.class_id ASC, sm.customer_id ASC, sm.registration_id ASC
             ) AS event_index
           FROM selected_memberships sm
           WHERE sm.should_decrement_membership = TRUE
         ),
         processable_selected AS (
           SELECT
             sm.registration_id,
             sm.class_id,
             sm.customer_id,
             sm.class_title,
             sm.membership_id,
             sm.should_decrement_membership
           FROM selected_memberships sm
           WHERE sm.should_decrement_membership = FALSE
           UNION ALL
           SELECT
             de.registration_id,
             de.class_id,
             de.customer_id,
             de.class_title,
             de.membership_id,
             de.should_decrement_membership
           FROM decrementable_events de
           WHERE de.event_index <= de.remaining_sessions
        ),
        membership_usage AS (
          SELECT sm.membership_id, COUNT(*)::int AS used_count
          FROM processable_selected sm
          WHERE sm.should_decrement_membership = TRUE
          GROUP BY sm.membership_id
        ),
        updated_memberships AS (
          UPDATE yoga_memberships m
          SET remaining_sessions = m.remaining_sessions - u.used_count,
              is_active = CASE
                WHEN (m.remaining_sessions - u.used_count) <= 0 THEN FALSE
                ELSE TRUE
              END
          FROM membership_usage u
          WHERE m.id = u.membership_id
            AND m.remaining_sessions >= u.used_count
          RETURNING
            m.id,
            m.customer_id,
            u.used_count,
            m.remaining_sessions + u.used_count AS remaining_before,
            m.remaining_sessions AS remaining_after
        ),
        inserted AS (
           INSERT INTO yoga_attendances (
             customer_id,
             membership_id,
             class_id,
             class_type,
             session_deducted
           )
           SELECT
             sm.customer_id,
             sm.membership_id,
             sm.class_id,
             sm.class_title,
             sm.should_decrement_membership
           FROM processable_selected sm
           LEFT JOIN updated_memberships um
             ON um.id = sm.membership_id
           WHERE (
             sm.should_decrement_membership = FALSE
             OR um.id IS NOT NULL
           )
             AND NOT EXISTS (
               SELECT 1
               FROM yoga_attendances a
               WHERE a.class_id = sm.class_id
                 AND a.customer_id = sm.customer_id
             )
           RETURNING id, customer_id, membership_id, class_id
         ),
         updated_registrations AS (
           UPDATE yoga_class_registrations r
           SET attendance_status = 'attended'
             , session_consumed = TRUE
           FROM inserted i
           WHERE r.class_id = i.class_id
             AND r.customer_id = i.customer_id
             AND r.attendance_status = 'reserved'
           RETURNING r.id
        ),
        membership_usage_events AS (
          SELECT
            i.membership_id,
             i.customer_id,
             i.class_id,
             ROW_NUMBER() OVER (
               PARTITION BY i.membership_id
               ORDER BY i.class_id ASC, i.id ASC
             ) AS event_index
           FROM inserted i
           INNER JOIN selected_memberships sm
             ON sm.class_id = i.class_id
            AND sm.customer_id = i.customer_id
           WHERE sm.should_decrement_membership = TRUE
        ),
        audit_logs AS (
           INSERT INTO yoga_membership_usage_audit_logs (
             membership_id,
             customer_id,
             class_id,
             change_amount,
             remaining_before,
             remaining_after,
             reason,
             note
           )
           SELECT
             ume.membership_id,
             ume.customer_id,
             ume.class_id,
             -1,
             um.remaining_before - (ume.event_index - 1),
             um.remaining_before - ume.event_index,
             'auto_close_attendance',
             'Auto-closed completed class attendance'
           FROM membership_usage_events ume
           INNER JOIN updated_memberships um ON um.id = ume.membership_id
           RETURNING id
         )
         SELECT
           (SELECT COUNT(*)::int FROM eligible) AS eligible_count,
           (SELECT COUNT(*)::int FROM without_attendance) AS no_attendance_count,
           (SELECT COUNT(*)::int FROM selected_memberships) AS selected_count,
           (SELECT COUNT(*)::int FROM processable_selected) AS processable_count,
           (SELECT COUNT(*)::int FROM inserted) AS inserted_count,
           (SELECT COUNT(*)::int FROM updated_registrations) AS updated_registration_count,
           (SELECT COUNT(*)::int FROM updated_memberships) AS updated_membership_count,
           (SELECT COUNT(*)::int FROM audit_logs) AS audit_log_count`
      );

      const attendanceSummary = attendanceSyncResult.rows[0] ?? {
        eligible_count: 0,
        no_attendance_count: 0,
        selected_count: 0,
        inserted_count: 0,
        updated_registration_count: 0,
        updated_membership_count: 0,
      };

      const insertedCount = Number(attendanceSummary.inserted_count ?? 0);
      const noAttendanceCount = Number(attendanceSummary.no_attendance_count ?? 0);
      const selectedCount = Number(attendanceSummary.selected_count ?? 0);
      const skippedCount = Math.max(noAttendanceCount - insertedCount, 0);
      const noMembershipCount = Math.max(noAttendanceCount - selectedCount, 0);

      if (insertedCount > 0) {
        console.log(
          `✅ Auto-processed ${insertedCount} attendance(s) `
          + `(registrations: ${Number(attendanceSummary.updated_registration_count ?? 0)}, `
          + `memberships: ${Number(attendanceSummary.updated_membership_count ?? 0)})`
        );
      }

      if (skippedCount > 0) {
        console.warn(
          `⚠️ Auto-attendance skipped ${skippedCount} registration(s)`
          + `${noMembershipCount > 0 ? ` (no eligible membership: ${noMembershipCount})` : ''}`
        );
      }

      const result = await pool.query(
         `UPDATE yoga_classes
          SET is_open = FALSE,
              updated_at = CURRENT_TIMESTAMP
         WHERE is_open = TRUE
           AND (class_date::timestamp + end_time) <= CURRENT_TIMESTAMP
         RETURNING id`
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`🔒 Auto-closed ${result.rowCount} completed class(es)`);
      }
    } catch (error) {
      console.error('❌ Class auto-close worker failed:', error);
    } finally {
      running = false;
    }
  };

  // Run once immediately on startup, then continue on interval.
  void run();
  timer = setInterval(() => {
    void run();
  }, intervalMs);

  console.log(`✅ Class auto-close worker started (interval: ${intervalMs}ms)`);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      console.log('🛑 Class auto-close worker stopped');
    }
  };
};
