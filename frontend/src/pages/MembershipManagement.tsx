import React, { useEffect, useMemo, useState } from 'react';
import { customerAPI, membershipAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';
import { formatKoreanDate } from '../utils/dateFormat';

interface Customer {
  id: number;
  name: string;
  phone: string;
}

interface MembershipType {
  id: number;
  name: string;
}

interface Membership {
  id: number;
  membership_type_name: string;
  start_date: string;
  end_date?: string | null;
  remaining_sessions?: number | null;
  purchase_price?: string | number | null;
  is_active: boolean;
  notes?: string | null;
}

interface NewMembershipForm {
  membership_type_id: string;
  start_date: string;
  purchase_price: string;
  notes: string;
}

interface EditMembershipForm {
  end_date: string;
  remaining_sessions: string;
  is_active: boolean;
  notes: string;
}

const INITIAL_NEW_MEMBERSHIP_FORM: NewMembershipForm = {
  membership_type_id: '',
  start_date: new Date().toISOString().slice(0, 10),
  purchase_price: '',
  notes: '',
};

const formatAmount = (value?: string | number | null): string => {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (Number.isNaN(amount)) return '-';
  return Math.round(amount).toLocaleString('ko-KR');
};

const MembershipManagement: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [newMembershipForm, setNewMembershipForm] = useState<NewMembershipForm>(INITIAL_NEW_MEMBERSHIP_FORM);
  const [editingMembershipId, setEditingMembershipId] = useState<number | null>(null);
  const [editMembershipForm, setEditMembershipForm] = useState<EditMembershipForm>({
    end_date: '',
    remaining_sessions: '',
    is_active: true,
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (selectedCustomerId !== null) {
      void loadMemberships(selectedCustomerId);
    } else {
      setMemberships([]);
    }
  }, [selectedCustomerId]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  const initialize = async () => {
    try {
      setError('');
      setIsLoading(true);

      const [customersRes, typesRes] = await Promise.all([
        customerAPI.getAll(),
        membershipAPI.getTypes(),
      ]);

      setCustomers(customersRes.data);
      setMembershipTypes(typesRes.data);

      if (customersRes.data.length > 0) {
        setSelectedCustomerId(customersRes.data[0].id);
      }
    } catch (loadError) {
      console.error('Failed to initialize membership assignment page:', loadError);
      setError('초기 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMemberships = async (customerId: number) => {
    try {
      setError('');
      const response = await membershipAPI.getByCustomer(customerId);
      setMemberships(response.data);
    } catch (loadError) {
      console.error('Failed to load memberships:', loadError);
      setError('회원권 목록을 불러오지 못했습니다.');
    }
  };

  const handleCreateMembership = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomerId) return;

    setIsSubmitting(true);
    setError('');

    try {
      await membershipAPI.create({
        customer_id: selectedCustomerId,
        membership_type_id: Number(newMembershipForm.membership_type_id),
        start_date: newMembershipForm.start_date,
        purchase_price: newMembershipForm.purchase_price ? Number(newMembershipForm.purchase_price) : null,
        notes: newMembershipForm.notes || null,
      });

      setNewMembershipForm({
        ...INITIAL_NEW_MEMBERSHIP_FORM,
        start_date: new Date().toISOString().slice(0, 10),
      });
      await loadMemberships(selectedCustomerId);
      showSuccess('회원권을 지급했습니다.');
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
      end_date: membership.end_date ? membership.end_date.slice(0, 10) : '',
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
        end_date: editMembershipForm.end_date || null,
        remaining_sessions: editMembershipForm.remaining_sessions === '' ? null : Number(editMembershipForm.remaining_sessions),
        is_active: editMembershipForm.is_active,
        notes: editMembershipForm.notes || null,
      });

      if (selectedCustomerId) {
        await loadMemberships(selectedCustomerId);
      }
      setEditingMembershipId(null);
      showSuccess('회원권 정보를 수정했습니다.');
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
      if (selectedCustomerId) {
        await loadMemberships(selectedCustomerId);
      }
      showSuccess('회원권을 삭제했습니다.');
    } catch (deleteError: unknown) {
      console.error('Failed to delete membership:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-warm-600">회원권 지급 화면을 준비 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">회원별 회원권 지급</h1>
        <p className="text-warm-600">고객 단위로 회원권을 발급하고, 발급된 회원권을 관리합니다.</p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {successMessage && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{successMessage}</p>
      )}

      <section className="card">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <label className="label mb-0 md:min-w-24" htmlFor="membership-customer">고객 선택</label>
          <select
            id="membership-customer"
            className="input-field md:max-w-md"
            value={selectedCustomerId ?? ''}
            onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : null)}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} ({customer.phone})
              </option>
            ))}
          </select>
          {selectedCustomer && <p className="text-sm text-warm-600">로그인 아이디: {selectedCustomer.phone}</p>}
        </div>
      </section>

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
              <label className="label" htmlFor="start-date">시작일</label>
              <input
                id="start-date"
                type="date"
                className="input-field"
                value={newMembershipForm.start_date}
                onChange={(e) => setNewMembershipForm((prev) => ({ ...prev, start_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="purchase-price">결제 금액</label>
              <input
                id="purchase-price"
                type="number"
                className="input-field"
                placeholder="비워두면 기본값"
                min={0}
                step={1}
                value={newMembershipForm.purchase_price}
                onChange={(e) => setNewMembershipForm((prev) => ({ ...prev, purchase_price: e.target.value }))}
              />
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
              disabled={isSubmitting || !selectedCustomerId}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="label" htmlFor={`edit-end-date-${membership.id}`}>종료일</label>
                          <input
                            id={`edit-end-date-${membership.id}`}
                            type="date"
                            className="input-field"
                            value={editMembershipForm.end_date}
                            onChange={(e) => setEditMembershipForm((prev) => ({ ...prev, end_date: e.target.value }))}
                          />
                        </div>
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
                          <p className="text-sm text-warm-600">
                            시작일 {formatKoreanDate(membership.start_date)}
                            {membership.end_date ? ` / 종료일 ${formatKoreanDate(membership.end_date)}` : ''}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 text-xs rounded-full ${membership.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                          {membership.is_active ? '활성' : '비활성'}
                        </span>
                      </div>
                      <p className="text-sm text-warm-700">
                        잔여 횟수: {membership.remaining_sessions ?? '무제한'} / 결제금액: {formatAmount(membership.purchase_price)}
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

export default MembershipManagement;
