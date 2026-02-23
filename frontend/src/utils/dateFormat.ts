import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (value: string | Date): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const normalized = value.trim();
  if (!normalized) return null;

  const date = DATE_ONLY_REGEX.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatKoreanDate = (value: string | Date, withWeekday = true): string => {
  const date = toDate(value);
  if (!date) return '-';
  return format(date, withWeekday ? 'yyyy년 M월 d일 (EEEE)' : 'yyyy년 M월 d일', { locale: ko });
};

export const formatKoreanTime = (value?: string | null): string => {
  if (!value) return '-';
  const normalized = String(value).trim();
  if (!normalized) return '-';
  return normalized.slice(0, 5);
};

export const formatKoreanDateTime = (dateValue: string | Date, timeValue?: string | null): string => {
  const dateText = formatKoreanDate(dateValue, true);
  const timeText = formatKoreanTime(timeValue);
  return timeText === '-' ? dateText : `${dateText} ${timeText}`;
};
