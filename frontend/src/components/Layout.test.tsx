import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';

type AuthState = {
  user: { id: number; login_id: string; role: 'admin' | 'customer' } | null;
  customerInfo?: { id: number; name: string; phone: string } | null;
  logout: () => void;
};

let authState: AuthState = {
  user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' },
  logout: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const renderLayout = () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>Outlet Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
};

describe('Layout', () => {
  beforeEach(() => {
    authState = {
      user: { id: 1, login_id: 'admin@yoga.com', role: 'admin' },
      logout: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders admin navigation and admin role label', () => {
    renderLayout();
    expect(screen.getAllByText('고객 관리').length).toBeGreaterThan(0);
    expect(screen.getAllByText('회원권 관리').length).toBeGreaterThan(0);
    expect(screen.getAllByText('수업 관리').length).toBeGreaterThan(0);
    expect(screen.getByText('관리자')).toBeTruthy();
    expect(screen.getByText('Outlet Content')).toBeTruthy();
  });

  it('renders customer navigation and customer role label', () => {
    authState = {
      user: { id: 2, login_id: '010-1111-2222', role: 'customer' },
      customerInfo: { id: 2, name: '고객', phone: '010-1111-2222' },
      logout: vi.fn(),
    };
    renderLayout();
    expect(screen.getAllByText('🧘 수련 기록').length).toBeGreaterThan(0);
    expect(screen.getAllByText('🎟️ 회원권').length).toBeGreaterThan(0);
    expect(screen.getAllByText('👤 내 정보').length).toBeGreaterThan(0);
    expect(screen.getByText('회원(아이디 로그인)')).toBeTruthy();
    expect(screen.getByText('010-1111-2222')).toBeTruthy();
  });

  it('calls logout when logout button is clicked', () => {
    renderLayout();
    screen.getByRole('button', { name: '로그아웃' }).click();
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it('shows fallback login id when login_id is empty', () => {
    authState = {
      user: { id: 3, login_id: '', role: 'customer' },
      customerInfo: { id: 3, name: '테스트', phone: '010-3333-4444' },
      logout: vi.fn(),
    };

    renderLayout();

    expect(screen.getByText('-')).toBeTruthy();
  });
});
