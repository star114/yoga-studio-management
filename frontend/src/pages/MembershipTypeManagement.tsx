import React, { useEffect, useState } from 'react';
import { membershipAPI, type MembershipTypeRecord } from '../services/api';
import { parseApiError } from '../utils/apiError';

interface TypeForm {
  name: string;
  description: string;
  total_sessions: string;
  reservable_class_titles: string;
}

const INITIAL_TYPE_FORM: TypeForm = {
  name: '',
  description: '',
  total_sessions: '',
  reservable_class_titles: '',
};

const normalizeReservableClassTitles = (value: string): string[] => {
  const titles = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return Array.from(new Set(titles));
};

const formatReservableClassTitles = (titles: string[] | undefined): string => {
  return (titles ?? []).join('\n');
};

const MembershipTypeManagement: React.FC = () => {
  const [types, setTypes] = useState<MembershipTypeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [form, setForm] = useState<TypeForm>(INITIAL_TYPE_FORM);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);

  useEffect(() => {
    void loadTypes();
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  const loadTypes = async () => {
    try {
      setError('');
      setIsLoading(true);
      const response = await membershipAPI.getTypes({ includeInactive: true });
      setTypes(response.data);
    } catch (loadError) {
      console.error('Failed to load membership types:', loadError);
      setError('회원권 관리 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setForm(INITIAL_TYPE_FORM);
    setEditingTypeId(null);
  };

  const startEdit = (type: MembershipTypeRecord) => {
    setEditingTypeId(type.id);
    setForm({
      name: type.name,
      description: type.description || '',
      total_sessions: String(type.total_sessions),
      reservable_class_titles: formatReservableClassTitles(type.reservable_class_titles),
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const reservableClassTitles = normalizeReservableClassTitles(form.reservable_class_titles);
      if (reservableClassTitles.length === 0) {
        setError('신청 가능한 수업명은 최소 1개 이상 입력해야 합니다.');
        return;
      }

      const payload = {
        name: form.name,
        description: form.description || null,
        total_sessions: Number(form.total_sessions),
        reservable_class_titles: reservableClassTitles,
      };

      if (editingTypeId) {
        await membershipAPI.updateType(editingTypeId, payload);
        showSuccess('회원권 관리 정보를 수정했습니다.');
      } else {
        await membershipAPI.createType(payload);
        showSuccess('회원권 관리 항목을 추가했습니다.');
      }

      await loadTypes();
      resetForm();
    } catch (submitError: unknown) {
      console.error('Failed to save membership type:', submitError);
      setError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (type: MembershipTypeRecord) => {
    const ok = window.confirm(`"${type.name}" 회원권 관리 항목을 비활성화할까요?`);
    if (!ok) return;

    try {
      await membershipAPI.deactivateType(type.id);
      await loadTypes();
      if (editingTypeId === type.id) {
        resetForm();
      }
      showSuccess('회원권 관리 항목을 비활성화했습니다.');
    } catch (deactivateError: unknown) {
      console.error('Failed to deactivate membership type:', deactivateError);
      setError(parseApiError(deactivateError));
    }
  };

  const handleDelete = async (type: MembershipTypeRecord) => {
    const ok = window.confirm(`"${type.name}" 회원권 관리 항목을 완전히 삭제할까요?`);
    if (!ok) return;

    try {
      await membershipAPI.deleteType(type.id);
      await loadTypes();
      if (editingTypeId === type.id) {
        resetForm();
      }
      showSuccess('회원권 관리 항목을 삭제했습니다.');
    } catch (deleteError: unknown) {
      console.error('Failed to delete membership type:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">회원권 관리</h1>
        <p className="text-warm-600">활성/비활성 회원권 관리 항목을 모두 확인하고 수정, 비활성화, 삭제할 수 있습니다.</p>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {successMessage && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{successMessage}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="card xl:col-span-1">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            {editingTypeId ? '회원권 관리 수정' : '회원권 관리 추가'}
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
              <label className="label" htmlFor="type-sessions">총 횟수</label>
              <input
                id="type-sessions"
                type="number"
                className="input-field"
                value={form.total_sessions}
                onChange={(e) => setForm((prev) => ({ ...prev, total_sessions: e.target.value }))}
                min={1}
                required
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
            <div>
              <label className="label" htmlFor="type-reservable-class-titles">신청 가능한 수업명</label>
              <textarea
                id="type-reservable-class-titles"
                className="input-field min-h-[120px]"
                value={form.reservable_class_titles}
                onChange={(e) => setForm((prev) => ({ ...prev, reservable_class_titles: e.target.value }))}
                placeholder={"아침요가\n아침요가 3개월"}
                required
              />
              <p className="mt-1 text-xs text-warm-500">
                한 줄에 하나씩 입력하세요. 빈 줄은 자동으로 제거되고 중복된 값은 정리됩니다.
              </p>
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
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">회원권 관리 목록</h2>
          {isLoading ? (
            <p className="text-warm-600 py-8 text-center">목록을 불러오는 중...</p>
          ) : types.length === 0 ? (
            <p className="text-warm-600 py-8 text-center">등록된 회원권 관리 항목이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {types.map((type) => {
                const reservableClassTitles = type.reservable_class_titles ?? [];

                return (
                  <div key={type.id} className="border border-warm-200 rounded-lg p-4 bg-warm-50">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-primary-800">{type.name}</p>
                        <p className="text-sm text-warm-600">
                          횟수: {type.total_sessions}회
                        </p>
                        {type.description && <p className="text-sm text-warm-700 mt-1">{type.description}</p>}
                        {reservableClassTitles.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {reservableClassTitles.map((title) => (
                              <span key={`${type.id}-${title}`} className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700">
                                {title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-warm-500">신청 가능한 수업명이 없습니다.</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 text-xs rounded-full ${type.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                        {type.is_active ? '활성' : '비활성'}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="button" className="px-3 py-1.5 rounded-md bg-warm-100 text-primary-800 hover:bg-warm-200" onClick={() => startEdit(type)}>
                        수정
                      </button>
                      {type.is_active ? (
                        <button type="button" className="px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200" onClick={() => void handleDeactivate(type)}>
                          비활성화
                        </button>
                      ) : null}
                      <button type="button" className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200" onClick={() => void handleDelete(type)}>
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MembershipTypeManagement;
