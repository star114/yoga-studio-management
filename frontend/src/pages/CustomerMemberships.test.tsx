import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerMemberships from './CustomerMemberships';

const { membershipGetByCustomerMock } = vi.hoisted(() => ({
  membershipGetByCustomerMock: vi.fn(),
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
}));

describe('CustomerMemberships page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerInfoState = { id: 1, name: '홍길동', phone: '010-0000-0000' };
  });

  afterEach(() => {
    cleanup();
  });

  it('stays loading when customer info is missing', () => {
    customerInfoState = null;
    render(<CustomerMemberships />);
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect(membershipGetByCustomerMock).not.toHaveBeenCalled();
  });

  it('renders empty state when no active memberships', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [{ id: 2, membership_type_name: '10회권', is_active: false }],
    });

    render(<CustomerMemberships />);

    await waitFor(() => expect(screen.getByText('회원권')).toBeTruthy());
    expect(screen.getByText('활성화된 회원권이 없습니다')).toBeTruthy();
  });

  it('renders active membership info', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          membership_type_name: '프리패스',
          remaining_sessions: 5,
          is_active: true,
          start_date: '2026-02-01',
          expected_end_date: '2026-03-15',
        },
      ],
    });

    render(<CustomerMemberships />);

    await waitFor(() => expect(screen.getByText('프리패스')).toBeTruthy());
    expect(screen.getByText('5회')).toBeTruthy();
    expect(screen.getByText('2026년 2월 1일')).toBeTruthy();
    expect(screen.getByText('2026년 3월 15일')).toBeTruthy();
  });
});
