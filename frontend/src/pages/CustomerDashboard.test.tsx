import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerDashboard from './CustomerDashboard';

const { attendanceGetAllMock, classGetMyRegistrationsMock } = vi.hoisted(() => ({
  attendanceGetAllMock: vi.fn(),
  classGetMyRegistrationsMock: vi.fn(),
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
  attendanceAPI: {
    getAll: attendanceGetAllMock,
  },
  classAPI: {
    getMyRegistrations: classGetMyRegistrationsMock,
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
    expect(attendanceGetAllMock).not.toHaveBeenCalled();
  });

  it('renders empty state when no attendances', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('다음 수업')).toBeTruthy());
    expect(screen.getByText('예정된 수업이 없습니다')).toBeTruthy();
    expect(screen.getByText('지난 수업')).toBeTruthy();
    expect(screen.getByText('출석 기록이 없습니다')).toBeTruthy();
    expect(attendanceGetAllMock).toHaveBeenCalledWith({ customer_id: 1, limit: 20 });
    expect(classGetMyRegistrationsMock).toHaveBeenCalled();
  });

  it('renders attendance details', async () => {
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
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [],
    });

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('빈야사')).toBeTruthy());
    expect(screen.getByText('💬 호흡이 안정적입니다.')).toBeTruthy();
  });

  it('prefers class title/date info when class_type is missing', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          attendance_date: '2026-02-01T10:00:00Z',
          class_type: null,
          class_title: '아쉬탕가',
          class_date: '2026-02-01',
          class_start_time: '09:00:00',
        },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [],
    });

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('아쉬탕가 · 2026-02-01 09:00')).toBeTruthy());
  });

  it('renders upcoming classes from my registrations', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 10,
          class_id: 5,
          title: '빈야사 기초',
          class_date: '2099-12-30',
          start_time: '09:00:00',
          end_time: '10:00:00',
          is_open: true,
          is_excluded: false,
          instructor_name: '강사A',
        },
      ],
    });

    render(<CustomerDashboard />);

    await waitFor(() => expect(screen.getByText('빈야사 기초')).toBeTruthy());
    expect(screen.getByText('2099-12-30 09:00 - 10:00')).toBeTruthy();
    expect(screen.getByText('강사: 강사A')).toBeTruthy();
  });
});
