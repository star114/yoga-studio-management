import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { attendanceAPI, classAPI } from '../services/api';
import { formatKoreanDateTime, formatKoreanTime } from '../utils/dateFormat';

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
  class_id: number;
  attendance_status: 'reserved' | 'attended' | 'absent';
  registration_comment?: string | null;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  is_open: boolean;
}

interface AttendanceCommentMessage {
  id: number;
  author_role: 'admin' | 'customer';
  message: string;
  created_at: string;
}

interface PendingConversation {
  class_id: number;
  title: string;
  class_date: string;
  messages: AttendanceCommentMessage[];
  last_created_at: string;
}

interface AttendanceListResponse {
  items: CustomerAttendance[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const normalizeDate = (value: string) => value.slice(0, 10);
const ATTENDANCE_PAGE_SIZE = 5;
const QUICK_COMMENT_OPTIONS = [
  '월경 중입니다',
  '오늘은 조용히 수련하고 싶어요',
  '선생님의 터치가 부담스러울 거 같아요 (no 핸즈온)',
];

const composeRegistrationComment = (quickComments: string[], directInput: string) => {
  const normalizedQuick = Array.from(new Set(quickComments.map((item) => item.trim()).filter(Boolean)));
  const normalizedDirect = directInput
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const parts = [...normalizedQuick, ...Array.from(new Set(normalizedDirect))];
  return parts.join('\n');
};

const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerInfo } = useAuth();
  const customerId = customerInfo?.id ?? null;
  const [nextUpcomingClass, setNextUpcomingClass] = useState<MyRegistrationClass | null>(null);
  const [recentAttendances, setRecentAttendances] = useState<CustomerAttendance[]>([]);
  const [attendanceTotalCount, setAttendanceTotalCount] = useState(0);
  const [pendingConversations, setPendingConversations] = useState<PendingConversation[]>([]);
  const [attendancePage, setAttendancePage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuickComments, setSelectedQuickComments] = useState<string[]>([]);
  const [customCommentChips, setCustomCommentChips] = useState<string[]>([]);
  const [isDirectCommentOpen, setIsDirectCommentOpen] = useState(false);
  const [directCommentInput, setDirectCommentInput] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const loadedThreadClassIdsRef = useRef<Set<number>>(new Set());
  const loadingThreadClassIdsRef = useRef<Set<number>>(new Set());
  const lastLoadedAttendancePageRef = useRef(1);

  const loadUpcomingClassData = useCallback(async () => {
    try {
      const registrationsRes = await classAPI.getMyRegistrations();
      const registrationItems = registrationsRes.data as MyRegistrationClass[];

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
    } catch (error) {
      console.error('Failed to load upcoming class data:', error);
    }
  }, []);

  const loadAttendancePage = useCallback(async (page: number) => {
    const offset = (page - 1) * ATTENDANCE_PAGE_SIZE;
    const attendancesRes = await attendanceAPI.getAll({
      customer_id: customerId!,
      limit: ATTENDANCE_PAGE_SIZE,
      offset,
    });
    const attendanceData = attendancesRes.data as AttendanceListResponse;

    setRecentAttendances(attendanceData.items || []);
    setAttendanceTotalCount(attendanceData.total || 0);
  }, [customerId]);

