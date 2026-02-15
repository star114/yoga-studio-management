export const isValidTime = (value: string): boolean => {
  return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value);
};

export const timeToMinutes = (value: string): number => {
  const [hour, minute] = value.split(':').map((item) => Number(item));
  return hour * 60 + minute;
};

const parseDateOnly = (value: string): Date => new Date(`${value}T00:00:00`);

const formatDateOnly = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getRecurringClassDates = (
  recurrenceStartDate: string,
  recurrenceEndDate: string,
  weekdays: number[],
  excludedDates?: string[]
): string[] => {
  const startDate = parseDateOnly(recurrenceStartDate);
  const endDate = parseDateOnly(recurrenceEndDate);

  if (startDate > endDate) {
    throw new Error('recurrence_end_date must be on or after recurrence_start_date');
  }

  const dayDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff > 370) {
    throw new Error('Recurring range cannot exceed 370 days');
  }

  const uniqueWeekdays = Array.from(new Set((weekdays || []).map((value) => Number(value))));
  const excludedDateSet = new Set(
    Array.isArray(excludedDates)
      ? excludedDates.map((value) => value.slice(0, 10))
      : []
  );

  const classDates: string[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const currentDate = formatDateOnly(cursor);
    if (uniqueWeekdays.includes(cursor.getDay()) && !excludedDateSet.has(currentDate)) {
      classDates.push(currentDate);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return classDates;
};
