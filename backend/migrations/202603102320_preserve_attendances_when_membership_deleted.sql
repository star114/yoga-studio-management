ALTER TABLE yoga_attendances
  DROP CONSTRAINT IF EXISTS yoga_attendances_membership_id_fkey;

ALTER TABLE yoga_attendances
  ADD CONSTRAINT yoga_attendances_membership_id_fkey
  FOREIGN KEY (membership_id)
  REFERENCES yoga_memberships(id)
  ON DELETE SET NULL;
