import test from 'node:test';
import assert from 'node:assert/strict';
import { isMembershipTitleMatch, sortMembershipRowsByTitleMatch } from './membershipTitleMatch';

test('isMembershipTitleMatch returns true for exact matches after whitespace normalization', () => {
  assert.equal(isMembershipTitleMatch('아침요가', '아침요가'), true);
  assert.equal(isMembershipTitleMatch('  아침요가  ', '아침요가'), true);
  assert.equal(isMembershipTitleMatch('아침요가\u00A0', '아침요가'), true);
});

test('isMembershipTitleMatch returns true when non-letter suffixes follow the class title', () => {
  assert.equal(isMembershipTitleMatch('아침요가 3개월', '아침요가'), true);
  assert.equal(isMembershipTitleMatch('아침요가 1회권', '아침요가'), true);
  assert.equal(isMembershipTitleMatch('아침요가 + 설명', '아침요가'), true);
  assert.equal(isMembershipTitleMatch('아침요가(주3회)', '아침요가'), true);
  assert.equal(isMembershipTitleMatch('아침요가3개월', '아침요가'), true);
});

test('isMembershipTitleMatch returns false when letters continue after the class title', () => {
  assert.equal(isMembershipTitleMatch('아침요가심화', '아침요가'), false);
  assert.equal(isMembershipTitleMatch('MorningYogaPlus', 'MorningYoga'), false);
  assert.equal(isMembershipTitleMatch('저녁아침요가', '아침요가'), false);
});

test('isMembershipTitleMatch returns false when either side is empty', () => {
  assert.equal(isMembershipTitleMatch('', '아침요가'), false);
  assert.equal(isMembershipTitleMatch('아침요가 3개월', ''), false);
  assert.equal(isMembershipTitleMatch(null, '아침요가'), false);
});

test('sortMembershipRowsByTitleMatch prioritizes matching rows and newer rows within the same group', () => {
  const sorted = sortMembershipRowsByTitleMatch([
    { id: 1, membership_type_name: '저녁요가', created_at: '2026-03-10T09:00:00Z' },
    { id: 2, membership_type_name: '아침요가 1회권', created_at: '2026-03-12T09:00:00Z' },
    { id: 3, membership_type_name: '아침요가', created_at: '2026-03-11T09:00:00Z' },
  ], '아침요가');

  assert.deepEqual(sorted.map((item) => item.id), [2, 3, 1]);
});

test('sortMembershipRowsByTitleMatch honors precomputed title-match flags and missing timestamps', () => {
  const sorted = sortMembershipRowsByTitleMatch([
    { id: 1, membership_type_name: null, is_title_match: false, created_at: null },
    { id: 2, membership_type_name: null, is_title_match: true, created_at: null },
  ], '아침요가');

  assert.deepEqual(sorted.map((item) => item.id), [2, 1]);
});

test('sortMembershipRowsByTitleMatch falls back to created_at when match scores are equal', () => {
  const sorted = sortMembershipRowsByTitleMatch([
    { id: 1, membership_type_name: null, is_title_match: false, created_at: '2026-03-09T09:00:00Z' },
    { id: 2, membership_type_name: null, is_title_match: false, created_at: null },
  ], '아침요가');

  assert.deepEqual(sorted.map((item) => item.id), [1, 2]);
});

test('sortMembershipRowsByTitleMatch handles newer right-hand timestamps when scores are equal', () => {
  const sorted = sortMembershipRowsByTitleMatch([
    { id: 1, membership_type_name: null, is_title_match: false, created_at: null },
    { id: 2, membership_type_name: null, is_title_match: false, created_at: '2026-03-09T09:00:00Z' },
  ], '아침요가');

  assert.deepEqual(sorted.map((item) => item.id), [2, 1]);
});
