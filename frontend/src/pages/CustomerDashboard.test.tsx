import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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

const renderPage = () => render(
  <MemoryRouter>
    <CustomerDashboard />
  </MemoryRouter>
);

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
    renderPage();
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect(attendanceGetAllMock).not.toHaveBeenCalled();
  });

  it('renders empty state when no attendances', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('다음 수업')).toBeTruthy());
    expect(screen.getByText('예정된 수업이 없습니다')).toBeTruthy();
    expect(screen.getByText('수업 캘린더')).toBeTruthy();
    expect(attendanceGetAllMock).toHaveBeenCalledWith({ customer_id: 1, limit: 20 });
    expect(classGetMyRegistrationsMock).toHaveBeenCalled();
  });

  it('renders attendance data in calendar entries', async () => {
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

    renderPage();

    await waitFor(() => expect(screen.getAllByText('빈야사').length).toBeGreaterThan(0));
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

    renderPage();

    await waitFor(() => expect(screen.getAllByText('아쉬탕가').length).toBeGreaterThan(0));
  });

  it('renders only nearest upcoming class from my registrations', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 10,
          class_id: 5,
          attendance_status: 'reserved',
          title: '먼 미래 수업',
          class_date: '2099-12-30',
          start_time: '09:00:00',
          end_time: '10:00:00',
          is_open: true,
          is_excluded: false,
          instructor_name: '강사B',
        },
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '가장 가까운 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
          is_excluded: false,
          instructor_name: '강사A',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('가장 가까운 수업')).toBeTruthy());
    expect(screen.queryByText('먼 미래 수업')).toBeNull();
    expect(screen.getByText(/2099년 1월 1일/)).toBeTruthy();
    expect(screen.getByText(/08:00/)).toBeTruthy();
    expect(screen.getByText(/09:00/)).toBeTruthy();
  });

  it('shows attended entry only once when registration and attendance exist for same class', async () => {
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 101,
          class_id: 9,
          attendance_date: `${todayDate}T10:30:00`,
          class_title: '중복 테스트 수업',
          class_date: todayDate,
          class_start_time: '10:00:00',
        },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 201,
          class_id: 9,
          attendance_status: 'reserved',
          title: '중복 테스트 수업',
          class_date: todayDate,
          start_time: '10:00:00',
          end_time: '11:00:00',
          is_open: true,
          is_excluded: false,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getAllByText('중복 테스트 수업').length).toBeGreaterThan(0));
    expect(screen.getByText('완료')).toBeTruthy();
    expect(screen.queryByText('예정')).toBeNull();
  });
});
