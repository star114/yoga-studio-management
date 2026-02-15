import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-warm-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-warm-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h1 className="text-xl font-display font-bold text-primary-800">
                  요가원 관리
                </h1>
              </div>

              <nav className="hidden md:flex items-center gap-2">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) => (
                    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-100 text-primary-800'
                        : 'text-warm-700 hover:bg-warm-100'
                    }`
                  )}
                >
                  대시보드
                </NavLink>
                {user?.role === 'admin' && (
                  <>
                    <NavLink
                      to="/customers"
                      className={({ isActive }) => (
                        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-100 text-primary-800'
                            : 'text-warm-700 hover:bg-warm-100'
                        }`
                      )}
                    >
                      고객 관리
                    </NavLink>
                    <NavLink
                      to="/memberships"
                      className={({ isActive }) => (
                        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-100 text-primary-800'
                            : 'text-warm-700 hover:bg-warm-100'
                        }`
                      )}
                    >
                      회원권 지급
                    </NavLink>
                    <NavLink
                      to="/membership-types"
                      className={({ isActive }) => (
                        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-100 text-primary-800'
                            : 'text-warm-700 hover:bg-warm-100'
                        }`
                      )}
                    >
                      회원권 종류
                    </NavLink>
                    <NavLink
                      to="/classes"
                      className={({ isActive }) => (
                        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-100 text-primary-800'
                            : 'text-warm-700 hover:bg-warm-100'
                        }`
                      )}
                    >
                      수업 관리
                    </NavLink>
                  </>
                )}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-primary-800">{user?.email}</p>
                <p className="text-xs text-warm-600">
                  {user?.role === 'admin' ? '관리자' : '회원'}
                </p>
              </div>
              <button
                onClick={logout}
                className="px-4 py-2 text-sm font-medium text-warm-700 hover:text-primary-800 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* 푸터 */}
      <footer className="mt-auto border-t border-warm-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-warm-500">
            © 2024 요가원 관리 시스템. 마음을 담은 서비스.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
