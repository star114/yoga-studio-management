import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';

interface Customer {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  notes?: string | null;
  membership_count?: string | number;
  total_attendance?: string | number;
}

interface CustomerForm {
  name: string;
  phone: string;
  notes: string;
}

const INITIAL_FORM: CustomerForm = {
  name: '',
  phone: '',
  notes: '',
};

const CustomerManagement: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerForm>(INITIAL_FORM);

  const isEditMode = editingCustomerId !== null;

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return customers;

    return customers.filter((customer) => (
      customer.name.toLowerCase().includes(keyword)
      || customer.phone.toLowerCase().includes(keyword)
    ));
  }, [customers, search]);

  useEffect(() => {
    void loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setError('');
      setIsLoading(true);
      const response = await customerAPI.getAll();
      setCustomers(response.data);
    } catch (loadError) {
      console.error('Failed to load customers:', loadError);
      setError('고객 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFormError('');
    setEditingCustomerId(null);
  };

  const startEdit = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setFormError('');
    setForm({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes || '',
    });
  };

  const handleFormChange = (key: keyof CustomerForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    try {
      const trimmedPhone = form.phone.trim();

      if (!trimmedPhone) {
        setFormError('전화번호는 필수입니다.');
        return;
      }

      if (isEditMode && editingCustomerId) {
        await customerAPI.update(editingCustomerId, {
          name: form.name,
          phone: trimmedPhone,
          notes: form.notes || null,
        });
      } else {
        await customerAPI.create({
          name: form.name,
          phone: trimmedPhone,
          notes: form.notes || null,
        });
      }

      await loadCustomers();
      resetForm();
    } catch (submitError: unknown) {
      console.error('Failed to save customer:', submitError);
      setFormError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    const ok = window.confirm(`"${customer.name}" 고객 계정을 삭제할까요?`);
    if (!ok) return;

    try {
      await customerAPI.delete(customer.id);
      await loadCustomers();
      if (editingCustomerId === customer.id) {
        resetForm();
      }
    } catch (deleteError: unknown) {
      console.error('Failed to delete customer:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">고객 관리</h1>
        <p className="text-warm-600">고객 로그인 계정을 생성하고 기본 정보를 관리합니다.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="card xl:col-span-2">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            {isEditMode ? '고객 정보 수정' : '신규 고객 계정 생성'}
          </h2>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label" htmlFor="customer-name">이름</label>
              <input
                id="customer-name"
                className="input-field"
                value={form.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="customer-phone">전화번호</label>
              <input
                id="customer-phone"
                className="input-field"
                value={form.phone}
                onChange={(e) => handleFormChange('phone', e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-warm-500">입력한 전화번호가 로그인 아이디로 사용됩니다.</p>
            </div>

            <div>
              <label className="label" htmlFor="customer-notes">메모</label>
              <textarea
                id="customer-notes"
                className="input-field min-h-[84px]"
                value={form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            {!isEditMode && (
              <p className="text-xs text-warm-500">
                신규 고객의 초기 비밀번호는 <span className="font-semibold text-primary-800">12345</span>로 자동 설정됩니다.
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '저장 중...' : isEditMode ? '정보 저장' : '고객 생성'}
              </button>
              {isEditMode && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  취소
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card xl:col-span-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl font-display font-semibold text-primary-800">고객 목록</h2>
            <input
              className="input-field md:max-w-xs"
              placeholder="이름/전화번호 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          {isLoading ? (
            <p className="text-warm-600 py-8 text-center">고객 목록 불러오는 중...</p>
          ) : filteredCustomers.length === 0 ? (
            <p className="text-warm-600 py-8 text-center">표시할 고객이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 text-left text-warm-600">
                    <th className="py-2 pr-4">이름</th>
                    <th className="py-2 pr-4">전화번호</th>
                    <th className="py-2 pr-4">회원권</th>
                    <th className="py-2 pr-4">출석</th>
                    <th className="py-2 pr-0 text-right">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-warm-100">
                      <td className="py-3 pr-4 font-medium text-primary-800">{customer.name}</td>
                      <td className="py-3 pr-4">{customer.phone}</td>
                      <td className="py-3 pr-4">{customer.membership_count ?? 0}</td>
                      <td className="py-3 pr-4">{customer.total_attendance ?? 0}</td>
                      <td className="py-3 pr-0">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/customers/${customer.id}`}
                            className="px-3 py-1.5 rounded-md bg-primary-100 text-primary-800 hover:bg-primary-200"
                          >
                            상세
                          </Link>
                          <button
                            type="button"
                            onClick={() => startEdit(customer)}
                            className="px-3 py-1.5 rounded-md bg-warm-100 text-primary-800 hover:bg-warm-200"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(customer)}
                            className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CustomerManagement;
