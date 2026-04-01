ALTER TABLE yoga_class_registrations
  DROP CONSTRAINT IF EXISTS yoga_class_registrations_attendance_status_check;

ALTER TABLE yoga_class_registrations
  ADD CONSTRAINT yoga_class_registrations_attendance_status_check
  CHECK (attendance_status IN ('reserved', 'hold', 'attended', 'absent'));
