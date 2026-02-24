import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { attendanceAPI, classAPI } from '../services/api';
import { formatKoreanDate, formatKoreanDateTime, formatKoreanTime } from '../utils/dateFormat';
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

interface CustomerAttendance {
  id: number;
  class_id?: number | null;
  attendance_date: string;
  class_type?: string | null;
  class_title?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  class_end_time?: string | null;
  instructor_comment?: string | null;
}

interface MyRegistrationClass {
  registration_id: number;
  class_id: number;
  attendance_status: 'reserved' | 'attended' | 'absent';
  registration_comment?: string | null;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  is_open: boolean;
  is_excluded: boolean;
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
const QUICK_COMMENT_OPTIONS = [
  '월경 중입니다',
  '오늘은 조용히 수련하고 싶어요',
  '선생님의 터치가 부담스러울 거 같아요 (no 핸즈온)',
];

const isAfterGraceTime = (entry: CustomerCalendarEntry, now: Date) => {
  if (!entry.start_time) return false;
  const classStart = new Date(`${normalizeDate(entry.class_date)}T${String(entry.start_time).slice(0, 8)}`);
  const graceTime = new Date(classStart.getTime() + 15 * 60 * 1000);
  return now >= graceTime;
};

const composeRegistrationComment = (quickComments: string[], directInput: string) => {
  const normalizedQuick = Array.from(new Set(quickComments.map((item) => item.trim()).filter(Boolean)));
  const normalizedDirect = directInput
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const parts = [...normalizedQuick, ...Array.from(new Set(normalizedDirect))];
  return parts.join('\n');
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
      // 같은 수업이 등록/출석에 모두 있으면 출석 기록(완료)을 우선 표시
      mergedByClassId.set(item.class_id, item);
      return;
    }
    withoutClassId.push(item);
  });

  return [...mergedByClassId.values(), ...withoutClassId];
};

