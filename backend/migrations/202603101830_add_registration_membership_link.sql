ALTER TABLE yoga_class_registrations
  ADD COLUMN IF NOT EXISTS membership_id INTEGER REFERENCES yoga_memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_registrations_membership_id
  ON yoga_class_registrations(membership_id);
