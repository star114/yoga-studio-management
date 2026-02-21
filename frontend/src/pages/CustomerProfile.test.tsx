import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerProfile from './CustomerProfile';

const { changePasswordMock, parseApiErrorMock } = vi.hoisted(() => ({
  changePasswordMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '변경 실패 메시지'),
}));

let authState: {
  user: { id: number; email: string; role: 'admin' | 'customer' } | null;
  customerInfo: { id: number; name: string; phone: string } | null;
} = {
  user: { id: 1, email: 'user@yoga.com', role: 'customer' },
  customerInfo: { id: 1, name: '홍길동', phone: '010-0000-0000' },
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../services/api', () => ({
  authAPI: {
    changePassword: changePasswordMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div>Navigate:{to}</div>,
  };
});

describe('CustomerProfile page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = {
      user: { id: 1, email: 'user@yoga.com', role: 'customer' },
      customerInfo: { id: 1, name: '홍길동', phone: '010-0000-0000' },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects when user is not customer', () => {
    authState = {
      user: { id: 9, email: 'admin@yoga.com', role: 'admin' },
      customerInfo: null,
    };
    render(<CustomerProfile />);
    expect(screen.getByText('Navigate:/')).toBeTruthy();
  });

  it('renders fallback profile values when customer info is missing', () => {
    authState = {
      user: { id: 1, email: 'user@yoga.com', role: 'customer' },
      customerInfo: null,
    };
    render(<CustomerProfile />);
    expect(screen.getByText('이름:')).toBeTruthy();
    expect(screen.getByText('전화번호:')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('shows validation error for too-short new password', async () => {
    render(<CustomerProfile />);
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => expect(screen.getByText('새 비밀번호는 6자 이상이어야 합니다.')).toBeTruthy());
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('shows validation error for mismatch passwords', async () => {
    render(<CustomerProfile />);
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => expect(screen.getByText('새 비밀번호 확인이 일치하지 않습니다.')).toBeTruthy());
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('changes password successfully', async () => {
    changePasswordMock.mockResolvedValueOnce(undefined);
    render(<CustomerProfile />);

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'new-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => expect(changePasswordMock).toHaveBeenCalledWith('old-pass', 'new-pass-123'));
    expect(screen.getByText('비밀번호를 변경했습니다.')).toBeTruthy();
  });

  it('shows parsed error message when change password fails', async () => {
    changePasswordMock.mockRejectedValueOnce(new Error('failed'));
    render(<CustomerProfile />);

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'new-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => expect(screen.getByText('변경 실패 메시지')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
  });
});
