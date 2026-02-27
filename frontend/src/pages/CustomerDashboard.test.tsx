import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerDashboard from './CustomerDashboard';

const {
  attendanceGetAllMock,
  classGetMyRegistrationsMock,
  updateMyRegistrationCommentMock,
  navigateMock,
} = vi.hoisted(() => ({
  attendanceGetAllMock: vi.fn(),
  classGetMyRegistrationsMock: vi.fn(),
  updateMyRegistrationCommentMock: vi.fn(),
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
  attendanceAPI: {
    getAll: attendanceGetAllMock,
  },
  classAPI: {
    getMyRegistrations: classGetMyRegistrationsMock,
    updateMyRegistrationComment: updateMyRegistrationCommentMock,
  },
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerDashboard />
  </MemoryRouter>
);

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

describe('CustomerDashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerInfoState = { id: 1, name: '홍길동', phone: '010-0000-0000' };
    updateMyRegistrationCommentMock.mockResolvedValue({});
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

    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));
    expect(screen.getByText('예정된 수업이 없습니다')).toBeTruthy();
    expect(screen.getByText('수업 캘린더')).toBeTruthy();
    expect(attendanceGetAllMock).toHaveBeenCalledWith({ customer_id: 1, limit: 20 });
    expect(classGetMyRegistrationsMock).toHaveBeenCalled();
  });

  it('renders only nearest upcoming class and hydrates saved comments', async () => {
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
          registration_comment: '월경 중입니다\n어깨가 뻐근해요',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('가장 가까운 수업')).toBeTruthy());
    expect(screen.queryByText('먼 미래 수업')).toBeNull();
    expect(screen.getByText('월경 중입니다')).toBeTruthy();
    expect(screen.getByText('어깨가 뻐근해요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '초기화' })).toBeTruthy();
  });

  it('saves quick comments, custom comment chip, and reset', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenCalledWith(6, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByPlaceholderText(/강사에게 전달할 컨디션/), {
      target: { value: '허리가 뻐근합니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '코멘트 저장' }));

    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, '월경 중입니다\n허리가 뻐근합니다'));
    expect(screen.getByText('허리가 뻐근합니다')).toBeTruthy();

    fireEvent.click(screen.getByTitle('클릭하면 해당 직접 입력 코멘트 선택이 해제됩니다.'));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, ''));
  });

  it('renders month/week/day calendar branches and supports navigation', async () => {
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
          is_open: true,
        },
        {
          registration_id: 202,
          class_id: 10,
          attendance_status: 'reserved',
          title: '유예 지난 수업',
          class_date: past,
          start_time: '09:00:00',
          end_time: '10:00:00',
          is_open: true,
        },
        {
          registration_id: 203,
          class_id: 11,
          attendance_status: 'absent',
          title: '결석 수업',
          class_date: today,
          start_time: '07:00:00',
          end_time: '08:00:00',
          is_open: true,
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
          is_open: true,
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

  it('handles API failure and comment save failure without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    attendanceGetAllMock.mockRejectedValueOnce(new Error('load fail'));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('예정된 수업이 없습니다')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();

    cleanup();
    attendanceGetAllMock.mockResolvedValueOnce({ data: [] });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });
    updateMyRegistrationCommentMock.mockRejectedValueOnce(new Error('save fail'));

    renderPage();

    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));

    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenCalled());
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
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
          is_open: true,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '일간' }));
    await waitFor(() => expect(screen.getByText('수업 기록')).toBeTruthy());
    expect(screen.getByText('시간 미입력 수업')).toBeTruthy();
  });

  it('handles class-less registration entry and quick toggle-off branch', async () => {
    const today = formatDate(new Date());
    attendanceGetAllMock.mockResolvedValueOnce({
      data: [],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: null,
          attendance_status: 'reserved',
          title: '클래스 아이디 없음',
          class_date: today,
          start_time: '09:00:00',
          end_time: '10:00:00',
          is_open: true,
        },
        {
          registration_id: 12,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenCalledWith(6, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, ''));
  });

  it('handles direct comment save with empty input and month/day prev-next branches', async () => {
    const today = formatDate(new Date());
    attendanceGetAllMock.mockResolvedValueOnce({
      data: [
        { id: 1, class_id: 1, attendance_date: `${today}T07:00:00`, class_title: '완료1', class_date: today, class_start_time: '07:00:00' },
        { id: 2, class_id: 2, attendance_date: `${today}T08:00:00`, class_title: '완료2', class_date: today, class_start_time: '08:00:00' },
        { id: 3, class_id: 3, attendance_date: `${today}T09:00:00`, class_title: '완료3', class_date: today, class_start_time: '09:00:00' },
      ],
    });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 12,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 캘린더')).toBeTruthy());
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.click(screen.getByRole('button', { name: '코멘트 저장' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenCalledWith(6, ''));

    const dayFromMonth = screen.getAllByRole('button').find((btn) => btn.className.includes('min-h-[58px]'));
    if (dayFromMonth) {
      fireEvent.click(dayFromMonth);
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '일간' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
  });
});
