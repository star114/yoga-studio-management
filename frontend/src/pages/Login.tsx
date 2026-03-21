import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { parseApiError } from '../utils/apiError';

const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(identifier, password);
      navigate('/');
    } catch (error: unknown) {
      setError(parseApiError(error, '로그인에 실패했습니다.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,rgba(255,251,255,0.84),transparent_64%)]" />
      <div className="pointer-events-none absolute -top-24 -left-20 h-80 w-80 rounded-full bg-[#cdb5d2]/34 blur-3xl" />
      <div className="pointer-events-none absolute top-20 -right-16 h-96 w-96 rounded-full bg-[#ddd3e4]/28 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-48 w-[38rem] -translate-x-1/2 rounded-full bg-[rgba(255,250,255,0.56)] blur-3xl" />

      <div className="max-w-md w-full mx-auto space-y-6">
          <div className="text-center fade-in">
            <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-[1.75rem] shadow-[0_18px_30px_rgba(112,88,118,0.18)] bg-[#b8a7bb]">
              <img src="/soom-garden-logo.png" alt="" className="h-full w-full object-cover" />
            </div>
            <h2 className="text-4xl font-display font-bold text-[var(--text-strong)] mb-2">
              숨의정원요가
            </h2>
          </div>

          <div className="card fade-in calm-sheen" style={{ animationDelay: '0.1s' }}>
            <form className="space-y-6 relative" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="identifier" className="label">
                  아이디
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  className="input-field"
                  placeholder="아이디를 입력하세요"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  비밀번호
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          </div>
      </div>
    </div>
  );
};

export default Login;
