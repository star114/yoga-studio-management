ALTER TABLE yoga_class_registrations
  ADD COLUMN IF NOT EXISTS session_consumed BOOLEAN;

UPDATE yoga_class_registrations
SET session_consumed = attendance_status IN ('attended', 'absent')
WHERE session_consumed IS NULL;

ALTER TABLE yoga_class_registrations
  ALTER COLUMN session_consumed SET DEFAULT FALSE;

ALTER TABLE yoga_class_registrations
  ALTER COLUMN session_consumed SET NOT NULL;
