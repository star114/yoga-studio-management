import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const navigateMock = vi.fn();
const loginMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: vi.fn(() => '로그인 실패 메시지'),
}));

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('logs in and navigates to root on success', async () => {
    loginMock.mockResolvedValueOnce(undefined);
    render(<Login />);

    fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('admin', 'password'));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows parsed error message on login failure', async () => {
    loginMock.mockRejectedValueOnce(new Error('failed'));
    render(<Login />);

    fireEvent.change(screen.getByLabelText('아이디'), { target: { value: '01012341234' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(screen.getByText('로그인 실패 메시지')).toBeTruthy());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
