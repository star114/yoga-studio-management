import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecurringClassDates, isValidTime, timeToMinutes } from './classSchedule';

test('isValidTime validates HH:mm and HH:mm:ss format', () => {
  assert.equal(isValidTime('07:00'), true);
  assert.equal(isValidTime('07:00:59'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('07:60'), false);
});

test('timeToMinutes converts time string into minute offset', () => {
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('07:30'), 450);
  assert.equal(timeToMinutes('23:59'), 1439);
});

test('getRecurringClassDates throws when end date is earlier than start date', () => {
  assert.throws(
    () => getRecurringClassDates('2026-06-10', '2026-06-01', [2, 4]),
    /recurrence_end_date must be on or after recurrence_start_date/
  );
});

test('getRecurringClassDates throws when recurrence range exceeds 370 days', () => {
  assert.throws(
    () => getRecurringClassDates('2026-01-01', '2027-02-10', [2, 4]),
    /Recurring range cannot exceed 370 days/
  );
});

test('getRecurringClassDates builds weekday-based schedule and applies exclusions', () => {
  const dates = getRecurringClassDates(
    '2026-01-01',
    '2026-01-15',
    [2, 4],
    ['2026-01-08']
  );

  assert.deepEqual(dates, ['2026-01-01', '2026-01-06', '2026-01-13', '2026-01-15']);
});

test('getRecurringClassDates returns empty when no weekday matches in range', () => {
  const dates = getRecurringClassDates('2026-01-01', '2026-01-01', [2]);
  assert.deepEqual(dates, []);
});

test('getRecurringClassDates handles empty weekdays input', () => {
  const dates = getRecurringClassDates('2026-01-01', '2026-01-07', []);
  assert.deepEqual(dates, []);
});

test('getRecurringClassDates handles undefined weekdays and non-array exclusions', () => {
  const dates = getRecurringClassDates(
    '2026-01-01',
    '2026-01-07',
    undefined as unknown as number[],
    null as unknown as string[]
  );
  assert.deepEqual(dates, []);
});
