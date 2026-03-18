CREATE TABLE IF NOT EXISTS yoga_membership_type_class_titles (
    id SERIAL PRIMARY KEY,
    membership_type_id INTEGER NOT NULL REFERENCES yoga_membership_types(id) ON DELETE CASCADE,
    class_title VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_type_class_titles_unique
    ON yoga_membership_type_class_titles(membership_type_id, class_title);

INSERT INTO yoga_membership_type_class_titles (membership_type_id, class_title)
SELECT
  id,
  regexp_replace(trim(replace(name, chr(160), ' ')), '[[:space:]]+', ' ', 'g')
FROM yoga_membership_types
ON CONFLICT (membership_type_id, class_title) DO NOTHING;
