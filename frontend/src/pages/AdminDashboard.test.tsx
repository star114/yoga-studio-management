import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

const {
  customerGetAllMock,
  attendanceGetTodayMock,
  classGetAllMock,
} = vi.hoisted(() => ({
  customerGetAllMock: vi.fn(),
  attendanceGetTodayMock: vi.fn(),
  classGetAllMock: vi.fn(),
}));

vi.mock('../services/api', () => ({
  customerAPI: {
    getAll: customerGetAllMock,
  },
  attendanceAPI: {
    getToday: attendanceGetTodayMock,
  },
  classAPI: {
    getAll: classGetAllMock,
  },
}));

const renderPage = () => render(
  <MemoryRouter>
    <AdminDashboard />
  </MemoryRouter>
);

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('AdminDashboard page', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const todayDate = formatDate(today);
    const tomorrowDate = formatDate(tomorrow);

    customerGetAllMock.mockResolvedValue({
      data: [
        { id: 1, name: '홍길동', phone: '010-1111-2222', membership_count: 2, total_attendance: 11 },
        { id: 2, name: '김영희', phone: '010-2222-3333', membership_count: 1, total_attendance: 4 },
      ],
    });
    attendanceGetTodayMock.mockResolvedValue({
      data: [
        { id: 1, customer_name: '홍길동', attendance_date: '2026-03-05T08:30:00.000Z', class_type: '빈야사' },
      ],
    });
    classGetAllMock.mockResolvedValue({
      data: [
        {
          id: 1,
          title: '오전요가',
          class_date: todayDate,
          start_time: '09:00:00',
          end_time: '10:00:00',
          instructor_name: '강사A',
          max_capacity: 10,
          current_enrollment: 4,
          is_open: true,
          is_excluded: false,
          class_status: 'open',
        },
        {
          id: 2,
          title: '완료수업',
          class_date: todayDate,
          start_time: '11:00:00',
          end_time: '12:00:00',
          instructor_name: '강사B',
          max_capacity: 10,
          current_enrollment: 10,
          is_open: false,
          is_excluded: false,
          class_status: 'completed',
        },
        {
          id: 3,
          title: '진행오늘',
          class_date: todayDate,
          start_time: '13:00:00',
          end_time: '14:00:00',
          instructor_name: '강사E',
          max_capacity: 8,
          current_enrollment: 6,
          is_open: true,
          is_excluded: false,
          class_status: 'in_progress',
        },
        {
          id: 4,
          title: '제외표시',
          class_date: todayDate,
          start_time: '14:00:00',
          end_time: '15:00:00',
          instructor_name: '강사F',
          max_capacity: 8,
          current_enrollment: 1,
          is_open: true,
          is_excluded: false,
          class_status: 'excluded',
        },
        {
          id: 5,
          title: '마감수업',
          class_date: todayDate,
          start_time: '15:00:00',
          end_time: '16:00:00',
          instructor_name: '강사G',
          max_capacity: 8,
          current_enrollment: 8,
          is_open: false,
          is_excluded: false,
          class_status: 'open',
        },
        {
          id: 6,
          title: '닫힘수업',
          class_date: todayDate,
          start_time: '16:00:00',
          end_time: '17:00:00',
          instructor_name: '강사H',
          is_open: false,
          is_excluded: false,
          class_status: 'closed',
        },
        {
          id: 7,
          title: '진행수업',
          class_date: tomorrowDate,
          start_time: '09:00:00',
          end_time: '10:00:00',
          instructor_name: '강사C',
          max_capacity: 8,
          current_enrollment: 6,
          is_open: true,
          is_excluded: false,
          class_status: 'in_progress',
        },
        {
          id: 8,
          title: '제외수업',
          class_date: tomorrowDate,
          start_time: '09:00:00',
          end_time: '10:00:00',
          instructor_name: '강사D',
          max_capacity: 8,
          current_enrollment: 1,
          is_open: true,
          is_excluded: true,
          class_status: 'excluded',
        },
        {
          id: 9,
          title: '기본상태수업',
          class_date: todayDate,
          start_time: '17:00:00',
          end_time: '18:00:00',
          max_capacity: 12,
          current_enrollment: 1,
          is_open: true,
          is_excluded: false,
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading and then dashboard data', async () => {
    renderPage();

    expect(screen.getByText('로딩 중...')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('대시보드')).toBeTruthy());
    expect(screen.getByText('전체 회원')).toBeTruthy();
    expect(screen.getAllByText('오늘 출석').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('홍길동').length).toBeGreaterThan(0);
    expect(screen.getByText('빈야사')).toBeTruthy();
    expect(screen.getByText('회원권 2개')).toBeTruthy();
    expect(screen.getByText(/\+\d+개 더 있음/)).toBeTruthy();

    expect(screen.queryByText('제외수업')).toBeNull();
  });

  it('supports calendar month/week/day navigation', async () => {
    const todayDate = formatDate(new Date());
    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());

    expect(screen.getByText('월간')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByText('오전요가').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '주간' }));
    await waitFor(() => expect(screen.getAllByText('수업 없음').length).toBeGreaterThan(0));
    expect(screen.getAllByText('닫힘').length).toBeGreaterThan(0);
    expect(screen.getByText('16:00 - 17:00')).toBeTruthy();
    fireEvent.click(screen.getAllByText('수업 없음')[0].closest('button') as HTMLButtonElement);

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    await waitFor(() => expect(screen.getByText(new RegExp(todayDate))).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getAllByText('접수중').length).toBeGreaterThan(0));
    expect(screen.getByText('완료')).toBeTruthy();
    expect(screen.getByText('진행중')).toBeTruthy();
    expect(screen.getByText('제외')).toBeTruthy();
    expect(screen.getAllByText('마감').length).toBeGreaterThan(0);
    expect(screen.getByText('기본상태수업')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));

    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(screen.getByText(/기준일:/)).toBeTruthy();
  });

  it('shows empty states for day view, attendance, and customers', async () => {
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    attendanceGetTodayMock.mockResolvedValueOnce({ data: [] });
    classGetAllMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('대시보드')).toBeTruthy());
    expect(screen.getByText('아직 출석한 회원이 없습니다')).toBeTruthy();
    expect(screen.getByText('등록된 회원이 없습니다')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getByText('해당 날짜에 등록된 수업이 없습니다.')).toBeTruthy());
  });

  it('handles API load failure and exits loading state', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    customerGetAllMock.mockRejectedValueOnce(new Error('failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('대시보드')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);

    consoleSpy.mockRestore();
  });
});
