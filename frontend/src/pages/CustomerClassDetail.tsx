import React, { useEffect, useState } from 'react';
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
  instructor_comment?: string | null;
  customer_comment?: string | null;
  attendance_status?: 'reserved' | 'attended' | 'absent';
}

const CustomerClassDetail: React.FC = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);
  const [detail, setDetail] = useState<CustomerClassDetailData | null>(null);
  const [attendanceCommentDraft, setAttendanceCommentDraft] = useState('');
  const [isSavingAttendanceComment, setIsSavingAttendanceComment] = useState(false);
  const [attendanceCommentNotice, setAttendanceCommentNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
        setAttendanceCommentDraft(response.data?.customer_comment || '');
      } catch (loadError: unknown) {
        console.error('Failed to load my class detail:', loadError);
        setError(parseApiError(loadError, '수업 상세 정보를 불러오지 못했습니다.'));
      } finally {
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

  const handleSaveAttendanceComment = async () => {
    try {
      setError('');
      setAttendanceCommentNotice('');
      setIsSavingAttendanceComment(true);
      const response = await classAPI.updateMyAttendanceComment(classId, attendanceCommentDraft);
      const savedComment = response.data?.customer_comment || null;
      setDetail({ ...detail, customer_comment: savedComment });
      setAttendanceCommentDraft(savedComment || '');
      setAttendanceCommentNotice('출석 코멘트를 저장했습니다.');
    } catch (saveError: unknown) {
      console.error('Failed to save attendance comment:', saveError);
      setError(parseApiError(saveError, '출석 코멘트 저장에 실패했습니다.'));
    } finally {
      setIsSavingAttendanceComment(false);
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
      {attendanceCommentNotice && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {attendanceCommentNotice}
        </p>
      )}

      <section className="card space-y-3">
        <h2 className="text-xl font-display font-semibold text-primary-800">나의 수업 정보</h2>
        <p className="text-warm-700">출석 여부: <span className="font-semibold text-primary-800">{attendanceLabel}</span></p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-display font-semibold text-primary-800">수련생 코멘트</h2>
        <p className="text-warm-700">{detail.registration_comment?.trim() || '-'}</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-display font-semibold text-primary-800">강사 코멘트</h2>
        <p className="text-warm-700">{detail.instructor_comment?.trim() || '-'}</p>
      </section>

      {detail.attendance_status === 'attended' && (
        <section className="card space-y-3">
          <h2 className="text-xl font-display font-semibold text-primary-800">나의 출석 코멘트</h2>
          <label className="label" htmlFor="customer-attendance-comment">나의 출석 코멘트</label>
          <textarea
            id="customer-attendance-comment"
            className="input-field min-h-[88px]"
            maxLength={500}
            placeholder="출석한 수업에 대한 메모를 남겨보세요."
            value={attendanceCommentDraft}
            onChange={(event) => setAttendanceCommentDraft(event.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSavingAttendanceComment}
              onClick={() => void handleSaveAttendanceComment()}
            >
              {isSavingAttendanceComment ? '저장 중...' : '출석 코멘트 저장'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default CustomerClassDetail;
