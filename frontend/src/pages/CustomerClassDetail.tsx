import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { classAPI, type RegistrationAttendanceStatus } from '../services/api';
import { parseApiError } from '../utils/apiError';
import { useAuth } from '../contexts/AuthContext';
import { formatKoreanDate, formatKoreanDateTime, formatKoreanTime } from '../utils/dateFormat';

interface CustomerClassDetailData {
  id: number;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  class_status?: 'open' | 'closed' | 'in_progress' | 'completed';
  registration_comment?: string | null;
  attendance_status?: RegistrationAttendanceStatus;
  membership_id?: number | null;
  membership_type_name?: string | null;
  membership_created_date?: string | null;
}

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

interface AttendanceCommentMessage {
  id: number;
  attendance_id: number;
  author_role: 'admin' | 'customer';
  author_user_id: number;
  message: string;
  created_at: string;
}

const CustomerClassDetail: React.FC = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const classId = Number(id);
  const activeClassIdRef = useRef<number | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [detail, setDetail] = useState<CustomerClassDetailData | null>(null);
  const [threadMessages, setThreadMessages] = useState<AttendanceCommentMessage[]>([]);
  const [threadMessageDraft, setThreadMessageDraft] = useState('');
  const [editingThreadMessageId, setEditingThreadMessageId] = useState<number | null>(null);
  const [editingThreadDraft, setEditingThreadDraft] = useState('');
  const [selectedQuickComments, setSelectedQuickComments] = useState<string[]>([]);
  const [customCommentChips, setCustomCommentChips] = useState<string[]>([]);
  const [isDirectCommentOpen, setIsDirectCommentOpen] = useState(false);
  const [directCommentInput, setDirectCommentInput] = useState('');
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isThreadSaving, setIsThreadSaving] = useState(false);
  const [savingEditedThreadMessageId, setSavingEditedThreadMessageId] = useState<number | null>(null);
  const [deletingThreadMessageId, setDeletingThreadMessageId] = useState<number | null>(null);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const handleBack = () => {
    const backTarget = typeof location.state === 'object'
      && location.state !== null
      && 'from' in location.state
      && typeof location.state.from === 'string'
      && location.state.from.length > 0
      ? location.state.from
      : '/';

    navigate(backTarget);
  };

  useEffect(() => {
    activeClassIdRef.current = classId;
    setIsThreadLoading(false);
    setIsThreadSaving(false);
    setIsSavingComment(false);
    setEditingThreadMessageId(null);
    setEditingThreadDraft('');
    setSavingEditedThreadMessageId(null);
    setDeletingThreadMessageId(null);

    if (user?.role !== 'customer') {
      setIsLoading(false);
      return;
    }

    if (!Number.isInteger(classId) || classId < 1) {
      setError('유효하지 않은 수업 경로입니다.');
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        setError('');
        setIsLoading(true);
        const response = await classAPI.getMyClassDetail(classId);
        setDetail(response.data);
        setIsLoading(false);
        if (response.data?.attendance_status === 'attended') {
          setIsThreadLoading(true);
          try {
            const threadResponse = await classAPI.getMyCommentThread(classId);
            if (activeClassIdRef.current !== classId) {
              return;
            }
            setThreadMessages(threadResponse.data?.messages || []);
          } catch (threadLoadError: unknown) {
            if (activeClassIdRef.current !== classId) {
              return;
            }
            console.error('Failed to load my comment thread:', threadLoadError);
            setError(parseApiError(threadLoadError, '수업 후 코멘트 대화를 불러오지 못했습니다.'));
          } finally {
            if (activeClassIdRef.current === classId) {
              setIsThreadLoading(false);
            }
          }
        } else {
          setThreadMessages([]);
          setThreadMessageDraft('');
        }
      } catch (loadError: unknown) {
        console.error('Failed to load my class detail:', loadError);
        setError(parseApiError(loadError, '수업 상세 정보를 불러오지 못했습니다.'));
        setIsLoading(false);
      }
    };

    void load();
  }, [classId, user?.role]);

  useEffect(() => {
    const savedComment = (detail?.registration_comment || '').trim();
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
  }, [detail?.registration_comment]);

  useEffect(() => {
    if (editingThreadMessageId === null || !editingTextareaRef.current) {
      return;
    }

    const textarea = editingTextareaRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [editingThreadMessageId, editingThreadDraft]);

  if (user?.role !== 'customer') {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return <p className="text-warm-600 py-8">수업 상세 로딩 중...</p>;
  }

  if (!detail) {
    return (
      <div className="card space-y-3">
        <p className="text-red-700">{error || '수업 정보를 찾을 수 없습니다.'}</p>
        <button type="button" className="btn-secondary inline-flex" onClick={handleBack}>이전 페이지로 돌아가기</button>
      </div>
    );
  }

  const attendanceLabel = detail.attendance_status === 'attended'
    ? '출석'
    : detail.attendance_status === 'hold'
      ? '홀드'
    : detail.attendance_status === 'absent'
      ? '결석'
      : '예약';
  const linkedMembershipLabel = detail.membership_type_name
    ? `${detail.membership_type_name}${detail.membership_created_date ? ` (지급일 ${formatKoreanDate(detail.membership_created_date, false)})` : ''}`
    : '-';

  const handleSendThreadMessage = async () => {
    const requestClassId = classId;
    const message = threadMessageDraft.trim();
    if (!message) {
      return;
    }

    try {
      setError('');
      setIsThreadSaving(true);
      const response = await classAPI.postMyCommentThread(classId, message);
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      setThreadMessages((prev) => [...prev, response.data]);
      setThreadMessageDraft('');
    } catch (threadSaveError: unknown) {
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      console.error('Failed to send my comment thread message:', threadSaveError);
      setError(parseApiError(threadSaveError, '수업 후 코멘트 대화 전송에 실패했습니다.'));
    } finally {
      if (activeClassIdRef.current === requestClassId) {
        setIsThreadSaving(false);
      }
    }
  };

  const handleStartEditThreadMessage = (message: AttendanceCommentMessage) => {
    setEditingThreadMessageId(message.id);
    setEditingThreadDraft(message.message);
  };

  const handleCancelEditThreadMessage = () => {
    setEditingThreadMessageId(null);
    setEditingThreadDraft('');
  };

  const handleSaveEditedThreadMessage = async (messageId: number) => {
    const requestClassId = classId;
    const nextMessage = editingThreadDraft.trim();

    if (!nextMessage) {
      return;
    }

    try {
      setError('');
      setSavingEditedThreadMessageId(messageId);
      const response = await classAPI.updateMyCommentThreadMessage(requestClassId, messageId, nextMessage);
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      setThreadMessages((prev) => prev.map((item) => (
        item.id === messageId ? response.data : item
      )));
      setEditingThreadMessageId(null);
      setEditingThreadDraft('');
    } catch (threadEditError: unknown) {
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      console.error('Failed to edit my comment thread message:', threadEditError);
      setError(parseApiError(threadEditError, '수업 후 코멘트 대화를 수정하지 못했습니다.'));
    } finally {
      if (activeClassIdRef.current === requestClassId) {
        setSavingEditedThreadMessageId(null);
      }
    }
  };

  const handleDeleteThreadMessage = async (messageId: number) => {
    const requestClassId = classId;

    try {
      setError('');
      setDeletingThreadMessageId(messageId);
      await classAPI.deleteMyCommentThreadMessage(requestClassId, messageId);
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      setThreadMessages((prev) => prev.filter((item) => item.id !== messageId));
      if (editingThreadMessageId === messageId) {
        setEditingThreadMessageId(null);
        setEditingThreadDraft('');
      }
    } catch (threadDeleteError: unknown) {
      if (activeClassIdRef.current === requestClassId) {
        console.error('Failed to delete my comment thread message:', threadDeleteError);
        setError(parseApiError(threadDeleteError, '수업 후 코멘트 대화를 삭제하지 못했습니다.'));
      }
    } finally {
      if (activeClassIdRef.current === requestClassId) {
        setDeletingThreadMessageId(null);
      }
    }
  };

  const persistComment = async (rawComment: string) => {
    const requestClassId = classId;
    const mergedComment = rawComment.trim();
    try {
      setError('');
      setIsSavingComment(true);
      await classAPI.updateMyRegistrationComment(requestClassId, mergedComment);
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      if (detail) {
        setDetail({ ...detail, registration_comment: mergedComment || null });
      }
    } catch (saveError: unknown) {
      if (activeClassIdRef.current !== requestClassId) {
        return;
      }
      console.error('Failed to save registration comment:', saveError);
      setError(parseApiError(saveError, '강사에게 전달할 코멘트를 저장하지 못했습니다.'));
    } finally {
      if (activeClassIdRef.current === requestClassId) {
        setIsSavingComment(false);
      }
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

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-kicker mb-2">Class Detail</p>
          <h1 className="page-title">수업 상세</h1>
          <p className="page-description mt-2">
            {formatKoreanDateTime(detail.class_date, detail.start_time)} ~ {formatKoreanTime(detail.end_time)} / {detail.title}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={handleBack}>이전 페이지로</button>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <section className="card space-y-3">
        <h2 className="card-title">나의 수업 정보</h2>
        <p className="text-[var(--text-body)]">출석 여부: <span className="font-semibold text-[var(--text-strong)]">{attendanceLabel}</span></p>
        <p className="text-[var(--text-body)]">연결 회원권: <span className="font-semibold text-[var(--text-strong)]">{linkedMembershipLabel}</span></p>
      </section>

      {detail.attendance_status === 'reserved' ? (
        <section className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="card-title">강사에게 전달할 코멘트</h2>
              <p className="text-xs muted-note mt-1">여러 개 선택할 수 있어요.</p>
            </div>
            {detail.registration_comment?.trim() && (
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
            <div className="space-y-2">
              <textarea
                value={directCommentInput}
                onChange={(event) => setDirectCommentInput(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="강사에게 전달할 컨디션/주의사항을 입력해 주세요."
                className="input-field resize-none"
                disabled={isSavingComment}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs muted-note">{directCommentInput.trim().length}/500</p>
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
        </section>
      ) : (
        <section className="card space-y-3">
          <h2 className="card-title">수업 전 코멘트 (신청 시)</h2>
          <p className="text-[var(--text-body)]">{detail.registration_comment?.trim() || '-'}</p>
        </section>
      )}

      {detail.attendance_status === 'attended' && (
        <section className="card space-y-4">
          <h2 className="card-title">수업 후 코멘트 대화</h2>
          {isThreadLoading ? (
            <p className="text-warm-600 text-sm">대화 불러오는 중...</p>
          ) : threadMessages.length === 0 ? (
            <p className="text-warm-600 text-sm">아직 대화가 없습니다.</p>
          ) : (
            <div className="space-y-2 rounded-2xl bg-warm-100/40 p-3">
              {threadMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.author_role === 'customer' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`space-y-1 max-w-[85%] ${editingThreadMessageId === message.id ? 'w-[85%]' : ''}`}>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        message.author_role === 'customer'
                          ? 'rounded-br-md bg-primary-500 text-white'
                          : 'rounded-bl-md bg-white text-warm-800 border border-warm-200'
                      } ${editingThreadMessageId === message.id ? 'w-full' : ''}`}
                    >
                      {editingThreadMessageId === message.id ? (
                        <div className="space-y-2">
                          <textarea
                            ref={editingTextareaRef}
                            className="input-field w-full max-w-none min-h-[72px] text-warm-900 resize-y"
                            value={editingThreadDraft}
                            maxLength={1000}
                            onChange={(event) => setEditingThreadDraft(event.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="px-3 py-1 text-xs rounded-md bg-white/20"
                              onClick={handleCancelEditThreadMessage}
                              disabled={savingEditedThreadMessageId === message.id || deletingThreadMessageId === message.id}
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1 text-xs rounded-md bg-red-50 text-red-600 disabled:opacity-50"
                              onClick={() => void handleDeleteThreadMessage(message.id)}
                              disabled={savingEditedThreadMessageId === message.id || deletingThreadMessageId === message.id}
                            >
                              {deletingThreadMessageId === message.id ? '삭제 중...' : '삭제'}
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1 text-xs rounded-md bg-white text-primary-700 disabled:opacity-50"
                              onClick={() => void handleSaveEditedThreadMessage(message.id)}
                              disabled={savingEditedThreadMessageId === message.id || deletingThreadMessageId === message.id}
                            >
                              {savingEditedThreadMessageId === message.id ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{message.message}</p>
                      )}
                    </div>
                    <div className={`space-y-1 ${message.author_role === 'customer' ? 'text-right' : 'text-left'}`}>
                      <p className="text-[11px] text-warm-500">
                        {new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {message.author_role === 'customer' && message.author_user_id === user?.id && editingThreadMessageId !== message.id && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="text-[11px] text-primary-700 hover:underline"
                            onClick={() => handleStartEditThreadMessage(message)}
                            disabled={deletingThreadMessageId === message.id}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
                            onClick={() => void handleDeleteThreadMessage(message.id)}
                            disabled={deletingThreadMessageId === message.id}
                          >
                            {deletingThreadMessageId === message.id ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="label" htmlFor="customer-thread-message">수업 후 코멘트 대화 작성</label>
            <textarea
              id="customer-thread-message"
              className="input-field min-h-[72px]"
              placeholder="강사와 주고받을 코멘트를 입력하세요."
              value={threadMessageDraft}
              maxLength={1000}
              onChange={(event) => setThreadMessageDraft(event.target.value)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isThreadSaving}
                onClick={() => void handleSendThreadMessage()}
              >
                {isThreadSaving ? '전송 중...' : '대화 전송'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default CustomerClassDetail;
