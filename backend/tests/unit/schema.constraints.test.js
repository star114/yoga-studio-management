const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('attendance class_id does not conflict with ON DELETE SET NULL', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(
    schema,
    /class_id\s+INTEGER\s+REFERENCES\s+yoga_classes\(id\)\s+ON DELETE SET NULL/i
  );
  assert.doesNotMatch(
    schema,
    /class_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+yoga_classes\(id\)\s+ON DELETE SET NULL/i
  );
});

test('attendance schema does not include deprecated comment columns', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.doesNotMatch(schema, /customer_comment\s+TEXT/i);
  assert.doesNotMatch(schema, /instructor_comment\s+TEXT/i);
});

test('attendance comment thread schema exists with required constraints', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS yoga_attendance_messages/i);
  assert.match(schema, /attendance_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+yoga_attendances\(id\)\s+ON DELETE CASCADE/i);
  assert.match(schema, /author_role\s+VARCHAR\(20\)\s+NOT NULL\s+CHECK\s+\(author_role IN \('admin', 'customer'\)\)/i);
  assert.match(schema, /author_user_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+yoga_users\(id\)\s+ON DELETE RESTRICT/i);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_attendance_messages_attendance_created/i);
});
