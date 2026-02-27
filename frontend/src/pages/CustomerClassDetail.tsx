import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { classAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';
import { useAuth } from '../contexts/AuthContext';
import { formatKoreanDateTime, formatKoreanTime } from '../utils/dateFormat';

interface CustomerClassDetailData {
  id: number;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  class_status?: 'open' | 'closed' | 'in_progress' | 'completed';
  registration_comment?: string | null;
  attendance_status?: 'reserved' | 'attended' | 'absent';
}

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
  const classId = Number(id);
  const activeClassIdRef = useRef<number | null>(null);
  const [detail, setDetail] = useState<CustomerClassDetailData | null>(null);
  const [threadMessages, setThreadMessages] = useState<AttendanceCommentMessage[]>([]);
  const [threadMessageDraft, setThreadMessageDraft] = useState('');
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isThreadSaving, setIsThreadSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    activeClassIdRef.current = classId;
    setIsThreadLoading(false);
    setIsThreadSaving(false);

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
        <Link to="/" className="btn-secondary inline-flex">수련 기록으로 돌아가기</Link>
      </div>
    );
  }

  const attendanceLabel = detail.attendance_status === 'attended'
    ? '출석'
    : detail.attendance_status === 'absent'
      ? '결석'
      : '예약';

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

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary-800">수업 상세</h1>
          <p className="text-warm-600 mt-2">
            {formatKoreanDateTime(detail.class_date, detail.start_time)} ~ {formatKoreanTime(detail.end_time)} / {detail.title}
          </p>
        </div>
        <Link to="/" className="btn-secondary">수련 기록으로</Link>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <section className="card space-y-3">
        <h2 className="text-xl font-display font-semibold text-primary-800">나의 수업 정보</h2>
        <p className="text-warm-700">출석 여부: <span className="font-semibold text-primary-800">{attendanceLabel}</span></p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-display font-semibold text-primary-800">수업 전 코멘트 (신청 시)</h2>
        <p className="text-warm-700">{detail.registration_comment?.trim() || '-'}</p>
      </section>

      {detail.attendance_status === 'attended' && (
        <section className="card space-y-4">
          <h2 className="text-xl font-display font-semibold text-primary-800">수업 후 코멘트 대화</h2>
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
                  <div className="max-w-[85%] space-y-1">
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        message.author_role === 'customer'
                          ? 'rounded-br-md bg-primary-500 text-white'
                          : 'rounded-bl-md bg-white text-warm-800 border border-warm-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.message}</p>
                    </div>
                    <p className={`text-[11px] text-warm-500 ${message.author_role === 'customer' ? 'text-right' : 'text-left'}`}>
                      {new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
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
