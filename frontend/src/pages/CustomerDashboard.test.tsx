import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerDashboard from './CustomerDashboard';

const { membershipGetByCustomerMock, attendanceGetAllMock } = vi.hoisted(() => ({
  membershipGetByCustomerMock: vi.fn(),
  attendanceGetAllMock: vi.fn(),
}));

let customerInfoState: { id: number; name: string; phone: string } | null = {
  id: 1,
  name: '홍길동',
  phone: '010-0000-0000',
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    customerInfo: customerInfoState,
  }),
}));

vi.mock('../services/api', () => ({
  membershipAPI: {
    getByCustomer: membershipGetByCustomerMock,
  },
  attendanceAPI: {
    getAll: attendanceGetAllMock,
  },
}));

describe('CustomerDashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerInfoState = { id: 1, name: '홍길동', phone: '010-0000-0000' };
  });

  afterEach(() => {
    cleanup();
  });

  it('stays in loading state when customer info is missing', () => {
    customerInfoState = null;
    render(<CustomerDashboard />);
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect(membershipGetByCustomerMock).not.toHaveBeenCalled();
    expect(attendanceGetAllMock).not.toHaveBeenCalled();
  });

  it('renders empty states when no active memberships and no attendances', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [{ id: 2, membership_type_name: '10회권', start_date: '2026-01-01', is_active: false }],
    });
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('안녕하세요, 홍길동님')).toBeTruthy());
    expect(screen.getByText('활성화된 회원권이 없습니다')).toBeTruthy();
    expect(screen.getByText('출석 기록이 없습니다')).toBeTruthy();
    expect(membershipGetByCustomerMock).toHaveBeenCalledWith(1);
    expect(attendanceGetAllMock).toHaveBeenCalledWith({ customer_id: 1, limit: 10 });
  });

  it('renders active membership and attendance details', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          membership_type_name: '프리패스',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          remaining_sessions: 5,
          is_active: true,
        },
      ],
    });
    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          attendance_date: '2026-02-01T10:00:00Z',
          class_type: '빈야사',
          instructor_comment: '호흡이 안정적입니다.',
        },
      ],
    });

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('프리패스')).toBeTruthy());
    expect(screen.getByText('5회')).toBeTruthy();
    expect(screen.getByText('빈야사')).toBeTruthy();
    expect(screen.getByText('💬 호흡이 안정적입니다.')).toBeTruthy();
  });

  it('handles API failure and still exits loading state', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    membershipGetByCustomerMock.mockRejectedValueOnce(new Error('failed'));
    attendanceGetAllMock.mockRejectedValueOnce(new Error('failed'));

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('안녕하세요, 홍길동님')).toBeTruthy());
    expect(screen.getByText('활성화된 회원권이 없습니다')).toBeTruthy();
    expect(screen.getByText('출석 기록이 없습니다')).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
