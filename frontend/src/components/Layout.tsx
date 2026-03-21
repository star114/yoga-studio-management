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
        ? 'bg-[rgba(255,249,242,0.96)] text-[var(--text-strong)] shadow-[0_8px_20px_rgba(91,65,49,0.12)] border border-[rgba(122,93,72,0.14)]'
        : 'text-[var(--text-muted)] hover:text-[var(--text-strong)] border border-transparent'
    }`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(255,251,255,0.82),transparent_64%)]" />
      <div className="pointer-events-none absolute -top-28 left-[-5rem] h-80 w-80 rounded-full bg-[#cdb5d2]/34 blur-3xl" />
      <div className="pointer-events-none absolute top-20 right-[-4rem] h-96 w-96 rounded-full bg-[#ddd3e4]/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-6rem] left-1/3 h-64 w-64 rounded-full bg-[#efe3f1]/28 blur-3xl" />

      <header className="sticky top-0 z-20 border-b border-[rgba(124,102,126,0.12)] bg-[rgba(245,237,245,0.78)] backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.56)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[4.75rem]">
            <div className="flex items-center flex-1">
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-[1.25rem] overflow-hidden shadow-[0_14px_24px_rgba(112,88,118,0.22)] bg-[#b8a7bb]">
                  <img src="/soom-garden-logo.png" alt="" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="section-kicker hidden sm:block">Breath And Balance</p>
                  <h1 className="text-lg sm:text-[1.55rem] font-display font-bold text-[var(--text-strong)]">
                    숨의정원요가
                  </h1>
                </div>
              </div>

              <nav className="hidden md:inline-flex items-center gap-1 mx-auto ios-segment bg-[rgba(184,167,187,0.12)]">
                {navItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navClassName}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-[var(--text-strong)]">
                  {user?.login_id || '-'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {user?.role === 'admin' ? '관리자' : '회원(아이디 로그인)'}
                </p>
              </div>
              <button
                onClick={logout}
                aria-label="로그아웃"
                className="inline-flex items-center justify-center gap-2 px-2.5 py-2 sm:px-4 text-sm font-medium text-[var(--text-body)] hover:text-[var(--text-strong)] transition-colors rounded-xl hover:bg-[rgba(255,250,255,0.72)]"
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
            <div className="ios-segment max-w-full overflow-x-auto no-scrollbar whitespace-nowrap bg-[rgba(184,167,187,0.12)]">
              {navItems.map((item) => (
                <NavLink key={`mobile-${item.to}`} to={item.to} end={item.end} className={navClassName}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-[rgba(124,102,126,0.12)] bg-[rgba(245,237,245,0.72)] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <p className="text-center text-sm text-[var(--text-muted)]">
            © 2026 Yoga Studio Management.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
