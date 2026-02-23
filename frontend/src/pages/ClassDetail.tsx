import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { attendanceAPI, classAPI, customerAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';

interface YogaClassDetail {
  id: number;
  title: string;
  instructor_name?: string | null;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  is_open: boolean;
  is_excluded?: boolean;
  current_enrollment?: number;
  remaining_seats?: number;
  class_status?: 'open' | 'closed' | 'in_progress' | 'completed' | 'excluded';
}

interface Customer {
  id: number;
  name: string;
  phone: string;
}

interface ClassRegistration {
  id: number;
  class_id: number;
  customer_id: number;
  attendance_status?: 'reserved' | 'attended' | 'absent';
  registered_at: string;
  registration_comment?: string | null;
  attendance_id?: number | null;
  attendance_instructor_comment?: string | null;
  customer_name: string;
  customer_phone: string;
}

const ClassDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classId = Number(id);

  const [classDetail, setClassDetail] = useState<YogaClassDetail | null>(null);
  const [registrations, setRegistrations] = useState<ClassRegistration[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [instructorCommentDrafts, setInstructorCommentDrafts] = useState<Record<number, string>>({});
  const [savingInstructorCommentCustomerId, setSavingInstructorCommentCustomerId] = useState<number | null>(null);
  const [savingAttendanceStatusCustomerId, setSavingAttendanceStatusCustomerId] = useState<number | null>(null);
  const [checkingInCustomerId, setCheckingInCustomerId] = useState<number | null>(null);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const classStatusLabel = useMemo(() => {
    switch (classDetail?.class_status) {
      case 'completed':
        return '완료';
      case 'in_progress':
        return '진행중';
      case 'closed':
        return '닫힘';
      case 'excluded':
        return '제외';
      default:
        return '오픈';
    }
  }, [classDetail?.class_status]);

  const unregisteredCustomers = useMemo(() => {
    const registered = new Set(registrations.map((item) => item.customer_id));
    return customers.filter((customer) => !registered.has(customer.id));
  }, [customers, registrations]);

  useEffect(() => {
    if (!Number.isInteger(classId) || classId < 1) {
      setError('유효하지 않은 수업 경로입니다.');
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        setError('');
        setIsLoading(true);
        const [classRes, registrationsRes, customersRes] = await Promise.all([
          classAPI.getById(classId),
          classAPI.getRegistrations(classId),
          customerAPI.getAll(),
        ]);

        setClassDetail(classRes.data);
        setRegistrations(registrationsRes.data);
        setCustomers(customersRes.data);
        setInstructorCommentDrafts(
          Object.fromEntries(
            registrationsRes.data.map((item: ClassRegistration) => [item.customer_id, item.attendance_instructor_comment || ''])
          )
        );
      } catch (loadError: unknown) {
        console.error('Failed to load class detail:', loadError);
        setError(parseApiError(loadError, '수업 상세 정보를 불러오지 못했습니다.'));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [classId]);

  const refreshClassAndRegistrations = async () => {
    const [classRes, registrationsRes] = await Promise.all([
      classAPI.getById(classId),
      classAPI.getRegistrations(classId),
    ]);
    setClassDetail(classRes.data);
    setRegistrations(registrationsRes.data);
    setInstructorCommentDrafts(
      Object.fromEntries(
        registrationsRes.data.map((item: ClassRegistration) => [item.customer_id, item.attendance_instructor_comment || ''])
      )
    );
  };

  const handleManualRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomerId) {
      setError('신청할 고객을 선택하세요.');
      return;
    }

    try {
      setError('');
      setNotice('');
      setIsRegisterSubmitting(true);
      await classAPI.register(classId, { customer_id: Number(selectedCustomerId) });
      setSelectedCustomerId('');
      await refreshClassAndRegistrations();
      setNotice('수동 신청이 등록되었습니다.');
    } catch (registerError: unknown) {
      console.error('Failed to register customer:', registerError);
      setError(parseApiError(registerError));
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  const handleCancelRegistration = async (customerId: number) => {
    const ok = window.confirm('해당 고객의 수업 신청을 취소할까요?');
    if (!ok) return;

    try {
      setError('');
      setNotice('');
      await classAPI.cancelRegistration(classId, customerId);
      await refreshClassAndRegistrations();
      setNotice('신청이 취소되었습니다.');
    } catch (cancelError: unknown) {
      console.error('Failed to cancel registration:', cancelError);
      setError(parseApiError(cancelError));
    }
  };

  const handleCheckIn = async (customerId: number) => {
    try {
      setError('');
      setNotice('');
      setCheckingInCustomerId(customerId);
      const input = window.prompt(
        '강사 코멘트(선택)를 입력하세요.',
        instructorCommentDrafts[customerId] || ''
      );
      if (input === null) {
        return;
      }
      const comment = input.trim();
      await attendanceAPI.checkIn({
        customer_id: customerId,
        class_id: classId,
        instructor_comment: comment || null,
      });
      setInstructorCommentDrafts((prev) => ({ ...prev, [customerId]: comment }));
      await refreshClassAndRegistrations();
      setNotice('출석 체크를 완료했습니다.');
    } catch (checkInError: unknown) {
      console.error('Failed to check attendance:', checkInError);
      setError(parseApiError(checkInError, '출석 체크에 실패했습니다.'));
    } finally {
      setCheckingInCustomerId(null);
    }
  };

  const handleSaveInstructorComment = async (registration: ClassRegistration) => {
    if (!registration.attendance_id) {
      setError('출석 체크 후 강사 코멘트를 저장할 수 있습니다.');
      return;
    }

    try {
      setError('');
      setNotice('');
      setSavingInstructorCommentCustomerId(registration.customer_id);
      const comment = (instructorCommentDrafts[registration.customer_id] || '').trim();
      await attendanceAPI.update(registration.attendance_id, {
        instructor_comment: comment,
      });
      await refreshClassAndRegistrations();
      setNotice('강사 코멘트를 저장했습니다.');
    } catch (instructorCommentError: unknown) {
      console.error('Failed to save instructor comment:', instructorCommentError);
      setError(parseApiError(instructorCommentError, '강사 코멘트 저장에 실패했습니다.'));
    } finally {
      setSavingInstructorCommentCustomerId(null);
    }
  };

  const handleAttendanceStatusChange = async (
    customerId: number,
    attendanceStatus: 'reserved' | 'attended' | 'absent'
  ) => {
    try {
      setError('');
      setNotice('');
      setSavingAttendanceStatusCustomerId(customerId);
      await classAPI.updateRegistrationStatus(classId, customerId, attendanceStatus);
      await refreshClassAndRegistrations();
      setNotice('출석 상태를 변경했습니다.');
    } catch (attendanceStatusError: unknown) {
      console.error('Failed to update attendance status:', attendanceStatusError);
      setError(parseApiError(attendanceStatusError, '출석 상태 변경에 실패했습니다.'));
    } finally {
      setSavingAttendanceStatusCustomerId(null);
    }
  };

  if (isLoading) {
    return <p className="text-warm-600 py-8">수업 상세 로딩 중...</p>;
  }

  if (!classDetail) {
    return (
      <div className="card">
        <p className="text-red-700">수업 정보를 찾을 수 없습니다.</p>
        <div className="mt-4">
          <button className="btn-secondary" onClick={() => navigate('/classes')}>
            수업 관리로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary-800">수업 상세</h1>
          <p className="text-warm-600 mt-2">
            {classDetail.class_date.slice(0, 10)} {classDetail.start_time.slice(0, 5)}-{classDetail.end_time.slice(0, 5)} / {classDetail.title}
          </p>
        </div>
        <Link to="/classes" className="btn-secondary">
          수업 관리로
        </Link>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</p>}

      <section className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">수업 정보</h2>
        <p className="text-warm-700">
          신청 {classDetail.current_enrollment ?? 0}명 / 잔여 {classDetail.remaining_seats ?? classDetail.max_capacity}자리
        </p>
        <p className="text-warm-700 mt-2">상태: {classStatusLabel}</p>
      </section>

      <section className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">수동 신청 등록</h2>
        <form className="flex flex-col md:flex-row gap-3" onSubmit={handleManualRegister}>
          <select
            className="input-field md:max-w-sm"
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
          >
            <option value="">신청할 고객 선택</option>
            {unregisteredCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} ({customer.phone})
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={
              isRegisterSubmitting
              || !classDetail.is_open
              || !!classDetail.is_excluded
              || classDetail.class_status === 'completed'
            }
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRegisterSubmitting ? '등록 중...' : '수동 신청 등록'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">신청자 목록</h2>
        {registrations.length === 0 ? (
          <p className="text-warm-600 py-4">신청자가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {registrations.map((registration) => (
              <div key={registration.id} className="rounded-xl border border-warm-200 bg-warm-50 p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="font-semibold text-primary-800">{registration.customer_name}</p>
                    <p className="text-sm text-warm-700">{registration.customer_phone}</p>
                    <p className="text-xs text-warm-600 mt-1">
                      신청 시각: {new Date(registration.registered_at).toLocaleString('ko-KR')}
                    </p>
                    <p className="text-xs text-warm-600 mt-1">
                      출석 상태: {registration.attendance_status === 'attended'
                        ? '출석'
                        : registration.attendance_status === 'absent'
                          ? '결석'
                          : '예약'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() => void handleCancelRegistration(registration.customer_id)}
                      disabled={classDetail.class_status === 'completed'}
                      className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      신청 취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCheckIn(registration.customer_id)}
                      disabled={classDetail.class_status === 'completed' || checkingInCustomerId === registration.customer_id}
                      className="px-3 py-1.5 rounded-md bg-green-100 text-green-700 hover:bg-green-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {checkingInCustomerId === registration.customer_id ? '처리 중...' : '출석 체크'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveInstructorComment(registration)}
                      className="px-3 py-1.5 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!registration.attendance_id || savingInstructorCommentCustomerId === registration.customer_id}
                    >
                      {savingInstructorCommentCustomerId === registration.customer_id ? '저장 중...' : '강사 코멘트 저장'}
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="label" htmlFor={`attendance-status-${registration.customer_id}`}>
                    출석 상태
                  </label>
                  <select
                    id={`attendance-status-${registration.customer_id}`}
                    className="input-field md:max-w-xs"
                    value={registration.attendance_status || 'reserved'}
                    onChange={(event) => {
                      void handleAttendanceStatusChange(
                        registration.customer_id,
                        event.target.value as 'reserved' | 'attended' | 'absent'
                      );
                    }}
                    disabled={savingAttendanceStatusCustomerId === registration.customer_id}
                  >
                    <option value="reserved">예약</option>
                    <option value="attended">출석</option>
                    <option value="absent">결석</option>
                  </select>
                </div>

                <div className="mt-4">
                  <p className="label">신청자 코멘트</p>
                  <p className="text-sm text-warm-700">
                    {registration.registration_comment?.trim() || '-'}
                  </p>
                </div>

                <div className="mt-4">
                  <label className="label" htmlFor={`instructor-comment-${registration.customer_id}`}>
                    강사 코멘트
                  </label>
                  <textarea
                    id={`instructor-comment-${registration.customer_id}`}
                    className="input-field min-h-[88px]"
                    placeholder="예: 자세 안정적, 다음 수업에서 호흡 연동 연습 권장"
                    value={instructorCommentDrafts[registration.customer_id] || ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setInstructorCommentDrafts((prev) => ({ ...prev, [registration.customer_id]: value }));
                    }}
                    disabled={!registration.attendance_id}
                  />
                  {!registration.attendance_id && (
                    <p className="mt-2 text-xs text-warm-600">출석 체크 후 입력할 수 있습니다.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ClassDetail;
