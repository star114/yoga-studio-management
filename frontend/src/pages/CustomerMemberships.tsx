import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { attendanceAPI, classAPI, membershipAPI } from '../services/api';
import { formatKoreanDate } from '../utils/dateFormat';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';

interface CustomerMembership {
  id: number;
  membership_type_name: string;
  remaining_sessions?: number | null;
  is_active: boolean;
  start_date?: string | null;
  expected_end_date?: string | null;
}

interface CustomerAttendance {
  id: number;
  class_id?: number | null;
  attendance_date: string;
  class_type?: string | null;
  class_title?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  class_end_time?: string | null;
}

interface MyRegistrationClass {
  registration_id: number;
  class_id: number | null;
  attendance_status: 'reserved' | 'attended' | 'absent';
  title: string;
  class_date: string;
  start_time?: string | null;
  end_time?: string | null;
}

interface CustomerCalendarEntry {
  id: string;
  class_id: number | null;
  title: string;
  class_date: string;
  start_time?: string | null;
  end_time?: string | null;
  source: 'registration' | 'attendance';
  attendance_status?: 'reserved' | 'attended' | 'absent';
}

type CalendarView = 'month' | 'week' | 'day';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const normalizeTime = (value?: string | null) => {
  if (!value) return '';
  return value.slice(0, 5);
};

const normalizeDate = (value: string) => value.slice(0, 10);

const isAfterGraceTime = (entry: CustomerCalendarEntry, now: Date) => {
  if (!entry.start_time) return false;
  const classStart = new Date(`${normalizeDate(entry.class_date)}T${String(entry.start_time).slice(0, 8)}`);
  const graceTime = new Date(classStart.getTime() + 15 * 60 * 1000);
  return now >= graceTime;
};

const mergeCalendarEntries = (
  registrations: CustomerCalendarEntry[],
  attendances: CustomerCalendarEntry[],
) => {
  const mergedByClassId = new Map<number, CustomerCalendarEntry>();
  const withoutClassId: CustomerCalendarEntry[] = [];

  registrations.forEach((item) => {
    if (typeof item.class_id === 'number') {
      mergedByClassId.set(item.class_id, item);
      return;
    }
    withoutClassId.push(item);
  });

  attendances.forEach((item) => {
    if (typeof item.class_id === 'number') {
      mergedByClassId.set(item.class_id, item);
      return;
    }
    withoutClassId.push(item);
  });

  return [...mergedByClassId.values(), ...withoutClassId];
};

