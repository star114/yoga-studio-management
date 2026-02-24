import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customerAPI, membershipAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';
import { formatKoreanDate, formatKoreanDateTime } from '../utils/dateFormat';

interface Customer {
  id: number;
  user_id?: number;
  name: string;
  phone: string;
  notes?: string | null;
}

interface MembershipType {
  id: number;
  name: string;
}

interface Membership {
  id: number;
  membership_type_name: string;
  remaining_sessions?: number | null;
  is_active: boolean;
  notes?: string | null;
  start_date?: string | null;
  expected_end_date?: string | null;
}

interface Attendance {
  id: number;
  attendance_date: string;
  class_title?: string | null;
  class_type?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  instructor_comment?: string | null;
  customer_comment?: string | null;
}

interface EditCustomerForm {
  name: string;
  phone: string;
  notes: string;
}

interface NewMembershipForm {
  membership_type_id: string;
  notes: string;
}

interface EditMembershipForm {
  remaining_sessions: string;
  is_active: boolean;
  notes: string;
}

const INITIAL_NEW_MEMBERSHIP_FORM: NewMembershipForm = {
  membership_type_id: '',
  notes: '',
};

const CustomerDetail: React.FC = () => {
  const { id } = useParams();
  const customerId = Number(id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [recentAttendances, setRecentAttendances] = useState<Attendance[]>([]);
  const [newMembershipForm, setNewMembershipForm] = useState<NewMembershipForm>(INITIAL_NEW_MEMBERSHIP_FORM);
  const [editingMembershipId, setEditingMembershipId] = useState<number | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState<EditCustomerForm>({
    name: '',
    phone: '',
    notes: '',
  });
  const [editMembershipForm, setEditMembershipForm] = useState<EditMembershipForm>({
    remaining_sessions: '',
    is_active: true,
    notes: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const hasValidCustomerId = useMemo(() => Number.isInteger(customerId) && customerId > 0, [customerId]);
  const latestAttendance = useMemo(() => recentAttendances[0] || null, [recentAttendances]);

  useEffect(() => {
    if (!hasValidCustomerId) {
      setIsLoading(false);
      setError('유효하지 않은 고객 ID입니다.');
      return;
    }

    const load = async () => {
      try {
        setError('');
        setIsLoading(true);
        const [customerRes, membershipTypesRes, membershipsRes] = await Promise.all([
          customerAPI.getById(customerId),
          membershipAPI.getTypes(),
          membershipAPI.getByCustomer(customerId),
        ]);

        setCustomer(customerRes.data.customer);
        if (customerRes.data.customer) {
          setEditCustomerForm({
            name: customerRes.data.customer.name,
            phone: customerRes.data.customer.phone,
            notes: customerRes.data.customer.notes || '',
          });
        }
        setRecentAttendances(customerRes.data.recentAttendances || []);
        setMembershipTypes(membershipTypesRes.data);
        setMemberships(membershipsRes.data);
      } catch (loadError) {
        console.error('Failed to initialize customer detail page:', loadError);
        setError('고객 상세 정보를 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [customerId, hasValidCustomerId]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2500);
  };

  const loadCustomer = async () => {
    const response = await customerAPI.getById(customerId);
    setCustomer(response.data.customer);
    setRecentAttendances(response.data.recentAttendances || []);
    const nextCustomer = response.data.customer as Customer | null;
    if (nextCustomer) {
      setEditCustomerForm({
        name: nextCustomer.name,
        phone: nextCustomer.phone,
        notes: nextCustomer.notes || '',
      });
    }
  };

  const loadMemberships = async () => {
    const response = await membershipAPI.getByCustomer(customerId);
    setMemberships(response.data);
  };

  const startEditCustomer = () => {
    setEditCustomerForm({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes || '',
    });
    setIsEditingCustomer(true);
    setError('');
  };

  const cancelEditCustomer = () => {
    setEditCustomerForm({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes || '',
    });
    setIsEditingCustomer(false);
  };

  const handleSaveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedPhone = editCustomerForm.phone.trim();
    if (!trimmedPhone) {
      setError('전화번호는 필수입니다.');
      return;
    }

    setError('');
    setIsSavingCustomer(true);
    try {
      await customerAPI.update(customerId, {
        name: editCustomerForm.name,
        phone: trimmedPhone,
        notes: editCustomerForm.notes.trim() || null,
      });

      setCustomer({
        ...customer,
        name: editCustomerForm.name,
        phone: trimmedPhone,
        notes: editCustomerForm.notes.trim() || null,
      });
      setIsEditingCustomer(false);
      showNotice('고객 정보를 수정했습니다.');
    } catch (saveError: unknown) {
      console.error('Failed to update customer:', saveError);
      setError(parseApiError(saveError));
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleCreateMembership = async (event: React.FormEvent) => {
    event.preventDefault();

    setIsSubmitting(true);
    setError('');

    try {
      await membershipAPI.create({
        customer_id: customerId,
        membership_type_id: Number(newMembershipForm.membership_type_id),
        notes: newMembershipForm.notes || null,
      });

      setNewMembershipForm(INITIAL_NEW_MEMBERSHIP_FORM);

      await Promise.all([loadMemberships(), loadCustomer()]);
      showNotice('회원권을 지급했습니다.');
    } catch (submitError: unknown) {
      console.error('Failed to create membership:', submitError);
      setError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditMembership = (membership: Membership) => {
    setEditingMembershipId(membership.id);
    setEditMembershipForm({
      remaining_sessions:
        membership.remaining_sessions === null || membership.remaining_sessions === undefined
          ? ''
          : String(membership.remaining_sessions),
      is_active: membership.is_active,
      notes: membership.notes || '',
    });
  };

  const handleUpdateMembership = async (membershipId: number) => {
    setError('');

    try {
      await membershipAPI.update(membershipId, {
        remaining_sessions: editMembershipForm.remaining_sessions === '' ? null : Number(editMembershipForm.remaining_sessions),
        is_active: editMembershipForm.is_active,
        notes: editMembershipForm.notes || null,
      });

      await Promise.all([loadMemberships(), loadCustomer()]);
      setEditingMembershipId(null);
      showNotice('회원권 정보를 수정했습니다.');
    } catch (updateError: unknown) {
      console.error('Failed to update membership:', updateError);
      setError(parseApiError(updateError));
    }
  };

  const handleDeleteMembership = async (membership: Membership) => {
    const ok = window.confirm(`"${membership.membership_type_name}" 회원권을 삭제할까요?`);
    if (!ok) return;

    setError('');
    try {
      await membershipAPI.delete(membership.id);
      await Promise.all([loadMemberships(), loadCustomer()]);
      showNotice('회원권을 삭제했습니다.');
    } catch (deleteError: unknown) {
      console.error('Failed to delete membership:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  const handleResetPassword = async () => {
    setError('');
    const ok = window.confirm('고객 로그인 비밀번호를 기본값 12345로 초기화합니다.');
    if (!ok) return;

    setIsResettingPassword(true);
    try {
      await customerAPI.resetPassword(customerId);
      showNotice('고객 비밀번호를 기본값(12345)으로 초기화했습니다.');
    } catch (resetError: unknown) {
      console.error('Failed to reset customer password:', resetError);
      setError(parseApiError(resetError));
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-warm-600">고객 상세 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (!customer || !hasValidCustomerId) {
    return (
      <div className="space-y-4 fade-in">
        <Link to="/customers" className="inline-flex items-center text-sm text-primary-700 hover:text-primary-900">
          ← 고객 목록으로
        </Link>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error || '고객을 찾을 수 없습니다.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary-800">고객 상세</h1>
          <p className="text-warm-600">회원권 지급 및 관리</p>
        </div>
        <Link to="/customers" className="btn-secondary">목록으로</Link>
      </div>

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-display font-semibold text-primary-800">기본 정보</h2>
          <div className="flex items-center gap-2">
            {!isEditingCustomer && (
              <button type="button" className="btn-secondary" onClick={startEditCustomer}>
                기본 정보 수정
              </button>
            )}
            <button
              type="button"
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isResettingPassword}
              onClick={() => void handleResetPassword()}
            >
              {isResettingPassword ? '초기화 중...' : '비밀번호 초기화'}
            </button>
          </div>
        </div>

        {isEditingCustomer ? (
          <form className="space-y-4" onSubmit={handleSaveCustomer}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="customer-detail-name">고객 이름</label>
                <input
                  id="customer-detail-name"
                  className="input-field"
                  value={editCustomerForm.name}
                  onChange={(e) => setEditCustomerForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="customer-detail-phone">고객 전화번호</label>
                <input
                  id="customer-detail-phone"
                  className="input-field"
                  value={editCustomerForm.phone}
                  onChange={(e) => setEditCustomerForm((prev) => ({ ...prev, phone: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="customer-detail-notes">고객 메모</label>
              <textarea
                id="customer-detail-notes"
                className="input-field min-h-[84px]"
                value={editCustomerForm.notes}
                onChange={(e) => setEditCustomerForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSavingCustomer} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {isSavingCustomer ? '저장 중...' : '고객 정보 저장'}
              </button>
              <button type="button" className="btn-secondary" onClick={cancelEditCustomer}>
                취소
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <p><span className="text-warm-600">이름:</span> <span className="text-primary-800 font-medium">{customer.name}</span></p>
              <p><span className="text-warm-600">전화번호:</span> <span className="text-primary-800">{customer.phone}</span></p>
            </div>
            {customer.notes && (
              <div className="mt-3 text-sm text-warm-700">
                <span className="text-warm-600">메모:</span> {customer.notes}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-display font-semibold text-primary-800">최근 출석 수업 및 코멘트</h2>
          <Link
            to={`/customers/${customerId}/attendances`}
            className="btn-secondary text-sm"
          >
            전체 보기
          </Link>
        </div>
        {!latestAttendance ? (
          <p className="text-warm-600 py-3">출석 기록이 없습니다.</p>
        ) : (
          <div className="rounded-lg border border-warm-200 bg-warm-50 p-4">
            <p className="text-primary-800 font-medium">
              {latestAttendance.class_title || latestAttendance.class_type || '수업 정보 없음'}
            </p>
            <p className="text-sm text-warm-700 mt-1">
              {latestAttendance.class_date && latestAttendance.class_start_time
                ? `수업일시: ${formatKoreanDateTime(latestAttendance.class_date, latestAttendance.class_start_time)}`
                : '-'}
            </p>
            <p className="text-sm text-warm-700 mt-2">
              강사 코멘트: {latestAttendance.instructor_comment?.trim() || '-'}
            </p>
            <p className="text-sm text-warm-700 mt-1">
              고객 출석 코멘트: {latestAttendance.customer_comment?.trim() || '-'}
            </p>
          </div>
        )}
      </section>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {notice && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="card xl:col-span-1">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">회원권 발급</h2>
          <form className="space-y-4" onSubmit={handleCreateMembership}>
            <div>
              <label className="label" htmlFor="membership-type">회원권 관리</label>
              <select
                id="membership-type"
                className="input-field"
                value={newMembershipForm.membership_type_id}
                onChange={(e) => setNewMembershipForm((prev) => ({ ...prev, membership_type_id: e.target.value }))}
                required
              >
                <option value="">선택하세요</option>
                {membershipTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="membership-notes">메모</label>
              <textarea
                id="membership-notes"
                className="input-field min-h-[84px]"
                value={newMembershipForm.notes}
                onChange={(e) => setNewMembershipForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '지급 중...' : '회원권 지급'}
            </button>
          </form>
        </section>

        <section className="card xl:col-span-2">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">지급된 회원권</h2>
          {memberships.length === 0 ? (
            <p className="text-warm-600 py-6 text-center">등록된 회원권이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {memberships.map((membership) => (
                <div key={membership.id} className="border border-warm-200 rounded-lg p-4 bg-warm-50">
                  {editingMembershipId === membership.id ? (
                    <div className="space-y-3">
                      <div className="font-medium text-primary-800">{membership.membership_type_name}</div>
                      <div>
                        <label className="label" htmlFor={`edit-remaining-${membership.id}`}>잔여 횟수</label>
                        <input
                          id={`edit-remaining-${membership.id}`}
                          type="number"
                          className="input-field"
                          value={editMembershipForm.remaining_sessions}
                          onChange={(e) => setEditMembershipForm((prev) => ({ ...prev, remaining_sessions: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`edit-notes-${membership.id}`}>메모</label>
                        <textarea
                          id={`edit-notes-${membership.id}`}
                          className="input-field min-h-[72px]"
                          value={editMembershipForm.notes}
                          onChange={(e) => setEditMembershipForm((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-warm-700">
                        <input
                          type="checkbox"
                          checked={editMembershipForm.is_active}
                          onChange={(e) => setEditMembershipForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                        />
                        활성 상태
                      </label>
                      <div className="flex gap-2">
                        <button type="button" className="btn-primary" onClick={() => void handleUpdateMembership(membership.id)}>저장</button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingMembershipId(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-primary-800">{membership.membership_type_name}</p>
                        </div>
                        <span className={`px-2.5 py-1 text-xs rounded-full ${membership.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                          {membership.is_active ? '활성' : '비활성'}
                        </span>
                      </div>
                      <p className="text-sm text-warm-700">잔여 횟수: {membership.remaining_sessions ?? '무제한'}</p>
                      <p className="text-sm text-warm-700">
                        시작일: {membership.start_date ? formatKoreanDate(membership.start_date, false) : '-'}
                      </p>
                      <p className="text-sm text-warm-700">
                        예상 종료일: {membership.expected_end_date ? formatKoreanDate(membership.expected_end_date, false) : '-'}
                      </p>
                      {membership.notes && <p className="text-sm text-warm-600">{membership.notes}</p>}
                      <div className="flex gap-2">
                        <button type="button" className="px-3 py-1.5 rounded-md bg-warm-100 text-primary-800 hover:bg-warm-200" onClick={() => startEditMembership(membership)}>수정</button>
                        <button type="button" className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200" onClick={() => void handleDeleteMembership(membership)}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CustomerDetail;