  useEffect(() => {
    if (customerId === null) {
      return;
    }

    const loadInitialData = async () => {
      try {
        await Promise.all([
          loadUpcomingClassData(),
          loadAttendancePage(1),
        ]);
        lastLoadedAttendancePageRef.current = 1;
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitialData();
  }, [customerId, loadAttendancePage, loadUpcomingClassData]);

  useEffect(() => {
    loadedThreadClassIdsRef.current.clear();
    loadingThreadClassIdsRef.current.clear();
    lastLoadedAttendancePageRef.current = 1;
    setAttendancePage(1);
    setPendingConversations([]);
  }, [customerId]);

  useEffect(() => {
    if (customerId === null || isLoading) {
      return;
    }

    if (attendancePage === lastLoadedAttendancePageRef.current) {
      return;
    }

    let cancelled = false;

    const loadCurrentAttendancePage = async () => {
      try {
        const offset = (attendancePage - 1) * ATTENDANCE_PAGE_SIZE;
        const attendancesRes = await attendanceAPI.getAll({
          customer_id: customerId,
          limit: ATTENDANCE_PAGE_SIZE,
          offset,
        });
        if (cancelled) {
          return;
        }

        const attendanceData = attendancesRes.data as AttendanceListResponse;
        setRecentAttendances(attendanceData.items || []);
        setAttendanceTotalCount(attendanceData.total || 0);
        lastLoadedAttendancePageRef.current = attendancePage;
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load attendance page:', error);
          setAttendancePage(lastLoadedAttendancePageRef.current);
        }
      }
    };

    void loadCurrentAttendancePage();

    return () => {
      cancelled = true;
    };
  }, [attendancePage, customerId, isLoading]);

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

  const persistComment = async (rawComment: string) => {
    const mergedComment = rawComment.trim();
    setIsSavingComment(true);

    try {
      await classAPI.updateMyRegistrationComment(nextUpcomingClass.class_id, mergedComment);
      setNextUpcomingClass({ ...nextUpcomingClass, registration_comment: mergedComment || null });
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

  const attendanceTotalPages = useMemo(
    () => Math.max(1, Math.ceil(attendanceTotalCount / ATTENDANCE_PAGE_SIZE)),
    [attendanceTotalCount]
  );
  const visibleAttendanceClassIds = useMemo(() => Array.from(new Set(
    recentAttendances
      .map((item) => (typeof item.class_id === 'number' ? item.class_id : null))
      .filter((classId): classId is number => classId !== null)
  )), [recentAttendances]);
  const pendingConversationByClassId = useMemo(
    () => new Map(pendingConversations.map((item) => [item.class_id, item])),
    [pendingConversations]
  );

  useEffect(() => {
    const classIdsToFetch = visibleAttendanceClassIds.filter((classId) => (
      !loadedThreadClassIdsRef.current.has(classId)
      && !loadingThreadClassIdsRef.current.has(classId)
    ));
    if (classIdsToFetch.length === 0) {
      return;
    }

    classIdsToFetch.forEach((classId) => {
      loadingThreadClassIdsRef.current.add(classId);
    });

    let cancelled = false;

    const loadVisibleThreads = async () => {
      const threadResults = await Promise.allSettled(
        classIdsToFetch.map((classId) => classAPI.getMyCommentThread(classId))
      );

      if (cancelled) {
        classIdsToFetch.forEach((classId) => {
          loadingThreadClassIdsRef.current.delete(classId);
        });
        return;
      }

      const nextItems: PendingConversation[] = [];

      threadResults.forEach((result, index) => {
        const classId = classIdsToFetch[index];
        loadingThreadClassIdsRef.current.delete(classId);
        if (result.status !== 'fulfilled') {
          return;
        }

        loadedThreadClassIdsRef.current.add(classId);
        const messages = (result.value.data?.messages || []) as AttendanceCommentMessage[];
        if (messages.length === 0) {
          return;
        }

        const classInfo = recentAttendances.find((item) => item.class_id === classId);
        const lastMessage = messages[messages.length - 1];

        nextItems.push({
          class_id: classId,
          title: String(classInfo?.class_title || classInfo?.class_type || `수업 #${classId}`),
          class_date: classInfo?.class_date || classInfo?.attendance_date || '',
          messages,
          last_created_at: lastMessage.created_at,
        });
      });

      if (nextItems.length === 0) {
        return;
      }

      setPendingConversations((prev) => {
        const merged = new Map(prev.map((item) => [item.class_id, item]));
        nextItems.forEach((item) => {
          merged.set(item.class_id, item);
        });
        return [...merged.values()].sort((a, b) => (
          new Date(b.last_created_at).getTime() - new Date(a.last_created_at).getTime()
        ));
      });
    };

    void loadVisibleThreads();
    const loadingThreadClassIds = loadingThreadClassIdsRef.current;

    return () => {
      cancelled = true;
      classIdsToFetch.forEach((classId) => {
        loadingThreadClassIds.delete(classId);
      });
    };
  }, [recentAttendances, visibleAttendanceClassIds]);

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
                    placeholder="강사에게 전달할 컨디션/주의사항을 입력해 주세요."
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-800">최근 출석 수업</h2>
            <p className="text-sm text-warm-600">최근 출석 수업과 수업 후 코멘트 대화를 함께 확인할 수 있습니다.</p>
          </div>
          {attendanceTotalCount > 0 && (
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs text-warm-600">
                {attendanceTotalCount}개 중 {(attendancePage - 1) * ATTENDANCE_PAGE_SIZE + 1}-{Math.min(attendancePage * ATTENDANCE_PAGE_SIZE, attendanceTotalCount)}개
              </p>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  disabled={attendancePage === 1}
                  onClick={() => setAttendancePage((prev) => Math.max(1, prev - 1))}
                >
                  이전
                </button>
                <span className="text-sm font-medium text-primary-800">
                  {attendancePage} / {attendanceTotalPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  disabled={attendancePage === attendanceTotalPages}
                  onClick={() => setAttendancePage((prev) => Math.min(attendanceTotalPages, prev + 1))}
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
        {recentAttendances.length === 0 ? (
          <p className="text-warm-500 py-4">최근 출석 수업이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {recentAttendances.map((item) => {
              const pendingConversation = typeof item.class_id === 'number'
                ? pendingConversationByClassId.get(item.class_id)
                : undefined;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.class_id) {
                      navigate(`/classes/${item.class_id}`, {
                        state: { from: `${location.pathname}${location.search}${location.hash}` },
                      });
                    }
                  }}
                  disabled={!item.class_id}
                  className="w-full rounded-lg border border-warm-200 bg-warm-50 p-3 text-left disabled:opacity-60 disabled:cursor-not-allowed hover:bg-warm-100 transition-colors"
                >
                  <p className="font-semibold text-primary-800">{String(item.class_title || item.class_type || '수업 기록')}</p>
                  <p className="text-sm text-warm-600">
                    {formatKoreanDateTime(item.class_date || item.attendance_date, item.class_start_time || null)}
                  </p>
                  {pendingConversation && (
                    <div className="mt-2 rounded-md border border-primary-200 bg-primary-50 px-3 py-2">
                      <p className="text-xs font-medium text-primary-700">수업 후 코멘트 대화</p>
                      <div className="mt-2 flex flex-col gap-2">
                        {pendingConversation.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                              message.author_role === 'customer'
                                ? 'self-end bg-[#0B84FF] text-white rounded-br-md'
                                : 'self-start bg-white text-primary-900 border border-warm-200 rounded-bl-md'
                            }`}
                          >
                            {message.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default CustomerDashboard;
