import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerMemberships from './CustomerMemberships';

const {
  membershipGetByCustomerMock,
  attendanceGetAllMock,
  classGetMyRegistrationsMock,
  navigateMock,
} = vi.hoisted(() => ({
  membershipGetByCustomerMock: vi.fn(),
  attendanceGetAllMock: vi.fn(),
  classGetMyRegistrationsMock: vi.fn(),
  navigateMock: vi.fn(),
}));

let customerInfoState: { id: number; name: string; phone: string } | null = {
  id: 1,
  name: '홍길동',
  phone: '010-0000-0000',
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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
  classAPI: {
    getMyRegistrations: classGetMyRegistrationsMock,
  },
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerMemberships />
  </MemoryRouter>
);

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

describe('CustomerMemberships page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerInfoState = { id: 1, name: '홍길동', phone: '010-0000-0000' };
    membershipGetByCustomerMock.mockResolvedValue({ data: [] });
    attendanceGetAllMock.mockResolvedValue({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('stays loading when customer info is missing', () => {
    customerInfoState = null;
    renderPage();
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect(membershipGetByCustomerMock).not.toHaveBeenCalled();
  });

  it('renders empty state when no active memberships and no calendar entries', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('회원권')).toBeTruthy());
    expect(screen.getByText('활성화된 회원권이 없습니다')).toBeTruthy();
    expect(screen.getByText('수업 캘린더')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    expect(screen.getByText('해당 날짜에 등록된 수업이 없습니다.')).toBeTruthy();
  });

  it('renders active membership info including unlimited sessions', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          membership_type_name: '프리패스',
          remaining_sessions: null,
          is_active: true,
          start_date: '2026-02-01',
          expected_end_date: null,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('프리패스')).toBeTruthy());
    expect(screen.getByText('무제한')).toBeTruthy();
    expect(screen.getByText('2026년 2월 1일')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('renders expected end date when provided', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          membership_type_name: '10회권',
          remaining_sessions: 3,
          is_active: true,
          start_date: '2026-02-01',
          expected_end_date: '2026-04-01',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('10회권')).toBeTruthy());
    expect(screen.getByText('2026년 4월 1일')).toBeTruthy();
  });

  it('renders dash when membership start date is missing', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 3,
          membership_type_name: '6회권',
          remaining_sessions: 2,
          is_active: true,
          start_date: null,
          expected_end_date: '2026-05-01',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('6회권')).toBeTruthy());
    expect(screen.getByText('2026년 5월 1일')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('supports month/week/day calendar branches and navigation', async () => {
    const now = new Date();
    const today = formatDate(now);
    const past = formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const future = formatDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 101,
          class_id: null,
          attendance_date: `${today}T10:30:00`,
          class_title: '완료 수업',
          class_date: today,
          class_start_time: '10:00:00',
          class_end_time: '11:00:00',
        },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 201,
          class_id: 9,
          attendance_status: 'reserved',
          title: '예약 수업',
          class_date: future,
          start_time: '18:00:00',
          end_time: '19:00:00',
        },
        {
          registration_id: 202,
          class_id: 10,
          attendance_status: 'reserved',
          title: '유예 지난 수업',
          class_date: past,
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
        {
          registration_id: 203,
          class_id: 11,
          attendance_status: 'absent',
          title: '결석 수업',
          class_date: today,
          start_time: '07:00:00',
          end_time: '08:00:00',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    expect(screen.getAllByText('출석').length).toBeGreaterThan(0);
    expect(screen.getAllByText('결석').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '주간' }));
    await waitFor(() => expect(screen.getByText(/ - /)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));

    const emptyWeekCell = screen.getAllByRole('button').find((button) => button.textContent?.includes('수업 없음'));
    if (emptyWeekCell) {
      fireEvent.click(emptyWeekCell);
    }

    await waitFor(() => expect(screen.getByRole('button', { name: '일간' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '일간' }));

    expect(screen.getByText('해당 날짜에 등록된 수업이 없습니다.')).toBeTruthy();
  });

  it('navigates to class detail from day view and keeps null-class entry disabled', async () => {
    const today = formatDate(new Date());

    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 300,
          class_id: null,
          attendance_date: `${today}T11:00:00`,
          class_title: '기록만 있는 수업',
          class_date: today,
          class_start_time: '11:00:00',
        },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 400,
          class_id: 77,
          attendance_status: 'reserved',
          title: '이동 대상 수업',
          class_date: today,
          start_time: '12:00:00',
          end_time: '13:00:00',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '일간' }));

    await waitFor(() => expect(screen.getAllByText('이동 대상 수업').length).toBeGreaterThan(0));

    const disabledBtn = screen.getByRole('button', { name: /기록만 있는 수업/ });
    expect(disabledBtn).toHaveProperty('disabled', true);

    const targetButtons = screen.getAllByRole('button', { name: /이동 대상 수업/ });
    const enabledTargetButton = targetButtons.find((button) => !(button as HTMLButtonElement).disabled);
    expect(enabledTargetButton).toBeTruthy();
    fireEvent.click(enabledTargetButton as HTMLButtonElement);
    expect(navigateMock).toHaveBeenCalledWith('/classes/77');
  });

  it('renders attendance fallback title/date and missing time branch safely', async () => {
    const today = formatDate(new Date());
    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 501,
          class_id: null,
          attendance_date: `${today}T08:00:00`,
          class_title: null,
          class_type: null,
          class_date: null,
          class_start_time: null,
          class_end_time: null,
        },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 601,
          class_id: 88,
          attendance_status: 'reserved',
          title: '시간 미입력 수업',
          class_date: today,
          start_time: null,
          end_time: null,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getByText('수업 기록')).toBeTruthy());
    expect(screen.getByText('시간 미입력 수업')).toBeTruthy();
  });

  it('handles membership/calendar load failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    membershipGetByCustomerMock.mockRejectedValueOnce(new Error('failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('활성화된 회원권이 없습니다')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('covers calendar merge and navigation edge branches', async () => {
    const today = formatDate(new Date());
    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        { id: 1, class_id: null, attendance_date: `${today}T06:00:00`, class_title: '출석 단독', class_date: today, class_start_time: '06:00:00' },
        { id: 2, class_id: 500, attendance_date: `${today}T07:00:00`, class_title: '출석 우선', class_date: today, class_start_time: '07:00:00' },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        { registration_id: 1, class_id: null, attendance_status: 'reserved', title: '등록 단독', class_date: today, start_time: '05:00:00', end_time: '05:30:00' },
        { registration_id: 2, class_id: 500, attendance_status: 'reserved', title: '등록 덮임', class_date: today, start_time: '07:00:00', end_time: '08:00:00' },
        { registration_id: 3, class_id: 600, attendance_status: 'reserved', title: '세번째 일정', class_date: today, start_time: '08:30:00', end_time: '09:00:00' },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/\+\d+개 더 있음/).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '이전' })); // month prev
    fireEvent.click(screen.getByRole('button', { name: '다음' })); // month next
    fireEvent.click(screen.getByRole('button', { name: '주간' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' })); // week prev
    fireEvent.click(screen.getByRole('button', { name: '다음' })); // week next
    fireEvent.click(screen.getByRole('button', { name: '월간' }));

    const monthDayCell = screen.getAllByRole('button').find((btn) => btn.className.includes('min-h-[58px]'));
    if (monthDayCell) {
      fireEvent.click(monthDayCell); // set day from month cell click
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '일간' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '이전' })); // day prev
    fireEvent.click(screen.getByRole('button', { name: '다음' })); // day next

    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    await waitFor(() => expect(screen.getByText('출석 우선')).toBeTruthy()); // attendance overrides registration
    expect(screen.getByText('등록 단독')).toBeTruthy();
    expect(screen.getByText('출석 단독')).toBeTruthy();
  });
});
