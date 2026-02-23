ALTER TABLE yoga_class_registrations
    ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) NOT NULL DEFAULT 'reserved';

UPDATE yoga_class_registrations
SET attendance_status = 'reserved'
WHERE attendance_status IS NULL;

ALTER TABLE yoga_class_registrations
    ADD CONSTRAINT yoga_class_registrations_attendance_status_check
    CHECK (attendance_status IN ('reserved', 'attended', 'absent'));

CREATE INDEX IF NOT EXISTS idx_class_registrations_attendance_status
    ON yoga_class_registrations(attendance_status);