const CustomerMemberships: React.FC = () => {
  const navigate = useNavigate();
  const { customerInfo } = useAuth();
  const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<CustomerCalendarEntry[]>([]);
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [focusDate, setFocusDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);

  const loadMemberships = useCallback(async () => {
    try {
      const [membershipsRes, attendancesRes, registrationsRes] = await Promise.all([
        membershipAPI.getByCustomer(customerInfo.id),
        attendanceAPI.getAll({ customer_id: customerInfo.id, limit: 20 }),
        classAPI.getMyRegistrations(),
      ]);

      setMemberships(membershipsRes.data);

      const attendanceItems = attendancesRes.data as CustomerAttendance[];
      const registrationItems = registrationsRes.data as MyRegistrationClass[];

      const entriesFromRegistrations: CustomerCalendarEntry[] = registrationItems.map((item) => ({
        id: `reg-${item.registration_id}`,
        class_id: item.class_id,
        title: item.title,
        class_date: normalizeDate(item.class_date),
        start_time: item.start_time,
        end_time: item.end_time,
        source: 'registration',
        attendance_status: item.attendance_status,
      }));

      const entriesFromAttendances: CustomerCalendarEntry[] = attendanceItems.map((item) => {
        const fallbackDate = normalizeDate(item.attendance_date);
        return {
          id: `att-${item.id}`,
          class_id: typeof item.class_id === 'number' ? item.class_id : null,
          title: String(item.class_title || item.class_type || '수업 기록'),
          class_date: item.class_date ? normalizeDate(item.class_date) : fallbackDate,
          start_time: item.class_start_time || null,
          end_time: item.class_end_time || null,
          source: 'attendance',
        };
      });

      setCalendarEntries(mergeCalendarEntries(entriesFromRegistrations, entriesFromAttendances));
    } catch (error) {
      console.error('Failed to load memberships:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerInfo]);

  useEffect(() => {
    if (customerInfo) {
      void loadMemberships();
    }
  }, [customerInfo, loadMemberships]);

  const activeMemberships = useMemo(
    () => memberships.filter((membership) => membership.is_active),
    [memberships]
  );

  const entriesByDate = useMemo(() => {
    return calendarEntries.reduce<Record<string, CustomerCalendarEntry[]>>((acc, item) => {
      const dateKey = normalizeDate(item.class_date);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(item);
      return acc;
    }, {});
  }, [calendarEntries]);

  const visibleDates = useMemo(() => {
    if (calendarView === 'day') {
      return [focusDate];
    }

    if (calendarView === 'week') {
      const weekStart = startOfWeek(focusDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(focusDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }

    const monthStart = startOfMonth(focusDate);
    const monthEnd = endOfMonth(focusDate);
    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [calendarView, focusDate]);

  const selectedDayEntries = useMemo(() => {
    const dayKey = format(focusDate, 'yyyy-MM-dd');
    const items = entriesByDate[dayKey] || [];
    return [...items].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [entriesByDate, focusDate]);

  const calendarTitle = useMemo(() => {
    if (calendarView === 'day') {
      return formatKoreanDate(focusDate);
    }
    if (calendarView === 'week') {
      const weekStart = startOfWeek(focusDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(focusDate, { weekStartsOn: 0 });
      return `${formatKoreanDate(weekStart, false)} - ${formatKoreanDate(weekEnd, false)}`;
    }
    return format(focusDate, 'yyyy년 M월');
  }, [calendarView, focusDate]);

  const movePrev = () => {
    if (calendarView === 'day') {
      setFocusDate((prev) => subDays(prev, 1));
      return;
    }
    if (calendarView === 'week') {
      setFocusDate((prev) => subWeeks(prev, 1));
      return;
    }
    setFocusDate((prev) => subMonths(prev, 1));
  };

  const moveNext = () => {
    if (calendarView === 'day') {
      setFocusDate((prev) => addDays(prev, 1));
      return;
    }
    if (calendarView === 'week') {
      setFocusDate((prev) => addWeeks(prev, 1));
      return;
    }
    setFocusDate((prev) => addMonths(prev, 1));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-warm-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary-800 mb-2">회원권</h1>
        <p className="text-warm-600">{customerInfo?.name}님의 회원권 현황입니다.</p>
      </div>

      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">활성 회원권</h2>
        <div className="space-y-4">
          {activeMemberships.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-warm-500 mb-2">활성화된 회원권이 없습니다</p>
              <p className="text-sm text-warm-400">원장님께 문의해주세요</p>
            </div>
          ) : (
            activeMemberships.map((membership) => (
              <div key={membership.id} className="p-4 bg-primary-50 rounded-lg border border-primary-100 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-primary-800 text-lg">{membership.membership_type_name}</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">활성</span>
                </div>

                <div className="space-y-1.5 text-sm text-warm-700">
                  <p>
                    <span className="text-warm-600">잔여 횟수:</span>{' '}
                    <span className="font-semibold text-primary-800">
                      {membership.remaining_sessions === null || membership.remaining_sessions === undefined
                        ? '무제한'
                        : `${membership.remaining_sessions}회`}
                    </span>
                  </p>
                  <p>
                    <span className="text-warm-600">시작일:</span>{' '}
                    <span className="font-medium text-primary-800">
                      {membership.start_date ? formatKoreanDate(membership.start_date, false) : '-'}
                    </span>
                  </p>
                  <p>
                    <span className="text-warm-600">예상 종료일:</span>{' '}
                    <span className="font-medium text-primary-800">
                      {membership.expected_end_date ? formatKoreanDate(membership.expected_end_date, false) : '-'}
                    </span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-800">수업 캘린더</h2>
            <p className="text-sm text-warm-600">내 수업 일정과 출석 기록만 표시됩니다.</p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-1.5 sm:gap-2 lg:w-auto">
            <div className="inline-flex rounded-lg sm:rounded-xl border border-warm-200 bg-white/75 p-0.5 sm:p-1">
              {(['month', 'week', 'day'] as CalendarView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md sm:rounded-lg ${calendarView === view ? 'bg-primary-600 text-white' : 'text-primary-800 hover:bg-warm-100'}`}
                  onClick={() => setCalendarView(view)}
                >
                  {view === 'month' ? '월간' : view === 'week' ? '주간' : '일간'}
                </button>
              ))}
            </div>
            <div className="ml-auto inline-flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md sm:rounded-lg border border-warm-200 bg-white/75 text-primary-800 hover:bg-warm-100"
                onClick={() => setFocusDate(startOfDay(new Date()))}
              >
                오늘
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md sm:rounded-lg border border-warm-200 bg-white/75 text-primary-800 hover:bg-warm-100"
                onClick={movePrev}
              >
                이전
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md sm:rounded-lg border border-warm-200 bg-white/75 text-primary-800 hover:bg-warm-100"
                onClick={moveNext}
              >
                다음
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <p className="text-lg font-semibold text-primary-800">{calendarTitle}</p>
        </div>

        {calendarView === 'month' && (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 text-[11px] sm:text-xs text-warm-600">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="text-center py-1 font-medium">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {visibleDates.map((date) => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const dayEntries = entriesByDate[dateKey] || [];
                const today = isToday(date);
                const active = isSameDay(date, focusDate);
                const inMonth = isSameMonth(date, focusDate);

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      setFocusDate(date);
                      setCalendarView('day');
                    }}
                    className={`min-h-[58px] sm:min-h-[108px] rounded-lg sm:rounded-xl border p-1 sm:p-2 text-left transition-colors ${today ? 'border-primary-500 bg-primary-50/80' : active ? 'border-primary-300 bg-primary-50/50' : 'border-warm-200 bg-white/70'} ${inMonth ? 'text-primary-800' : 'text-warm-400'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs sm:text-sm font-semibold ${today ? 'text-primary-700' : ''}`}>{format(date, 'd')}</span>
                      {today && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-primary-600 text-white">오늘</span>}
                    </div>

                    <div className="mt-1 sm:mt-2 space-y-1 hidden sm:block">
                      {dayEntries.slice(0, 2).map((item) => (
                        <div key={item.id} className={`rounded-lg px-2 py-1.5 text-xs border ${item.source === 'registration' ? 'bg-primary-50 border-primary-100 text-primary-800' : 'bg-warm-50 border-warm-200 text-warm-700'}`}>
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-[11px]">{normalizeTime(item.start_time)}</p>
                        </div>
                      ))}
                      {dayEntries.length > 2 && (
                        <p className="text-[11px] text-warm-600">+{dayEntries.length - 2}개 더 있음</p>
                      )}
                    </div>

                    <div className="sm:hidden mt-1 space-y-0.5 min-h-[10px]">
                      {dayEntries.slice(0, 2).map((item) => {
                        const attended = item.source === 'attendance'
                          || item.attendance_status === 'attended'
                          || (item.attendance_status === 'reserved' && isAfterGraceTime(item, now));
                        const absent = item.attendance_status === 'absent';
                        return (
                          <p
                            key={item.id}
                            className={`text-[10px] leading-tight font-bold ${absent ? 'text-gray-600' : attended ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {absent ? '결석' : attended ? '출석' : '예약'}
                          </p>
                        );
                      })}
                      {dayEntries.length > 2 && (
                        <span className="text-[10px] text-warm-600">+{dayEntries.length - 2}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {calendarView === 'week' && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {visibleDates.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd');
              const dayEntries = entriesByDate[dateKey] || [];
              const today = isToday(date);

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    setFocusDate(date);
                    setCalendarView('day');
                  }}
                  className={`rounded-xl border p-3 text-left min-h-[160px] ${today ? 'border-primary-500 bg-primary-50/80' : 'border-warm-200 bg-white/70'}`}
                >
                  <p className="text-xs text-warm-600">{WEEKDAY_LABELS[date.getDay()]}</p>
                  <p className={`text-lg font-semibold ${today ? 'text-primary-700' : 'text-primary-800'}`}>{format(date, 'd')}</p>
                  <div className="mt-2 space-y-1">
                    {dayEntries.length === 0 ? (
                      <p className="text-xs text-warm-500">수업 없음</p>
                    ) : (
                      dayEntries.map((item) => (
                        <div key={item.id} className={`rounded-lg px-2 py-1.5 text-xs border ${item.source === 'registration' ? 'bg-primary-50 border-primary-100 text-primary-800' : 'bg-warm-50 border-warm-200 text-warm-700'}`}>
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-[11px]">{normalizeTime(item.start_time)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {calendarView === 'day' && (
          <div className="rounded-xl border border-warm-200 bg-white/70 p-4">
            <p className="text-sm text-warm-600 mb-2">{formatKoreanDate(focusDate)}</p>
            {selectedDayEntries.length === 0 ? (
              <p className="text-warm-500">해당 날짜에 등록된 수업이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {selectedDayEntries.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.class_id) {
                        navigate(`/classes/${item.class_id}`);
                      }
                    }}
                    disabled={!item.class_id}
                    className="w-full rounded-lg border border-warm-200 bg-warm-50 p-3 text-left disabled:opacity-60 disabled:cursor-not-allowed hover:bg-warm-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-primary-800">{item.title}</p>
                        <p className="text-sm text-warm-600">
                          {normalizeTime(item.start_time)}
                          {item.end_time ? ` - ${normalizeTime(item.end_time)}` : ''}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 text-xs rounded-full ${item.source === 'registration' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {item.source === 'registration' ? '예정' : '완료'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default CustomerMemberships;
