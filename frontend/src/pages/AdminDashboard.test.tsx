import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

const {
  customerGetAllMock,
  attendanceGetTodayMock,
  classGetAllMock,
  classGetAdminDashboardSnapshotMock,
} = vi.hoisted(() => ({
  customerGetAllMock: vi.fn(),
  attendanceGetTodayMock: vi.fn(),
  classGetAllMock: vi.fn(),
  classGetAdminDashboardSnapshotMock: vi.fn(),
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
    getAdminDashboardSnapshot: classGetAdminDashboardSnapshotMock,
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
          max_capacity: 10,
          current_enrollment: 4,
          is_open: true,
          class_status: 'open',
        },
        {
          id: 2,
          title: '완료수업',
          class_date: todayDate,
          start_time: '11:00:00',
          end_time: '12:00:00',
          max_capacity: 10,
          current_enrollment: 10,
          is_open: false,
          class_status: 'completed',
        },
        {
          id: 3,
          title: '진행오늘',
          class_date: todayDate,
          start_time: '13:00:00',
          end_time: '14:00:00',
          max_capacity: 8,
          current_enrollment: 6,
          is_open: true,
          class_status: 'in_progress',
        },
        {
          id: 4,
          title: '마감수업',
          class_date: todayDate,
          start_time: '15:00:00',
          end_time: '16:00:00',
          max_capacity: 8,
          current_enrollment: 8,
          is_open: false,
          class_status: 'open',
        },
        {
          id: 5,
          title: '닫힘수업',
          class_date: todayDate,
          start_time: '16:00:00',
          end_time: '17:00:00',
          is_open: false,
          class_status: 'closed',
        },
        {
          id: 6,
          title: '진행수업',
          class_date: tomorrowDate,
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 8,
          current_enrollment: 6,
          is_open: true,
          class_status: 'in_progress',
        },
        {
          id: 7,
          title: '기본상태수업',
          class_date: todayDate,
          start_time: '17:00:00',
          end_time: '18:00:00',
          max_capacity: 12,
          current_enrollment: 1,
          is_open: true,
        },
      ],
    });
    classGetAdminDashboardSnapshotMock.mockResolvedValue({
      data: {
        basis: 'today',
        target_date: todayDate,
        classes: [
          {
            id: 1,
            title: '오전요가',
            class_date: todayDate,
            start_time: '09:00:00',
            end_time: '10:00:00',
            max_capacity: 10,
            current_enrollment: 2,
            is_open: true,
            class_status: 'open',
            registrations: [
              {
                id: 101,
                class_id: 1,
                customer_id: 1,
                customer_name: '홍길동',
                customer_phone: '010-1111-2222',
                attendance_status: 'reserved',
                registration_comment: '허리가 조금 뻐근해요\n어깨도 뻐근해요',
                registered_at: '2026-03-05T08:00:00.000Z',
              },
              {
                id: 102,
                class_id: 1,
                customer_id: 2,
                customer_name: '김영희',
                customer_phone: '010-2222-3333',
                attendance_status: 'attended',
                registration_comment: '호흡 천천히 진행하고 싶어요',
                registered_at: '2026-03-05T08:10:00.000Z',
              },
              {
                id: 104,
                class_id: 1,
                customer_id: 4,
                customer_name: '이결석',
                customer_phone: '010-4444-5555',
                attendance_status: 'absent',
                registration_comment: '몸 상태 체크 부탁드려요',
                registered_at: '2026-03-05T08:30:00.000Z',
              },
            ],
          },
          {
            id: 8,
            title: '저녁요가',
            class_date: todayDate,
            start_time: '18:00:00',
            end_time: '19:00:00',
            max_capacity: 10,
            current_enrollment: 1,
            is_open: true,
            class_status: 'open',
            registrations: [
              {
                id: 103,
                class_id: 8,
                customer_id: 3,
                customer_name: '박지수',
                customer_phone: '010-3333-4444',
                attendance_status: 'reserved',
                registration_comment: null,
                registered_at: '2026-03-05T08:20:00.000Z',
              },
            ],
          },
          {
            id: 9,
            title: '기록없음수업',
            class_date: todayDate,
            start_time: '20:00:00',
            end_time: '21:00:00',
            is_open: true,
            class_status: 'open',
            registrations: [
              {
                id: 105,
                class_id: 9,
                customer_id: 5,
                customer_name: '최메모',
                customer_phone: '010-5555-6666',
                attendance_status: 'reserved',
                registration_comment: '조용한 수련 원해요',
                registered_at: '2026-03-05T08:40:00.000Z',
              },
            ],
          },
        ],
      },
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
    expect(screen.getByText('오늘 수업 전체')).toBeTruthy();
    expect(screen.getByText('허리가 조금 뻐근해요')).toBeTruthy();
    expect(screen.getByText('어깨도 뻐근해요')).toBeTruthy();
    expect(screen.getByText('출석')).toBeTruthy();
    expect(screen.getByText('호흡 천천히 진행하고 싶어요')).toBeTruthy();
    expect(screen.getByText('결석')).toBeTruthy();
    expect(screen.getByText('몸 상태 체크 부탁드려요')).toBeTruthy();
    const snapshotSection = screen.getByText('오늘 수업 전체').closest('section') as HTMLElement;
    expect(within(snapshotSection).getByText('김영희')).toBeTruthy();
    expect(screen.getByText('저녁요가')).toBeTruthy();
    expect(screen.getByText('조용한 수련 원해요')).toBeTruthy();
    expect(screen.getByText('남긴 코멘트가 없습니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /김영희/ }));

  });

  it('supports calendar month/week/day navigation', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());

    expect(screen.getByText('월간')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getAllByText('오전요가')[0].closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '주간' }));
    await waitFor(() => expect(screen.getAllByText('수업 없음').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getAllByText('마감').length).toBeGreaterThan(0);
    expect(screen.getByText('16:00 - 17:00')).toBeTruthy();
    fireEvent.click(screen.getAllByText('수업 없음')[0].closest('button') as HTMLButtonElement);

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getAllByText('접수중').length).toBeGreaterThan(0));
    expect(screen.getAllByText('완료').length).toBeGreaterThan(0);
    expect(screen.getAllByText('진행중').length).toBeGreaterThan(0);
    expect(screen.getAllByText('마감').length).toBeGreaterThan(0);
    expect(screen.getByText('기본상태수업')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));

    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
  });

  it('switches from month cell click to day view and covers class cards without enrollment text', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());

    const calendarSection = screen.getByText('수업 캘린더').closest('section') as HTMLElement;
    fireEvent.click(within(calendarSection).getAllByText('오전요가')[0].closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByRole('button', { name: /기록없음수업/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /기록없음수업/ }).textContent).not.toContain('신청:');
  });

  it('navigates to class detail when clicking day entry', async () => {
    const originalLocation = window.location;
    // @ts-expect-error test override
    delete window.location;
    // @ts-expect-error test override
    window.location = { href: '' };

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    const calendarSection = screen.getByText('수업 캘린더').closest('section') as HTMLElement;
    await waitFor(() => expect(within(calendarSection).getAllByText('오전요가').length).toBeGreaterThan(0));
    fireEvent.click(within(calendarSection).getByRole('button', { name: /오전요가/ }));

    expect(window.location.href).toContain('/classes/1');
    window.location = originalLocation;
  });

  it('shows empty states for day view, attendance, and customers', async () => {
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    attendanceGetTodayMock.mockResolvedValueOnce({ data: [] });
    classGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetAdminDashboardSnapshotMock.mockResolvedValueOnce({
      data: {
        basis: 'upcoming',
        target_date: null,
        classes: [],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('대시보드')).toBeTruthy());
    expect(screen.getByText('아직 출석한 회원이 없습니다')).toBeTruthy();
    expect(screen.getByText('등록된 회원이 없습니다')).toBeTruthy();
    expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getByText('해당 날짜에 등록된 수업이 없습니다.')).toBeTruthy());
  });

  it('renders upcoming badge when snapshot basis is upcoming', async () => {
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    attendanceGetTodayMock.mockResolvedValueOnce({ data: [] });
    classGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetAdminDashboardSnapshotMock.mockResolvedValueOnce({
      data: {
        basis: 'upcoming',
        target_date: '2026-03-20',
        classes: [],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('다가오는 수업')).toBeTruthy());
    expect(screen.getByText('가장 가까운 예정일')).toBeTruthy();
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
