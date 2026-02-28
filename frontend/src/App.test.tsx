import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthState = {
  user: { id: number; login_id: string; role: 'admin' | 'customer' } | null;
  isLoading: boolean;
};

let authState: AuthState = { user: null, isLoading: false };

vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState,
}));

vi.mock('./components/Layout', async () => {
  const mod = await import('react-router-dom');
  return {
    default: () => (
      <div>
        <div>Layout</div>
        <mod.Outlet />
      </div>
    ),
  };
});

vi.mock('./pages/Login', () => ({ default: () => <div>Login Page</div> }));
vi.mock('./pages/AdminDashboard', () => ({ default: () => <div>Admin Dashboard</div> }));
vi.mock('./pages/CustomerDashboard', () => ({ default: () => <div>Customer Dashboard</div> }));
vi.mock('./pages/CustomerMemberships', () => ({ default: () => <div>Customer Memberships</div> }));
vi.mock('./pages/CustomerClassDetail', () => ({ default: () => <div>Customer Class Detail</div> }));
vi.mock('./pages/CustomerManagement', () => ({ default: () => <div>Customer Management</div> }));
vi.mock('./pages/CustomerDetail', () => ({ default: () => <div>Customer Detail</div> }));
vi.mock('./pages/CustomerAttendances', () => ({ default: () => <div>Customer Attendances</div> }));
vi.mock('./pages/CustomerProfile', () => ({ default: () => <div>Customer Profile</div> }));
vi.mock('./pages/MembershipTypeManagement', () => ({ default: () => <div>Membership Types</div> }));
vi.mock('./pages/AdminAccountManagement', () => ({ default: () => <div>Admin Accounts</div> }));
vi.mock('./pages/ClassManagement', () => ({ default: () => <div>Class Management</div> }));
vi.mock('./pages/ClassHistory', () => ({ default: () => <div>Class History</div> }));
vi.mock('./pages/ClassDetail', () => ({ default: () => <div>Class Detail</div> }));

const renderAt = async (path: string) => {
  window.history.pushState({}, 'test', path);
  const { default: App } = await import('./App');
  render(<App />);
};

describe('App routing shell', () => {
  beforeEach(() => {
    authState = { user: null, isLoading: false };
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it('shows loading screen when auth is loading', async () => {
    authState = { user: null, isLoading: true };
    await renderAt('/');
    expect(screen.getByText('로딩 중...')).toBeTruthy();
  });

  it('redirects unauthenticated users to login', async () => {
    await renderAt('/');
    expect(screen.getByText('Login Page')).toBeTruthy();
  });

  it('redirects logged-in users away from login', async () => {
    authState = { user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' }, isLoading: false };
    await renderAt('/login');
    expect(screen.getByText('Layout')).toBeTruthy();
    expect(screen.getByText('Admin Dashboard')).toBeTruthy();
  });

  it('renders customer dashboard for customer users', async () => {
    authState = { user: { id: 2, login_id: 'user@yoga.com', role: 'customer' }, isLoading: false };
    await renderAt('/');
    expect(screen.getByText('Customer Dashboard')).toBeTruthy();
  });

  it('blocks admin-only routes for customer users', async () => {
    authState = { user: { id: 2, login_id: 'user@yoga.com', role: 'customer' }, isLoading: false };
    await renderAt('/customers');
    expect(screen.getByText('Customer Dashboard')).toBeTruthy();
  });

  it('renders admin routes for admin users', async () => {
    authState = { user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' }, isLoading: false };
    await renderAt('/classes/1');
    expect(screen.getByText('Class Detail')).toBeTruthy();
  });

  it('renders class history route for admin users', async () => {
    authState = { user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' }, isLoading: false };
    await renderAt('/classes/history');
    expect(screen.getByText('Class History')).toBeTruthy();
  });

  it('renders admin account management route for admin users', async () => {
    authState = { user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' }, isLoading: false };
    await renderAt('/admin-accounts');
    expect(screen.getByText('Admin Accounts')).toBeTruthy();
  });

  it('renders customer attendance history route for admin users', async () => {
    authState = { user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' }, isLoading: false };
    await renderAt('/customers/1/attendances');
    expect(screen.getByText('Customer Attendances')).toBeTruthy();
  });

  it('handles nested redirects and wildcard fallback', async () => {
    authState = { user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' }, isLoading: false };
    await renderAt('/memberships');
    expect(screen.getByText('Customer Management')).toBeTruthy();

    cleanup();
    await renderAt('/unknown-route');
    expect(screen.getByText('Admin Dashboard')).toBeTruthy();
  });

  it('renders customer profile route', async () => {
    authState = { user: { id: 2, login_id: 'user@yoga.com', role: 'customer' }, isLoading: false };
    await renderAt('/profile');
    expect(screen.getByText('Customer Profile')).toBeTruthy();
  });

  it('renders customer memberships route', async () => {
    authState = { user: { id: 2, login_id: 'user@yoga.com', role: 'customer' }, isLoading: false };
    await renderAt('/memberships');
    expect(screen.getByText('Customer Memberships')).toBeTruthy();
  });

  it('renders customer class detail route', async () => {
    authState = { user: { id: 2, login_id: 'user@yoga.com', role: 'customer' }, isLoading: false };
    await renderAt('/classes/1');
    expect(screen.getByText('Customer Class Detail')).toBeTruthy();
  });
});
