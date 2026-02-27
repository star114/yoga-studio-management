CREATE TABLE IF NOT EXISTS yoga_attendance_messages (
  id SERIAL PRIMARY KEY,
  attendance_id INTEGER NOT NULL REFERENCES yoga_attendances(id) ON DELETE CASCADE,
  author_role VARCHAR(20) NOT NULL CHECK (author_role IN ('admin', 'customer')),
  author_user_id INTEGER NOT NULL REFERENCES yoga_users(id) ON DELETE RESTRICT,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_messages_attendance_created
  ON yoga_attendance_messages(attendance_id, created_at, id);
