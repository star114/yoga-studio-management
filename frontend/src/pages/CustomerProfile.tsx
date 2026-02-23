import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';

const CustomerProfile: React.FC = () => {
  const { user, customerInfo } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (user?.role !== 'customer') {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (newPassword.length < 6) {
      setError('새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('비밀번호를 변경했습니다.');
    } catch (submitError: unknown) {
      console.error('Failed to change password:', submitError);
      setError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary-800 mb-2">내 정보</h1>
        <p className="text-warm-600">내 계정 정보를 확인하고 비밀번호를 변경할 수 있습니다.</p>
      </div>

      <section className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">기본 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p><span className="text-warm-600">이름:</span> <span className="text-primary-800 font-medium">{customerInfo?.name || '-'}</span></p>
          <p><span className="text-warm-600">이메일:</span> <span className="text-primary-800">{user.email}</span></p>
          <p><span className="text-warm-600">전화번호:</span> <span className="text-primary-800">{customerInfo?.phone || '-'}</span></p>
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">비밀번호 변경</h2>
        <form className="space-y-4 max-w-xl" onSubmit={handleSubmit}>
          <div>
            <label className="label" htmlFor="current-password">현재 비밀번호</label>
            <input
              id="current-password"
              type="password"
              className="input-field"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="new-password">새 비밀번호</label>
            <input
              id="new-password"
              type="password"
              className="input-field"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">새 비밀번호 확인</label>
            <input
              id="confirm-password"
              type="password"
              className="input-field"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </section>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {notice && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</p>
      )}
    </div>
  );
};

export default CustomerProfile;
