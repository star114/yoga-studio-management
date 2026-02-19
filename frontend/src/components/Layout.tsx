import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navItems: NavItem[] = [
    { to: '/', label: '대시보드', end: true },
    ...(user?.role === 'admin'
      ? [
          { to: '/customers', label: '고객 관리' },
          { to: '/membership-types', label: '회원권 관리' },
          { to: '/classes', label: '수업 관리' },
        ]
      : []),
  ];

  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? 'bg-primary-100 text-primary-800' : 'text-warm-700 hover:bg-warm-100'
    }`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute -top-20 -left-24 h-72 w-72 rounded-full bg-primary-200/30 blur-3xl" />
      <div className="pointer-events-none absolute top-16 -right-24 h-80 w-80 rounded-full bg-warm-300/30 blur-3xl" />

      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-white/68 backdrop-blur-md border-b border-warm-100/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM12 9.5v2.2m0 0l-3.2 2.1m3.2-2.1l3.2 2.1M8.8 13.8l-1.9 3.2m8.3-3.2l1.9 3.2M9.7 17h4.6M7.8 19h8.4" />
                  </svg>
                </div>
                <h1 className="text-xl font-display font-bold text-primary-800">
                  숨의 정원
                </h1>
              </div>

              <nav className="hidden md:flex items-center gap-2">
                {navItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navClassName}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-primary-800">{user?.email}</p>
                <p className="text-xs text-warm-600">
                  {user?.role === 'admin' ? '관리자' : '회원'}
                </p>
              </div>
              <button
                onClick={logout}
                aria-label="로그아웃"
                className="inline-flex items-center justify-center gap-2 px-2.5 py-2 sm:px-4 text-sm font-medium text-warm-700 hover:text-primary-800 transition-colors rounded-lg hover:bg-warm-100"
              >
                <svg
                  className="w-5 h-5 sm:w-4 sm:h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          </div>

          <nav className="md:hidden pb-3">
            <div className="grid grid-cols-3 gap-2">
              {navItems.map((item) => (
                <NavLink key={`mobile-${item.to}`} to={item.to} end={item.end} className={navClassName}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* 푸터 */}
      <footer className="mt-auto border-t border-warm-100/80 bg-white/68 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-warm-500">
            © 2026 Yoga Studio Management.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