const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { customerInfo } = useAuth();
  const [nextUpcomingClass, setNextUpcomingClass] = useState<MyRegistrationClass | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<CustomerCalendarEntry[]>([]);
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [focusDate, setFocusDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuickComments, setSelectedQuickComments] = useState<string[]>([]);
  const [customCommentChips, setCustomCommentChips] = useState<string[]>([]);
  const [isDirectCommentOpen, setIsDirectCommentOpen] = useState(false);
  const [directCommentInput, setDirectCommentInput] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const loadAttendanceData = useCallback(async () => {
    try {
      const [attendancesRes, registrationsRes] = await Promise.all([
        attendanceAPI.getAll({ customer_id: customerInfo.id, limit: 20 }),
        classAPI.getMyRegistrations(),
      ]);

      const attendanceItems = attendancesRes.data as CustomerAttendance[];
      const registrationItems = (registrationsRes.data as MyRegistrationClass[]).filter((item) => !item.is_excluded);

      const now = new Date();
      const nextClasses = registrationItems.filter((item) => {
        const classStartAt = new Date(`${normalizeDate(item.class_date)}T${String(item.start_time).slice(0, 8)}`);
        return classStartAt >= now && item.attendance_status === 'reserved';
      });
      nextClasses.sort((a, b) => {
        const aStartAt = new Date(`${normalizeDate(a.class_date)}T${String(a.start_time).slice(0, 8)}`).getTime();
        const bStartAt = new Date(`${normalizeDate(b.class_date)}T${String(b.start_time).slice(0, 8)}`).getTime();
        return aStartAt - bStartAt;
      });
      setNextUpcomingClass(nextClasses[0] || null);

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
      console.error('Failed to load attendance data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerInfo]);

  useEffect(() => {
    if (customerInfo) {
      void loadAttendanceData();
    }
  }, [customerInfo, loadAttendanceData]);

  useEffect(() => {
    const savedComment = (nextUpcomingClass?.registration_comment || '').trim();
    if (!savedComment) {
      setSelectedQuickComments([]);
      setCustomCommentChips([]);
      setDirectCommentInput('');
      setIsDirectCommentOpen(false);
      return;
    }

    const commentLines = savedComment
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const quickSelections = commentLines.filter((line) => QUICK_COMMENT_OPTIONS.includes(line));
    const customLines = commentLines.filter((line) => !QUICK_COMMENT_OPTIONS.includes(line));

    setSelectedQuickComments(quickSelections);
    setCustomCommentChips(customLines);
    setDirectCommentInput('');
    setIsDirectCommentOpen(false);
  }, [nextUpcomingClass]);

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

  const persistComment = async (rawComment: string) => {
    if (!nextUpcomingClass) return;
    const mergedComment = rawComment.trim();

    setIsSavingComment(true);

    try {
      await classAPI.updateMyRegistrationComment(nextUpcomingClass.class_id, mergedComment);
      setNextUpcomingClass((prev) => (prev ? { ...prev, registration_comment: mergedComment || null } : prev));
    } catch (error) {
      console.error('Failed to save registration comment:', error);
    } finally {
      setIsSavingComment(false);
    }
  };

  const saveComment = async (quickComments: string[], directInput: string) => {
    const mergedComment = composeRegistrationComment(quickComments, directInput);
    await persistComment(mergedComment);
  };

  const handleQuickCommentClick = async (comment: string) => {
    const nextSelectedComments = selectedQuickComments.includes(comment)
      ? selectedQuickComments.filter((item) => item !== comment)
      : [...selectedQuickComments, comment];
    setSelectedQuickComments(nextSelectedComments);
    await saveComment(nextSelectedComments, customCommentChips.join('\n'));
  };

  const handleCustomCommentChipClick = async (comment: string) => {
    const nextCustomChips = customCommentChips.filter((item) => item !== comment);
    setCustomCommentChips(nextCustomChips);
    await saveComment(selectedQuickComments, nextCustomChips.join('\n'));
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
        <p className="text-warm-600">수련의 흐름과 몸과 마음의 상태를 간단히 기록하고 나누는 공간입니다.</p>
      </div>

      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
          다음 수업
        </h2>
        {nextUpcomingClass ? (
          <div className="p-4 bg-primary-50 rounded-lg border border-primary-100 space-y-4">
            <p className="font-semibold text-primary-800">{nextUpcomingClass.title}</p>
            <p className="text-sm text-warm-700 mt-1">
              {formatKoreanDateTime(nextUpcomingClass.class_date, nextUpcomingClass.start_time)}
              {' '}~ {formatKoreanTime(nextUpcomingClass.end_time)}
            </p>
            <div className="pt-1 border-t border-primary-100">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-primary-800">강사에게 전달할 코멘트</p>
                {nextUpcomingClass.registration_comment?.trim() && (
                  <button
                    type="button"
                    className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-60"
                    disabled={isSavingComment}
                    onClick={() => void persistComment('')}
                  >
                    초기화
                  </button>
                )}
              </div>
              <p className="text-xs text-warm-600 mb-2">여러 개 선택할 수 있어요.</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_COMMENT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={isSavingComment}
                    onClick={() => void handleQuickCommentClick(option)}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition-colors ${
                      selectedQuickComments.includes(option)
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-primary-800 border-primary-200 hover:bg-primary-100'
                    } disabled:opacity-60`}
                  >
                    {option}
                  </button>
                ))}
                {customCommentChips.map((comment) => (
                  <button
                    key={`custom-${comment}`}
                    type="button"
                    disabled={isSavingComment}
                    onClick={() => void handleCustomCommentChipClick(comment)}
                    className="max-w-full px-3 py-1.5 text-xs sm:text-sm rounded-full border border-primary-600 bg-primary-600 text-white hover:bg-primary-700 truncate disabled:opacity-60"
                    title="클릭하면 해당 직접 입력 코멘트 선택이 해제됩니다."
                  >
                    {comment}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isSavingComment}
                  onClick={() => {
                    setIsDirectCommentOpen(true);
                  }}
                  className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition-colors ${
                    isDirectCommentOpen
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-primary-800 border-primary-200 hover:bg-primary-100'
                  } disabled:opacity-60`}
                >
                  직접 입력
                </button>
              </div>

              {isDirectCommentOpen && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={directCommentInput}
                    onChange={(e) => setDirectCommentInput(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="강사에게 전달할 컨디션/주의사항을 입력해 주세요. 예) 어깨가 뭉쳐 있어요, OO 부위에 통증이 있어요, 하루 종일 무기력했어요, 차분하고 느긋한 상태예요, 어제 밤잠을 설쳤어요 등"
                    className="input-field resize-none"
                    disabled={isSavingComment}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-warm-500">{directCommentInput.trim().length}/500</p>
                    <button
                      type="button"
                      onClick={async () => {
                        const normalized = directCommentInput.trim();
                        const nextCustomChips = normalized
                          ? Array.from(new Set([...customCommentChips, normalized]))
                          : customCommentChips;
                        setCustomCommentChips(nextCustomChips);
                        await saveComment(selectedQuickComments, nextCustomChips.join('\n'));
                        setDirectCommentInput('');
                        setIsDirectCommentOpen(false);
                      }}
                      disabled={isSavingComment}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
                    >
                      {isSavingComment ? '저장 중...' : '코멘트 저장'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-warm-500 text-center py-8">예정된 수업이 없습니다</p>
        )}
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

export default CustomerDashboard;
