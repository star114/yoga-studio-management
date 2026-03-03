DO $$
DECLARE
  duplicate_phone TEXT;
  conflict_login_id TEXT;
BEGIN
  /*
   * 1) Normalize customer phone to 000-0000-0000 when value has 11 digits.
   * 2) Sync linked customer login_id to the normalized phone.
   * 3) Fail fast if normalization would create duplicate customer phones
   *    or collide with another user's login_id.
   */

  WITH normalized AS (
    SELECT
      c.id AS customer_id,
      c.user_id,
      regexp_replace(c.phone, '[^0-9]', '', 'g') AS digits,
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 1 FOR 3)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 4 FOR 4)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 8 FOR 4) AS normalized_phone
    FROM yoga_customers c
    WHERE length(regexp_replace(c.phone, '[^0-9]', '', 'g')) = 11
  ),
  dup AS (
    SELECT normalized_phone
    FROM normalized
    GROUP BY normalized_phone
    HAVING COUNT(*) > 1
    LIMIT 1
  )
  SELECT normalized_phone INTO duplicate_phone FROM dup;

  IF duplicate_phone IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize phone numbers due to duplicate normalized value: %', duplicate_phone;
  END IF;

  WITH normalized AS (
    SELECT
      c.id AS customer_id,
      c.user_id,
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 1 FOR 3)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 4 FOR 4)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 8 FOR 4) AS normalized_phone
    FROM yoga_customers c
    WHERE length(regexp_replace(c.phone, '[^0-9]', '', 'g')) = 11
  ),
  conflicts AS (
    SELECT n.normalized_phone
    FROM normalized n
    INNER JOIN yoga_users u
      ON u.login_id = n.normalized_phone
     AND u.id <> n.user_id
    LIMIT 1
  )
  SELECT normalized_phone INTO conflict_login_id FROM conflicts;

  IF conflict_login_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot sync customer login_id due to existing conflicting login_id: %', conflict_login_id;
  END IF;

  WITH normalized AS (
    SELECT
      c.id AS customer_id,
      c.user_id,
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 1 FOR 3)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 4 FOR 4)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 8 FOR 4) AS normalized_phone
    FROM yoga_customers c
    WHERE length(regexp_replace(c.phone, '[^0-9]', '', 'g')) = 11
  )
  UPDATE yoga_customers c
  SET phone = n.normalized_phone
  FROM normalized n
  WHERE c.id = n.customer_id
    AND c.phone <> n.normalized_phone;

  WITH normalized AS (
    SELECT
      c.user_id,
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 1 FOR 3)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 4 FOR 4)
      || '-' ||
      substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 8 FOR 4) AS normalized_phone
    FROM yoga_customers c
    WHERE c.user_id IS NOT NULL
      AND length(regexp_replace(c.phone, '[^0-9]', '', 'g')) = 11
  )
  UPDATE yoga_users u
  SET login_id = n.normalized_phone
  FROM normalized n
  WHERE u.id = n.user_id
    AND u.role = 'customer'
    AND u.login_id <> n.normalized_phone;
END $$;
