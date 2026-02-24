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
      const attendanceResult = await pool.query(
        `UPDATE yoga_class_registrations r
         SET attendance_status = 'attended'
         FROM yoga_classes c
         WHERE r.class_id = c.id
           AND r.attendance_status = 'reserved'
           AND (c.class_date::timestamp + c.start_time + INTERVAL '15 minutes') <= CURRENT_TIMESTAMP
         RETURNING r.id`
      );

      if (attendanceResult.rowCount && attendanceResult.rowCount > 0) {
        console.log(`✅ Auto-marked ${attendanceResult.rowCount} registration(s) as attended`);
      }

      const result = await pool.query(
        `UPDATE yoga_classes
         SET is_open = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE is_open = TRUE
           AND (class_date::timestamp + start_time + INTERVAL '15 minutes') <= CURRENT_TIMESTAMP
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
