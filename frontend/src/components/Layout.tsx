import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const Layout: React.FC = () => {
  const { user, customerInfo, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navItems: NavItem[] = [
    { to: '/', label: isAdmin ? '대시보드' : '🧘 수련 기록', end: true },
    ...(isAdmin
      ? [
          { to: '/customers', label: '고객 관리' },
          { to: '/membership-types', label: '회원권 관리' },
          { to: '/classes', label: '수업 관리' },
          { to: '/admin-accounts', label: '관리자 계정' },
        ]
      : [
          { to: '/memberships', label: '🎟️ 회원권' },
          { to: '/profile', label: '👤 내 정보' },
        ]),
  ];

  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
      isActive
        ? 'bg-white text-primary-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] border border-white/90'
        : 'text-slate-600 hover:text-primary-800 border border-transparent'
    }`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#b8d3ff]/40 blur-3xl" />
      <div className="pointer-events-none absolute top-20 -right-24 h-80 w-80 rounded-full bg-[#d3e6ff]/42 blur-3xl" />

      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-white/58 backdrop-blur-xl border-b border-white/60 shadow-[0_1px_0_rgba(255,255,255,0.6)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center flex-1">
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary-600 rounded-full flex items-center justify-center shadow-[0_6px_16px_rgba(10,132,255,0.26)]">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM12 9.5v2.2m0 0l-3.2 2.1m3.2-2.1l3.2 2.1M8.8 13.8l-1.9 3.2m8.3-3.2l1.9 3.2M9.7 17h4.6M7.8 19h8.4" />
                  </svg>
                </div>
                <h1 className="text-base sm:text-xl font-display font-bold text-primary-800">
                  숨의정원요가
                </h1>
              </div>

              <nav className="hidden md:inline-flex items-center gap-1 mx-auto ios-segment">
                {navItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navClassName}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-primary-800">
                  {user?.login_id || '-'}
                </p>
                <p className="text-xs text-warm-600">
                  {user?.role === 'admin' ? '관리자' : '회원(아이디 로그인)'}
                </p>
              </div>
              <button
                onClick={logout}
                aria-label="로그아웃"
                className="inline-flex items-center justify-center gap-2 px-2.5 py-2 sm:px-4 text-sm font-medium text-warm-700 hover:text-primary-800 transition-colors rounded-xl hover:bg-white/70"
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

          <nav className="md:hidden pb-3 flex justify-center">
            <div className="ios-segment max-w-full overflow-x-auto no-scrollbar whitespace-nowrap">
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
      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        <Outlet />
      </main>

      {/* 푸터 */}
      <footer className="mt-auto border-t border-white/70 bg-white/58 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <p className="text-center text-sm text-warm-500">
            © 2026 Yoga Studio Management.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
