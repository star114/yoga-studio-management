ALTER TABLE yoga_memberships
  DROP CONSTRAINT IF EXISTS yoga_memberships_remaining_sessions_nonnegative;

ALTER TABLE yoga_memberships
  ADD CONSTRAINT yoga_memberships_remaining_sessions_nonnegative
  CHECK (remaining_sessions IS NULL OR remaining_sessions >= 0);
