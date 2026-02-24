import { describe, expect, it } from 'vitest';
import { formatKoreanDate, formatKoreanDateTime, formatKoreanTime } from './dateFormat';

describe('dateFormat utils', () => {
  it('formatKoreanDate handles invalid and valid values', () => {
    expect(formatKoreanDate('')).toBe('-');
    expect(formatKoreanDate('   ')).toBe('-');
    expect(formatKoreanDate('invalid-date')).toBe('-');
    expect(formatKoreanDate(new Date('invalid'))).toBe('-');

    expect(formatKoreanDate('2026-02-01', false)).toBe('2026년 2월 1일');
    expect(formatKoreanDate('2026-02-01')).toContain('2026년 2월 1일');
  });

  it('formatKoreanDate handles full datetime string and Date object', () => {
    expect(formatKoreanDate('2026-02-01T09:30:00Z', false)).toBe('2026년 2월 1일');
    expect(formatKoreanDate(new Date('2026-02-01T09:30:00'))).toContain('2026년 2월 1일');
  });

  it('formatKoreanTime handles empty, blank, and normal time', () => {
    expect(formatKoreanTime()).toBe('-');
    expect(formatKoreanTime(null)).toBe('-');
    expect(formatKoreanTime('   ')).toBe('-');
    expect(formatKoreanTime('09:30:00')).toBe('09:30');
    expect(formatKoreanTime('09:30')).toBe('09:30');
  });

  it('formatKoreanDateTime joins date/time and handles missing time', () => {
    expect(formatKoreanDateTime('2026-02-01', '09:30:00')).toContain('2026년 2월 1일');
    expect(formatKoreanDateTime('2026-02-01', '09:30:00')).toContain('09:30');

    expect(formatKoreanDateTime('2026-02-01', '')).toContain('2026년 2월 1일');
    expect(formatKoreanDateTime('invalid-date', '09:30:00')).toBe('- 09:30');
  });
});
