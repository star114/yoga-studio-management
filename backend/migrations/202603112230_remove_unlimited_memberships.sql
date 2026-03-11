DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yoga_membership_types
    WHERE total_sessions IS NULL OR total_sessions <= 0
  ) THEN
    RAISE EXCEPTION 'Cannot remove unlimited memberships while membership types with NULL/non-positive total_sessions exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM yoga_memberships
    WHERE remaining_sessions IS NULL OR remaining_sessions < 0
  ) THEN
    RAISE EXCEPTION 'Cannot remove unlimited memberships while memberships with NULL/negative remaining_sessions exist';
  END IF;
END $$;

ALTER TABLE yoga_membership_types
  DROP CONSTRAINT IF EXISTS yoga_membership_types_total_sessions_check;

ALTER TABLE yoga_membership_types
  ALTER COLUMN total_sessions SET NOT NULL;

ALTER TABLE yoga_membership_types
  ADD CONSTRAINT yoga_membership_types_total_sessions_check
  CHECK (total_sessions > 0);

ALTER TABLE yoga_memberships
  DROP CONSTRAINT IF EXISTS yoga_memberships_remaining_sessions_nonnegative;

ALTER TABLE yoga_memberships
  ALTER COLUMN remaining_sessions SET NOT NULL;

ALTER TABLE yoga_memberships
  ADD CONSTRAINT yoga_memberships_remaining_sessions_nonnegative
  CHECK (remaining_sessions >= 0);
