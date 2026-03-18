import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMembershipClassTitleMatchExistsSql,
  buildNormalizedTitleSql,
  normalizeMembershipClassTitle,
} from './membershipClassTitles';

test('normalizeMembershipClassTitle trims whitespace and normalizes nbsp', () => {
  assert.equal(normalizeMembershipClassTitle('  아침요가  '), '아침요가');
  assert.equal(normalizeMembershipClassTitle('아침요가\u00A0 3개월'), '아침요가 3개월');
  assert.equal(normalizeMembershipClassTitle('아침요가   3개월'), '아침요가 3개월');
  assert.equal(normalizeMembershipClassTitle(null), '');
  assert.equal(normalizeMembershipClassTitle(undefined), '');
});

test('buildNormalizedTitleSql wraps the expression with whitespace normalization', () => {
  const sql = buildNormalizedTitleSql('c.title');
  assert.match(sql, /regexp_replace/i);
  assert.match(sql, /COALESCE\(c\.title, ''\)/i);
});

test('buildMembershipClassTitleMatchExistsSql references the membership title set table', () => {
  const sql = buildMembershipClassTitleMatchExistsSql('m', 'c.title');
  assert.match(sql, /yoga_membership_type_class_titles/i);
  assert.match(sql, /mtct\.membership_type_id = m\.membership_type_id/i);
  assert.match(sql, /COALESCE\(c\.title, ''\)/i);
});
