ALTER TABLE yoga_attendances
  ADD COLUMN IF NOT EXISTS registration_status_before_attendance VARCHAR(20);

ALTER TABLE yoga_attendances
  DROP CONSTRAINT IF EXISTS yoga_attendances_registration_status_before_attendance_check;

ALTER TABLE yoga_attendances
  ADD CONSTRAINT yoga_attendances_registration_status_before_attendance_check
  CHECK (registration_status_before_attendance IN ('reserved', 'hold', 'absent'));
