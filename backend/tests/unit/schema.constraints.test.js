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
  assert.match(
    schema,
    /membership_id\s+INTEGER\s+REFERENCES\s+yoga_memberships\(id\)\s+ON DELETE SET NULL/i
  );
  assert.match(
    schema,
    /session_deducted\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+FALSE/i
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

test('class registrations can link to memberships for reservation restoration', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(
    schema,
    /membership_id\s+INTEGER\s+REFERENCES\s+yoga_memberships\(id\)\s+ON DELETE SET NULL/i
  );
  assert.match(
    schema,
    /session_consumed\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+FALSE/i
  );
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_class_registrations_membership_id/i);
});

test('memberships schema prevents negative remaining sessions', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(
    schema,
    /total_sessions\s+INTEGER\s+NOT NULL\s+CHECK\s+\(total_sessions > 0\)/i
  );
  assert.match(
    schema,
    /remaining_sessions\s+INTEGER\s+NOT NULL\s+CHECK\s+\(remaining_sessions >= 0\)/i
  );
});

test('membership type class title set schema exists with required constraints', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS yoga_membership_type_class_titles/i);
  assert.match(
    schema,
    /membership_type_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+yoga_membership_types\(id\)\s+ON DELETE CASCADE/i
  );
  assert.match(schema, /class_title\s+VARCHAR\(100\)\s+NOT NULL/i);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_type_class_titles_unique/i);
});

test('membership usage audit schema exists with required constraints', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS yoga_membership_usage_audit_logs/i);
  assert.match(schema, /membership_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+yoga_memberships\(id\)\s+ON DELETE CASCADE/i);
  assert.match(schema, /customer_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+yoga_customers\(id\)\s+ON DELETE CASCADE/i);
  assert.match(schema, /change_amount\s+INTEGER\s+NOT NULL/i);
  assert.match(schema, /remaining_before\s+INTEGER\s+NOT NULL\s+CHECK\s+\(remaining_before >= 0\)/i);
  assert.match(schema, /remaining_after\s+INTEGER\s+NOT NULL\s+CHECK\s+\(remaining_after >= 0\)/i);
  assert.match(schema, /reason\s+VARCHAR\(100\)\s+NOT NULL/i);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_membership_usage_audit_membership_created/i);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_membership_usage_audit_customer_created/i);
});
