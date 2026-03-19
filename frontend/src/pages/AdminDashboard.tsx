import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customerAPI, attendanceAPI, classAPI } from '../services/api';
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

interface DashboardAttendance {
  id: number;
  customer_name: string;
  attendance_date: string;
  class_type?: string | null;
}

interface DashboardCustomer {
  id: number;
  name: string;
  phone: string;
  membership_count?: string | number;
  total_attendance?: string | number;
}

interface DashboardClass {
  id: number;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity?: number;
  current_enrollment?: number;
  is_open?: boolean;
  class_status?: 'open' | 'closed' | 'in_progress' | 'completed';
}

interface DashboardSnapshotRegistration {
  id: number;
  class_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  attendance_status: 'reserved' | 'attended' | 'absent';
  registration_comment: string | null;
  registered_at: string;
}

interface DashboardSnapshotClass extends DashboardClass {
  registrations: DashboardSnapshotRegistration[];
}

interface DashboardClassSnapshot {
  basis: 'today' | 'upcoming';
  target_date: string | null;
  classes: DashboardSnapshotClass[];
}

type CalendarView = 'month' | 'week' | 'day';
type AdminClassStatus = 'open' | 'in_progress' | 'completed' | 'closed';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const normalizeTime = (value: string) => value.slice(0, 5);
const normalizeDate = (value: string) => value.slice(0, 10);
const splitRegistrationComment = (value: string | null | undefined) =>
  (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const getRegistrationStatusMeta = (status: DashboardSnapshotRegistration['attendance_status']) => {
  switch (status) {
    case 'attended':
      return {
        label: '출석',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'absent':
      return {
        label: '결석',
        className: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    default:
      return {
        label: '예약',
        className: 'bg-amber-100 text-amber-800 border-amber-200',
      };
  }
};

const getAdminClassStatusMeta = (item: DashboardClass) => {
  const status = (item.class_status || 'open') as AdminClassStatus;

  switch (status) {
    case 'completed':
      return {
        label: '완료',
        badgeClassName: 'bg-slate-200 text-slate-800 border-slate-300',
        cardClassName: 'bg-slate-50/90 border-slate-300 text-slate-900',
        subtleTextClassName: 'text-slate-700',
      };
    case 'in_progress':
      return {
        label: '진행중',
        badgeClassName: 'bg-sky-100 text-sky-800 border-sky-200',
        cardClassName: 'bg-sky-50/90 border-sky-200 text-sky-950',
        subtleTextClassName: 'text-sky-800',
      };
    case 'closed':
      return {
        label: '마감',
        badgeClassName: 'bg-rose-100 text-rose-800 border-rose-200',
        cardClassName: 'bg-rose-50/90 border-rose-200 text-rose-950',
        subtleTextClassName: 'text-rose-800',
      };
    default:
      return {
        label: '접수중',
        badgeClassName: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        cardClassName: 'bg-emerald-50/90 border-emerald-200 text-emerald-950',
        subtleTextClassName: 'text-emerald-800',
      };
  }
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalCustomers: 0,
    todayAttendance: 0,
  });
  const [todayAttendances, setTodayAttendances] = useState<DashboardAttendance[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<DashboardCustomer[]>([]);
  const [classes, setClasses] = useState<DashboardClass[]>([]);
  const [classSnapshot, setClassSnapshot] = useState<DashboardClassSnapshot>({
    basis: 'upcoming',
    target_date: null,
    classes: [],
  });
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [focusDate, setFocusDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const classesByDate = useMemo(() => {
    return classes.reduce<Record<string, DashboardClass[]>>((acc, item) => {
      const dateKey = normalizeDate(item.class_date);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(item);
      return acc;
    }, {});
  }, [classes]);

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

  const selectedDayClasses = useMemo(() => {
    const dayKey = format(focusDate, 'yyyy-MM-dd');
    const items = classesByDate[dayKey] || [];
    return [...items].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [classesByDate, focusDate]);

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

  const loadDashboardData = async () => {
    try {
      const [customersRes, todayRes, classesRes] = await Promise.all([
        customerAPI.getAll(),
        attendanceAPI.getToday(),
        classAPI.getAll(),
      ]);

      setStats({
        totalCustomers: customersRes.data.length,
        todayAttendance: todayRes.data.length,
      });

      setRecentCustomers(customersRes.data.slice(0, 5));
      setTodayAttendances(todayRes.data);
      setClasses(classesRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }

    try {
      const classSnapshotRes = await classAPI.getAdminDashboardSnapshot();
      setClassSnapshot(classSnapshotRes.data);
    } catch (snapshotError) {
      console.error('Failed to load admin dashboard snapshot:', snapshotError);
    } finally {
      setIsLoading(false);
    }
  };

  const classSnapshotHeading = classSnapshot.basis === 'today'
    ? '오늘 수업 전체'
    : '다가오는 수업';

  const renderClassChip = (item: DashboardClass) => {
    const meta = getAdminClassStatusMeta(item);
    return (
      <div
        key={item.id}
        className={`rounded-lg border px-2 py-1.5 text-xs shadow-sm ${meta.cardClassName}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold truncate">{item.title}</p>
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${meta.badgeClassName}`}>
            {meta.label}
          </span>
        </div>
        <p className={`text-[11px] ${meta.subtleTextClassName}`}>
          {normalizeTime(item.start_time)} - {normalizeTime(item.end_time)}
          {typeof item.current_enrollment === 'number' && typeof item.max_capacity === 'number'
            ? ` · ${item.current_enrollment}/${item.max_capacity}`
            : ''}
        </p>
      </div>
    );
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

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary-800 mb-2">
          대시보드
        </h1>
        <p className="text-warm-600">오늘도 평온한 하루 되세요</p>
      </div>

      <section className="card space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-800">{classSnapshotHeading}</h2>
            <p className="text-sm text-warm-600">
              {classSnapshot.target_date
                ? formatKoreanDate(classSnapshot.target_date)
                : '오늘이나 예정된 수업이 없습니다.'}
            </p>
          </div>
          {classSnapshot.target_date && (
            <span className="inline-flex w-fit rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
              {classSnapshot.basis === 'today' ? '오늘 일정' : '가장 가까운 예정일'}
            </span>
          )}
        </div>

        {classSnapshot.classes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-warm-300 bg-warm-50 px-4 py-8 text-center text-warm-500">
            표시할 수업이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {classSnapshot.classes.map((item) => {
              const classMeta = getAdminClassStatusMeta(item);
              const commentedRegistrations = item.registrations.filter((registration) =>
                splitRegistrationComment(registration.registration_comment).length > 0
              );
              return (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-warm-200 bg-white/80 shadow-sm">
                  <button
                    type="button"
                    onClick={() => navigate(`/classes/${item.id}`)}
                    className="flex w-full flex-col gap-3 border-b border-warm-100 px-4 py-4 text-left transition-colors hover:bg-warm-50 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-primary-800">{item.title}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${classMeta.badgeClassName}`}>
                          {classMeta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-warm-600">
                        {normalizeTime(item.start_time)} - {normalizeTime(item.end_time)}
                        {typeof item.current_enrollment === 'number' && typeof item.max_capacity === 'number'
                          ? ` · 신청 ${item.current_enrollment}/${item.max_capacity}`
                          : ''}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-primary-700">상세 보기</span>
                  </button>

                  <div className="divide-y divide-warm-100">
                    {commentedRegistrations.length === 0 ? (
                      <p className="px-4 py-5 text-sm text-warm-500">남긴 코멘트가 없습니다.</p>
                    ) : (
                      commentedRegistrations.map((registration) => {
                        const statusMeta = getRegistrationStatusMeta(registration.attendance_status);
                        const commentLines = splitRegistrationComment(registration.registration_comment);
                        return (
                          <div key={registration.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-primary-800">{registration.customer_name}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              <p className="text-sm text-warm-600">{registration.customer_phone}</p>
                            </div>
                            <div className="rounded-xl bg-warm-50 px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                {commentLines.map((commentLine) => (
                                  <span
                                    key={`${registration.id}-${commentLine}`}
                                    className="max-w-full rounded-full border border-primary-200 bg-white px-3 py-1.5 text-sm text-primary-800"
                                    title={commentLine}
                                  >
                                    {commentLine}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-800">수업 캘린더</h2>
            <p className="text-sm text-warm-600">현재 날짜는 강조 표시됩니다.</p>
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
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(['open', 'in_progress', 'completed', 'closed'] as AdminClassStatus[]).map((status) => {
            const meta = getAdminClassStatusMeta({ class_status: status } as DashboardClass);
            return (
              <span key={status} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${meta.badgeClassName}`}>
                {meta.label}
              </span>
            );
          })}
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
                const dayClasses = classesByDate[dateKey] || [];
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
                    <div className="mt-2 space-y-1 hidden sm:block">
                      {dayClasses.slice(0, 2).map(renderClassChip)}
                      {dayClasses.length > 2 && (
                        <p className="text-[11px] text-warm-600">+{dayClasses.length - 2}개 더 있음</p>
                      )}
                    </div>
                    <div className="sm:hidden mt-1 text-[10px] text-warm-600 font-medium min-h-[10px]">
                      {dayClasses.length > 0 ? `${dayClasses.length}개` : ''}
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
              const dayClasses = classesByDate[dateKey] || [];
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
                    {dayClasses.length === 0 ? (
                      <p className="text-xs text-warm-500">수업 없음</p>
                    ) : (
                      dayClasses.map(renderClassChip)
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
            {selectedDayClasses.length === 0 ? (
              <p className="text-warm-500">해당 날짜에 등록된 수업이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {selectedDayClasses.map((item) => (
                  (() => {
                    const meta = getAdminClassStatusMeta(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          window.location.href = `/classes/${item.id}`;
                        }}
                        className={`w-full rounded-xl border p-3 text-left shadow-sm transition-colors hover:brightness-[0.98] ${meta.cardClassName}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{item.title}</p>
                            <p className={`text-sm ${meta.subtleTextClassName}`}>
                              {normalizeTime(item.start_time)} - {normalizeTime(item.end_time)}
                            </p>
                          </div>
                          <span className={`px-2.5 py-1 text-xs rounded-full border font-bold ${meta.badgeClassName}`}>
                            {meta.label}
                          </span>
                        </div>
                        {typeof item.current_enrollment === 'number' && typeof item.max_capacity === 'number' && (
                          <p className={`mt-2 text-sm ${meta.subtleTextClassName}`}>신청: {item.current_enrollment}/{item.max_capacity}</p>
                        )}
                      </button>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-warm-600 mb-1">전체 회원</p>
              <p className="text-3xl font-bold text-primary-800">{stats.totalCustomers}</p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-warm-600 mb-1">오늘 출석</p>
              <p className="text-3xl font-bold text-primary-800">{stats.todayAttendance}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            오늘 출석
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {todayAttendances.length === 0 ? (
              <p className="text-warm-500 text-center py-8">아직 출석한 회원이 없습니다</p>
            ) : (
              todayAttendances.map((attendance) => (
                <div key={attendance.id} className="flex items-center justify-between p-3 bg-warm-50 rounded-lg">
                  <div>
                    <p className="font-medium text-primary-800">{attendance.customer_name}</p>
                    <p className="text-sm text-warm-600">
                      {format(new Date(attendance.attendance_date), 'HH:mm')}
                    </p>
                  </div>
                  {attendance.class_type && (
                    <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm rounded-full">
                      {attendance.class_type}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            최근 등록 회원
          </h2>
          <div className="space-y-3">
            {recentCustomers.length === 0 ? (
              <p className="text-warm-500 text-center py-8">등록된 회원이 없습니다</p>
            ) : (
              recentCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  className="w-full flex items-center justify-between p-3 bg-warm-50 rounded-lg hover:bg-warm-100 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-primary-800">{customer.name}</p>
                    <p className="text-sm text-warm-600">{customer.phone}</p>
                  </div>
                  <div className="text-right text-sm text-warm-600">
                    <p>회원권 {customer.membership_count}개</p>
                    <p>출석 {customer.total_attendance}회</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
