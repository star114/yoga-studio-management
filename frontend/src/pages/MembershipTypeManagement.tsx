import React, { useEffect, useState } from 'react';
import { membershipAPI } from '../services/api';

interface MembershipType {
  id: number;
  name: string;
  description?: string | null;
  duration_days?: number | null;
  total_sessions?: number | null;
  price?: string | number | null;
  is_active: boolean;
}

interface TypeForm {
  name: string;
  description: string;
  duration_days: string;
  total_sessions: string;
  price: string;
}

const INITIAL_TYPE_FORM: TypeForm = {
  name: '',
  description: '',
  duration_days: '',
  total_sessions: '',
  price: '',
};

const MembershipTypeManagement: React.FC = () => {
  const [types, setTypes] = useState<MembershipType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [form, setForm] = useState<TypeForm>(INITIAL_TYPE_FORM);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);

  useEffect(() => {
    void loadTypes();
  }, []);

  const parseApiError = (apiError: any): string => {
    if (Array.isArray(apiError?.response?.data?.errors)) {
      return apiError.response.data.errors.map((item: any) => item.msg).join(', ');
    }
    return apiError?.response?.data?.error || '요청 처리에 실패했습니다.';
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  const loadTypes = async () => {
    try {
      setError('');
      setIsLoading(true);
      const response = await membershipAPI.getTypes();
      setTypes(response.data);
    } catch (loadError) {
      console.error('Failed to load membership types:', loadError);
      setError('회원권 종류 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setForm(INITIAL_TYPE_FORM);
    setEditingTypeId(null);
  };

  const startEdit = (type: MembershipType) => {
    setEditingTypeId(type.id);
    setForm({
      name: type.name,
      description: type.description || '',
      duration_days: type.duration_days === null || type.duration_days === undefined ? '' : String(type.duration_days),
      total_sessions: type.total_sessions === null || type.total_sessions === undefined ? '' : String(type.total_sessions),
      price: type.price === null || type.price === undefined ? '' : String(type.price),
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        duration_days: form.duration_days ? Number(form.duration_days) : null,
        total_sessions: form.total_sessions ? Number(form.total_sessions) : null,
        price: form.price ? Number(form.price) : null,
      };

      if (editingTypeId) {
        await membershipAPI.updateType(editingTypeId, payload);
        showSuccess('회원권 종류를 수정했습니다.');
      } else {
        await membershipAPI.createType(payload);
        showSuccess('회원권 종류를 추가했습니다.');
      }

      await loadTypes();
      resetForm();
    } catch (submitError: any) {
      console.error('Failed to save membership type:', submitError);
      setError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (type: MembershipType) => {
    const ok = window.confirm(`"${type.name}" 회원권 종류를 비활성화할까요?`);
    if (!ok) return;

    try {
      await membershipAPI.deactivateType(type.id);
      await loadTypes();
      if (editingTypeId === type.id) {
        resetForm();
      }
      showSuccess('회원권 종류를 비활성화했습니다.');
    } catch (deactivateError: any) {
      console.error('Failed to deactivate membership type:', deactivateError);
      setError(parseApiError(deactivateError));
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">회원권 종류 관리</h1>
        <p className="text-warm-600">현재 운영중인 회원권 종류를 추가/수정/비활성화합니다.</p>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {successMessage && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{successMessage}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="card xl:col-span-1">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            {editingTypeId ? '회원권 종류 수정' : '회원권 종류 추가'}
          </h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label" htmlFor="type-name">이름</label>
              <input
                id="type-name"
                className="input-field"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="type-duration">기간(일)</label>
              <input
                id="type-duration"
                type="number"
                className="input-field"
                value={form.duration_days}
                onChange={(e) => setForm((prev) => ({ ...prev, duration_days: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="type-sessions">총 횟수</label>
              <input
                id="type-sessions"
                type="number"
                className="input-field"
                value={form.total_sessions}
                onChange={(e) => setForm((prev) => ({ ...prev, total_sessions: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="type-price">가격</label>
              <input
                id="type-price"
                type="number"
                className="input-field"
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="type-description">설명</label>
              <textarea
                id="type-description"
                className="input-field min-h-[90px]"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? '저장 중...' : editingTypeId ? '수정 저장' : '종류 추가'}
              </button>
              {editingTypeId && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  취소
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card xl:col-span-2">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">운영중인 회원권 종류</h2>
          {isLoading ? (
            <p className="text-warm-600 py-8 text-center">목록을 불러오는 중...</p>
          ) : types.length === 0 ? (
            <p className="text-warm-600 py-8 text-center">운영중인 회원권 종류가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {types.map((type) => (
                <div key={type.id} className="border border-warm-200 rounded-lg p-4 bg-warm-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-primary-800">{type.name}</p>
                      <p className="text-sm text-warm-600">
                        기간: {type.duration_days ?? '-'}일 / 횟수: {type.total_sessions ?? '무제한'} / 가격: {type.price ?? '-'}
                      </p>
                      {type.description && <p className="text-sm text-warm-700 mt-1">{type.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="button" className="px-3 py-1.5 rounded-md bg-warm-100 text-primary-800 hover:bg-warm-200" onClick={() => startEdit(type)}>
                      수정
                    </button>
                    <button type="button" className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200" onClick={() => void handleDeactivate(type)}>
                      비활성화
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MembershipTypeManagement;
