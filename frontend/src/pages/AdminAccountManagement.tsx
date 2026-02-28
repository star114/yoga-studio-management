import React, { useEffect, useMemo, useState } from 'react';
import { adminAccountAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';
import { useAuth } from '../contexts/AuthContext';

interface AdminAccount {
  id: number;
  login_id: string;
  created_at?: string;
}

interface AdminAccountForm {
  login_id: string;
  password: string;
}

const INITIAL_FORM: AdminAccountForm = {
  login_id: '',
  password: '',
};

const formatCreatedAt = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { hour12: false });
};

const AdminAccountManagement: React.FC = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<AdminAccountForm>(INITIAL_FORM);

  const filteredAccounts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) => account.login_id.toLowerCase().includes(keyword));
  }, [accounts, search]);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await adminAccountAPI.getAll();
      setAccounts(response.data);
    } catch (loadError) {
      console.error('Failed to load admin accounts:', loadError);
      setError('관리자 계정 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const handleFormChange = (key: keyof AdminAccountForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFormError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    try {
      const login_id = form.login_id.trim();
      const password = form.password;

      if (!login_id) {
        setFormError('로그인 ID는 필수입니다.');
        return;
      }
      if (!password) {
        setFormError('비밀번호는 필수입니다.');
        return;
      }

      await adminAccountAPI.create({ login_id, password });
      await loadAccounts();
      resetForm();
    } catch (submitError: unknown) {
      console.error('Failed to create admin account:', submitError);
      setFormError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (account: AdminAccount) => {
    const nextPassword = window.prompt(`"${account.login_id}" 새 비밀번호를 입력하세요.`);
    if (nextPassword == null) return;
    if (!nextPassword.trim()) {
      setError('비밀번호는 비워둘 수 없습니다.');
      return;
    }

    try {
      await adminAccountAPI.resetPassword(account.id, nextPassword.trim());
      setError('');
      window.alert(`"${account.login_id}" 비밀번호를 재설정했습니다.`);
    } catch (resetError: unknown) {
      console.error('Failed to reset admin password:', resetError);
      setError(parseApiError(resetError));
    }
  };

  const handleDelete = async (account: AdminAccount) => {
    const ok = window.confirm(`"${account.login_id}" 관리자 계정을 삭제할까요?`);
    if (!ok) return;

    try {
      await adminAccountAPI.delete(account.id);
      await loadAccounts();
    } catch (deleteError: unknown) {
      console.error('Failed to delete admin account:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">관리자 계정 관리</h1>
        <p className="text-warm-600">운영 관리자 로그인 계정을 생성/삭제하고 비밀번호를 재설정합니다.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="card xl:col-span-2">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">신규 관리자 계정 생성</h2>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label" htmlFor="admin-login-id">로그인 ID</label>
              <input
                id="admin-login-id"
                className="input-field"
                value={form.login_id}
                onChange={(e) => handleFormChange('login_id', e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="admin-password">초기 비밀번호</label>
              <input
                id="admin-password"
                type="password"
                className="input-field"
                value={form.password}
                onChange={(e) => handleFormChange('password', e.target.value)}
                required
              />
            </div>

            {formError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex gap-3 items-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '저장 중...' : '관리자 생성'}
              </button>
            </div>
          </form>
        </section>

        <section className="card xl:col-span-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl font-display font-semibold text-primary-800">관리자 계정 목록</h2>
            <input
              className="input-field md:max-w-xs"
              placeholder="로그인 ID 검색"
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
            <p className="text-warm-600 py-8 text-center">관리자 계정 불러오는 중...</p>
          ) : filteredAccounts.length === 0 ? (
            <p className="text-warm-600 py-8 text-center">표시할 관리자 계정이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 text-left text-warm-600">
                    <th className="py-2 pr-4">로그인 ID</th>
                    <th className="py-2 pr-4">생성일</th>
                    <th className="py-2 pr-0 text-right">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => {
                    const isCurrentUser = user?.id === account.id;
                    return (
                      <tr key={account.id} className="border-b border-warm-100">
                        <td className="py-3 pr-4 font-medium text-primary-800">
                          {account.login_id}
                          {isCurrentUser ? <span className="ml-2 text-xs text-warm-500">(내 계정)</span> : null}
                        </td>
                        <td className="py-3 pr-4">{formatCreatedAt(account.created_at)}</td>
                        <td className="py-3 pr-0">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleResetPassword(account)}
                              className="px-3 py-1.5 rounded-md bg-primary-100 text-primary-800 hover:bg-primary-200"
                            >
                              비밀번호 재설정
                            </button>
                            <button
                              type="button"
                              disabled={isCurrentUser}
                              onClick={() => handleDelete(account)}
                              className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminAccountManagement;
