import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { authAPI } from '../services/api';

vi.mock('../services/api', () => ({
  authAPI: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
  },
}));

const Probe: React.FC = () => {
  const { user, customerInfo, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
      <span data-testid="email">{user?.login_id ?? ''}</span>
      <span data-testid="customer">{customerInfo?.name ?? ''}</span>
    </div>
  );
};

const ActionProbe: React.FC = () => {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="action-email">{user?.login_id ?? ''}</span>
      <button
        type="button"
        onClick={() => {
          void login('user@yoga.com', 'pw');
        }}
      >
        login
      </button>
      <button type="button" onClick={logout}>logout</button>
    </div>
  );
};

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

describe('AuthContext', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const memoryStorage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage,
      configurable: true,
    });
  });

  it('loads current user from token on bootstrap', async () => {
    localStorage.setItem('token', 'token');
    vi.mocked(authAPI.getCurrentUser).mockResolvedValueOnce({
      data: {
        user: { id: 1, login_id: 'user@yoga.com', role: 'customer' },
        customerInfo: { id: 7, name: '고객', phone: '010-0000-0000' },
      },
    } as never);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('email').textContent).toBe('user@yoga.com');
    expect(screen.getByTestId('customer').textContent).toBe('고객');
  });

  it('clears invalid token when bootstrap fails', async () => {
    localStorage.setItem('token', 'bad-token');
    vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(new Error('unauthorized'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByTestId('email').textContent).toBe('');
  });

  it('supports login and logout actions', async () => {
    vi.mocked(authAPI.getCurrentUser).mockResolvedValueOnce({
      data: { user: null, customerInfo: null },
    } as never);
    vi.mocked(authAPI.login).mockResolvedValueOnce({
      data: {
        token: 'new-token',
        user: { id: 2, login_id: 'member@yoga.com', role: 'customer' },
        customerInfo: { id: 9, name: '회원', phone: '010-1111-2222' },
      },
    } as never);

    render(
      <AuthProvider>
        <ActionProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('action-email').textContent).toBe(''));

    screen.getByText('login').click();
    await waitFor(() => expect(screen.getByTestId('action-email').textContent).toBe('member@yoga.com'));
    expect(localStorage.getItem('token')).toBe('new-token');

    screen.getByText('logout').click();
    await waitFor(() => expect(screen.getByTestId('action-email').textContent).toBe(''));
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('throws when useAuth is used outside provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalidRender = () => {
      const InvalidConsumer = () => {
        useAuth();
        return <div>invalid</div>;
      };
      render(<InvalidConsumer />);
    };

    expect(invalidRender).toThrow('useAuth must be used within an AuthProvider');
    consoleErrorSpy.mockRestore();
  });
});
