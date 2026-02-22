WITH attendance_match AS (
    SELECT
        src.id AS attendance_id,
        matched.class_id,
        matched.class_title
    FROM yoga_attendances src
    LEFT JOIN LATERAL (
        SELECT
            cls.id AS class_id,
            cls.title AS class_title
        FROM yoga_class_registrations reg
        INNER JOIN yoga_classes cls ON cls.id = reg.class_id
        WHERE reg.customer_id = src.customer_id
          AND cls.class_date = DATE(src.attendance_date)
        ORDER BY ABS(EXTRACT(EPOCH FROM ((cls.class_date::timestamp + cls.start_time) - src.attendance_date))) ASC,
                 cls.start_time ASC
        LIMIT 1
    ) matched ON TRUE
    WHERE src.class_id IS NULL
)
UPDATE yoga_attendances tgt
SET
    class_id = attendance_match.class_id,
    class_type = COALESCE(tgt.class_type, attendance_match.class_title)
FROM attendance_match
WHERE tgt.id = attendance_match.attendance_id
  AND attendance_match.class_id IS NOT NULL;

DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
      INTO remaining_count
      FROM yoga_attendances
     WHERE class_id IS NULL;

    IF remaining_count > 0 THEN
        RAISE EXCEPTION 'Cannot set NOT NULL on yoga_attendances.class_id: % row(s) still NULL', remaining_count;
    END IF;
END $$;

ALTER TABLE yoga_attendances
    ALTER COLUMN class_id SET NOT NULL;
