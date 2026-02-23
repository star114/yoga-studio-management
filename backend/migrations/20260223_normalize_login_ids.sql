-- 고객 계정 로그인 ID를 전화번호로 정규화
DO $$
DECLARE
    target_column TEXT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'yoga_users' AND column_name = 'email'
    ) THEN
        target_column := 'email';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'yoga_users' AND column_name = 'login_id'
    ) THEN
        target_column := 'login_id';
    ELSE
        target_column := NULL;
    END IF;

    IF target_column IS NOT NULL THEN
        EXECUTE format(
            $fmt$
            WITH candidates AS (
                SELECT
                    c.user_id,
                    TRIM(c.phone) AS login_value
                FROM yoga_customers c
                WHERE COALESCE(TRIM(c.phone), '') <> ''
            )
            UPDATE yoga_users u
            SET %1$I = c.login_value
            FROM candidates c
            WHERE u.id = c.user_id
              AND u.role = 'customer'
              AND u.%1$I <> c.login_value
              AND NOT EXISTS (
                  SELECT 1
                  FROM yoga_users u2
                  WHERE u2.%1$I = c.login_value
                    AND u2.id <> u.id
              )
            $fmt$,
            target_column
        );
    END IF;
END $$;

-- 레거시 관리자 계정(admin@yoga.com)을 admin 아이디로 이전
DO $$
DECLARE
    target_column TEXT;
    has_legacy_admin BOOLEAN := FALSE;
    has_admin BOOLEAN := FALSE;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'yoga_users' AND column_name = 'email'
    ) THEN
        target_column := 'email';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'yoga_users' AND column_name = 'login_id'
    ) THEN
        target_column := 'login_id';
    ELSE
        target_column := NULL;
    END IF;

    IF target_column IS NOT NULL THEN
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM yoga_users WHERE role = ''admin'' AND %I = ''admin@yoga.com'')',
            target_column
        ) INTO has_legacy_admin;

        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM yoga_users WHERE role = ''admin'' AND %I = ''admin'')',
            target_column
        ) INTO has_admin;

        IF has_legacy_admin AND NOT has_admin THEN
            EXECUTE format(
                'UPDATE yoga_users SET %1$I = ''admin'' WHERE role = ''admin'' AND %1$I = ''admin@yoga.com''',
                target_column
            );
        END IF;
    END IF;
END $$;
