DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'yoga_users'
          AND column_name = 'email'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'yoga_users'
          AND column_name = 'login_id'
    ) THEN
        ALTER TABLE yoga_users RENAME COLUMN email TO login_id;
    END IF;
END $$;
