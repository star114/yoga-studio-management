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

test('attendance schema includes customer_comment column', () => {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /customer_comment\s+TEXT/i);
});
