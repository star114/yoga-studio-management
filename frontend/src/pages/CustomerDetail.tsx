import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { classAPI, customerAPI, membershipAPI } from '../services/api';
import {
  getCrossMembershipConfirmationMessage,
  parseApiError,
  shouldConfirmCrossMembershipRegistration,
} from '../utils/apiError';
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
  total_sessions?: number | null;
  consumed_sessions?: number;
  is_active: boolean;
  notes?: string | null;
  start_date?: string | null;
  expected_end_date?: string | null;
}

interface RecommendedClass {
  id: number;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  remaining_seats: number;
  current_enrollment: number;
  is_registered: boolean;
}

type ActivityTypeFilter = 'all' | 'attended' | 'reserved' | 'absent';

interface ClassActivity {
  activity_type: 'attended' | 'reserved' | 'absent';
  activity_id: number;
  class_id?: number | null;
  class_title?: string | null;
  class_type?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  class_end_time?: string | null;
  attendance_date?: string | null;
  registered_at?: string | null;
}

interface ClassActivityResponse {
  items: ClassActivity[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
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
const ACTIVITY_PAGE_SIZE = 10;

const formatConsumedSummary = (membership: Membership) => {
  const consumedSessions = membership.consumed_sessions ?? 0;
  if (membership.total_sessions === null || membership.total_sessions === undefined) {
    return `${consumedSessions}회`;
  }
  return `${consumedSessions} / ${membership.total_sessions}회`;
};

const CustomerDetail: React.FC = () => {
  const { id } = useParams();
  const customerId = Number(id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membershipRecommendedClasses, setMembershipRecommendedClasses] = useState<Record<number, RecommendedClass[]>>({});
  const [membershipRecommendationsLoading, setMembershipRecommendationsLoading] = useState<Record<number, boolean>>({});
  const [membershipRecommendationsError, setMembershipRecommendationsError] = useState<Record<number, string>>({});
  const [classReservationLoading, setClassReservationLoading] = useState<Record<number, boolean>>({});
  const [classActivities, setClassActivities] = useState<ClassActivity[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
  const [activityReloadToken, setActivityReloadToken] = useState(0);
  const [activityActionLoading, setActivityActionLoading] = useState<Record<string, boolean>>({});
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityTypeFilter>('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  const [isActivityFilterModalOpen, setIsActivityFilterModalOpen] = useState(false);
  const [draftActivityTypeFilter, setDraftActivityTypeFilter] = useState<ActivityTypeFilter>('all');
  const [draftActivitySearch, setDraftActivitySearch] = useState('');
  const [draftActivityDateFrom, setDraftActivityDateFrom] = useState('');
  const [draftActivityDateTo, setDraftActivityDateTo] = useState('');
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
  const activityPageItems = useMemo(() => {
    const pages: Array<number | 'ellipsis'> = [];
    if (activityTotalPages <= 7) {
      for (let pageNumber = 1; pageNumber <= activityTotalPages; pageNumber += 1) {
        pages.push(pageNumber);
      }
      return pages;
    }
    pages.push(1);
    if (activityPage > 4) {
      pages.push('ellipsis');
    }
    const start = Math.max(2, activityPage - 1);
    const end = Math.min(activityTotalPages - 1, activityPage + 1);
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.push(pageNumber);
    }
    if (activityPage < activityTotalPages - 3) {
      pages.push('ellipsis');
    }
    pages.push(activityTotalPages);
    return pages;
  }, [activityPage, activityTotalPages]);

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

  useEffect(() => {
    if (!hasValidCustomerId) {
      setIsActivityLoading(false);
      setActivityError('유효하지 않은 고객 ID입니다.');
      return;
    }

    const loadClassActivities = async () => {
      try {
        setActivityError('');
        setIsActivityLoading(true);
        const response = await customerAPI.getClassActivities(customerId, {
          page: activityPage,
          page_size: ACTIVITY_PAGE_SIZE,
          ...(activityTypeFilter === 'all' ? {} : { activity_type: activityTypeFilter }),
          ...(activitySearch.trim() ? { search: activitySearch.trim() } : {}),
          ...(activityDateFrom ? { date_from: activityDateFrom } : {}),
          ...(activityDateTo ? { date_to: activityDateTo } : {}),
        });
        const data = response.data as ClassActivity[] | ClassActivityResponse;
        if (Array.isArray(data)) {
          setClassActivities(data);
          setActivityTotal(data.length);
          setActivityTotalPages(1);
          return;
        }
        setClassActivities(data.items || []);
        setActivityTotal(data.pagination?.total ?? 0);
        setActivityTotalPages(data.pagination?.total_pages ?? 1);
      } catch (loadError) {
        console.error('Failed to load customer class activities:', loadError);
        setActivityError('수업 기록을 불러오지 못했습니다.');
      } finally {
        setIsActivityLoading(false);
      }
    };

    void loadClassActivities();
  }, [
    customerId,
    hasValidCustomerId,
    activityReloadToken,
    activityPage,
    activityTypeFilter,
    activitySearch,
    activityDateFrom,
    activityDateTo,
  ]);

  const handleCancelReservedClass = async (item: ClassActivity) => {
    const actionKey = `reserved-${item.activity_id}`;
    setActivityActionLoading((prev) => ({ ...prev, [actionKey]: true }));
    setError('');
    try {
      await classAPI.cancelRegistration(item.class_id as number, customerId);
      setActivityReloadToken((prev) => prev + 1);
      showNotice('예약을 취소했습니다.');
    } catch (cancelError: unknown) {
      console.error('Failed to cancel reserved class from activity list:', cancelError);
      setError(parseApiError(cancelError));
    } finally {
      setActivityActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleMarkAttendedAsAbsent = async (item: ClassActivity) => {
    const actionKey = `attended-${item.activity_id}`;
    setActivityActionLoading((prev) => ({ ...prev, [actionKey]: true }));
    setError('');
    try {
      await classAPI.updateRegistrationStatus(item.class_id as number, customerId, 'absent');
      await loadMemberships();
      setActivityReloadToken((prev) => prev + 1);
      showNotice('출석을 결석으로 변경했습니다.');
    } catch (updateError: unknown) {
      console.error('Failed to mark attended class as absent from activity list:', updateError);
      setError(parseApiError(updateError));
    } finally {
      setActivityActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2500);
  };

  const openActivityFilterModal = () => {
    setDraftActivityTypeFilter(activityTypeFilter);
    setDraftActivitySearch(activitySearch);
    setDraftActivityDateFrom(activityDateFrom);
    setDraftActivityDateTo(activityDateTo);
    setIsActivityFilterModalOpen(true);
  };

  const applyActivityFilterModal = () => {
    setActivityTypeFilter(draftActivityTypeFilter);
    setActivitySearch(draftActivitySearch.trim());
    setActivityDateFrom(draftActivityDateFrom);
    setActivityDateTo(draftActivityDateTo);
    setActivityPage(1);
    setIsActivityFilterModalOpen(false);
  };

  const loadCustomer = async () => {
    const response = await customerAPI.getById(customerId);
    setCustomer(response.data.customer);
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

  const loadRecommendedClassesForMembership = async (membership: Membership) => {
    const membershipId = membership.id;
    setMembershipRecommendationsLoading((prev) => ({ ...prev, [membershipId]: true }));
    setMembershipRecommendationsError((prev) => ({ ...prev, [membershipId]: '' }));

    try {
      const response = await customerAPI.getRecommendedClasses(customerId, {
        membership_name: membership.membership_type_name,
        limit: 10,
      });
      setMembershipRecommendedClasses((prev) => ({
        ...prev,
        [membershipId]: response.data as RecommendedClass[],
      }));
    } catch (loadError: unknown) {
      console.error('Failed to load recommended classes for membership:', loadError);
      setMembershipRecommendationsError((prev) => ({
        ...prev,
        [membershipId]: parseApiError(loadError),
      }));
    } finally {
      setMembershipRecommendationsLoading((prev) => ({ ...prev, [membershipId]: false }));
    }
  };

  const handleQuickReserveClass = async (membershipId: number, classId: number) => {
    setClassReservationLoading((prev) => ({ ...prev, [classId]: true }));
    setError('');
    try {
      await classAPI.register(classId, { customer_id: customerId });
      setMembershipRecommendedClasses((prev) => {
        const classes = prev[membershipId] as RecommendedClass[];
        return {
          ...prev,
          [membershipId]: classes.map((item) => {
            if (item.id !== classId) return item;
            return {
              ...item,
              is_registered: true,
              remaining_seats: Math.max(0, item.remaining_seats - 1),
              current_enrollment: item.current_enrollment + 1,
            };
          }),
        };
      });
      showNotice('수업을 예약했습니다.');
    } catch (reserveError: unknown) {
      console.error('Failed to reserve class from membership card:', reserveError);
      if (shouldConfirmCrossMembershipRegistration(reserveError)) {
        const ok = window.confirm(getCrossMembershipConfirmationMessage(reserveError));
        if (ok) {
          try {
            await classAPI.register(classId, {
              customer_id: customerId,
              allow_cross_membership_registration: true,
            });
            setMembershipRecommendedClasses((prev) => {
              const classes = prev[membershipId] as RecommendedClass[];
              return {
                ...prev,
                [membershipId]: classes.map((item) => {
                  if (item.id !== classId) return item;
                  return {
                    ...item,
                    is_registered: true,
                    remaining_seats: Math.max(0, item.remaining_seats - 1),
                    current_enrollment: item.current_enrollment + 1,
                  };
                }),
              };
            });
            showNotice('다른 회원권 차감으로 수업을 예약했습니다.');
            return;
          } catch (retryError: unknown) {
            console.error('Failed to reserve class with alternative membership:', retryError);
            setError(parseApiError(retryError));
            return;
          }
        }
        return;
      }
      setError(parseApiError(reserveError));
    } finally {
      setClassReservationLoading((prev) => ({ ...prev, [classId]: false }));
    }
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
                      <p className="text-sm text-warm-700">예약 가능 잔여: {membership.remaining_sessions ?? '무제한'}</p>
                      <p className="text-sm text-warm-700">소진 횟수: {formatConsumedSummary(membership)}</p>
                      <p className="text-sm text-warm-700">
                        시작일: {membership.start_date ? formatKoreanDate(membership.start_date, false) : '-'}
                      </p>
                      <p className="text-sm text-warm-700">
                        예상 종료일: {membership.expected_end_date ? formatKoreanDate(membership.expected_end_date, false) : '-'}
                      </p>
                      {membership.notes && <p className="text-sm text-warm-600">{membership.notes}</p>}
                      <div className="mt-3 space-y-2 rounded-md border border-warm-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-primary-800">예약 가능한 수업</p>
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => void loadRecommendedClassesForMembership(membership)}
                          >
                            불러오기
                          </button>
                        </div>
                        {(() => {
                          const recommendedClasses = membershipRecommendedClasses[membership.id] ?? [];
                          if (membershipRecommendationsLoading[membership.id]) {
                            return <p className="text-xs text-warm-600">예정 수업 조회 중...</p>;
                          }
                          if (membershipRecommendationsError[membership.id]) {
                            return <p className="text-xs text-red-700">{membershipRecommendationsError[membership.id]}</p>;
                          }
                          if (recommendedClasses.length === 0) {
                            return <p className="text-xs text-warm-600">예정된 같은 이름 수업이 없습니다.</p>;
                          }
                          const hasNoRemainingSessions = typeof membership.remaining_sessions === 'number' && membership.remaining_sessions <= 0;
                          return (
                            <div className="space-y-2">
                              {recommendedClasses.map((item) => (
                                <div key={item.id} className="flex flex-col gap-1 rounded border border-warm-100 p-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-sm text-primary-800">{item.title}</p>
                                    <p className="text-xs text-warm-600">
                                      {formatKoreanDateTime(item.class_date, item.start_time)} · 잔여 {item.remaining_seats}자리
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={
                                      item.is_registered
                                      || classReservationLoading[item.id]
                                      || !membership.is_active
                                      || hasNoRemainingSessions
                                      || item.remaining_seats <= 0
                                    }
                                    onClick={() => void handleQuickReserveClass(membership.id, item.id)}
                                  >
                                    {item.is_registered ? '예약됨' : classReservationLoading[item.id] ? '예약 중...' : '바로 예약'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
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

      <section className="card">
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-display font-semibold text-primary-800">수업 기록 (출석/예약/결석)</h2>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={openActivityFilterModal}
            >
              필터
            </button>
          </div>
          <p className="text-sm text-warm-600">
            총 {activityTotal}건 · {activityPage}/{Math.max(1, activityTotalPages)} 페이지
          </p>
        </div>

        {isActivityFilterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-warm-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-semibold text-primary-800">필터 설정</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsActivityFilterModalOpen(false)}
                >
                  닫기
                </button>
              </div>

              <div>
                <label className="label" htmlFor="customer-activity-status-filter">상태</label>
                <select
                  id="customer-activity-status-filter"
                  className="input-field"
                  value={draftActivityTypeFilter}
                  onChange={(e) => setDraftActivityTypeFilter(e.target.value as ActivityTypeFilter)}
                >
                  <option value="all">전체</option>
                  <option value="attended">출석</option>
                  <option value="reserved">예약</option>
                  <option value="absent">결석</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="customer-activity-search-filter">수업명 검색</label>
                <input
                  id="customer-activity-search-filter"
                  className="input-field"
                  placeholder="수업명 검색"
                  value={draftActivitySearch}
                  onChange={(e) => setDraftActivitySearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="customer-activity-date-from">시작일</label>
                  <input
                    id="customer-activity-date-from"
                    type="date"
                    className="input-field"
                    value={draftActivityDateFrom}
                    onChange={(e) => setDraftActivityDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="customer-activity-date-to">종료일</label>
                  <input
                    id="customer-activity-date-to"
                    type="date"
                    className="input-field"
                    value={draftActivityDateTo}
                    onChange={(e) => setDraftActivityDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setDraftActivityTypeFilter('all');
                    setDraftActivitySearch('');
                    setDraftActivityDateFrom('');
                    setDraftActivityDateTo('');
                  }}
                >
                  초기화
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsActivityFilterModalOpen(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={applyActivityFilterModal}
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        )}

        {isActivityLoading ? (
          <p className="text-warm-600 py-3">수업 기록을 불러오는 중...</p>
        ) : activityError ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{activityError}</p>
        ) : classActivities.length === 0 ? (
          <p className="text-warm-600 py-3">수업 기록이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {classActivities.map((item) => (
              <div key={`${item.activity_type}-${item.activity_id}`} className="rounded-lg border border-warm-200 bg-warm-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          item.activity_type === 'reserved'
                            ? 'bg-blue-100 text-blue-700'
                            : item.activity_type === 'absent'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {item.activity_type === 'reserved'
                          ? '예약'
                          : item.activity_type === 'absent'
                            ? '결석'
                            : '출석'}
                      </span>
                      {item.class_id ? (
                        <Link
                          to={`/classes/${item.class_id}`}
                          className="text-sm text-primary-800 font-medium hover:text-primary-900 hover:underline"
                        >
                          {item.class_title || item.class_type || '수업 정보 없음'}
                        </Link>
                      ) : (
                        <p className="text-sm text-primary-800 font-medium">
                          {item.class_title || item.class_type || '수업 정보 없음'}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-warm-700">
                      {item.class_date && item.class_start_time
                        ? `수업일시: ${formatKoreanDateTime(item.class_date, item.class_start_time)}`
                        : '-'}
                    </p>
                  </div>
                  {item.class_id && (
                    <div className="shrink-0">
                      {item.activity_type === 'reserved' ? (
                        <button
                          type="button"
                          className="btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={activityActionLoading[`reserved-${item.activity_id}`]}
                          onClick={() => void handleCancelReservedClass(item)}
                        >
                          {activityActionLoading[`reserved-${item.activity_id}`] ? '처리 중...' : '예약 취소'}
                        </button>
                      ) : item.activity_type === 'attended' ? (
                        <button
                          type="button"
                          className="btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={activityActionLoading[`attended-${item.activity_id}`]}
                          onClick={() => void handleMarkAttendedAsAbsent(item)}
                        >
                          {activityActionLoading[`attended-${item.activity_id}`] ? '처리 중...' : '결석 처리'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                disabled={activityPage <= 1}
                onClick={() => setActivityPage((prev) => Math.max(1, prev - 1))}
              >
                이전
              </button>
              {activityPageItems.map((item, index) => (
                item === 'ellipsis' ? (
                  <span key={`activity-ellipsis-${index}`} className="px-2 text-warm-500">...</span>
                ) : (
                  <button
                    key={`activity-page-${item}`}
                    type="button"
                    className={item === activityPage ? 'btn-primary min-w-[36px]' : 'btn-secondary min-w-[36px]'}
                    onClick={() => setActivityPage(item)}
                  >
                    {item}
                  </button>
                )
              ))}
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                disabled={activityPage >= activityTotalPages}
                onClick={() => setActivityPage((prev) => Math.min(activityTotalPages, prev + 1))}
              >
                다음
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default CustomerDetail;
