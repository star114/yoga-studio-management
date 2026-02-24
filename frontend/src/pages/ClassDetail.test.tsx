import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ClassDetail from './ClassDetail';

const {
  classGetByIdMock,
  classGetRegistrationsMock,
  classRegisterMock,
  classUpdateMock,
  classCancelRegistrationMock,
  classUpdateRegistrationStatusMock,
  attendanceCheckInMock,
  attendanceUpdateMock,
  customerGetAllMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  classGetByIdMock: vi.fn(),
  classGetRegistrationsMock: vi.fn(),
  classRegisterMock: vi.fn(),
  classUpdateMock: vi.fn(),
  classCancelRegistrationMock: vi.fn(),
  classUpdateRegistrationStatusMock: vi.fn(),
  attendanceCheckInMock: vi.fn(),
  attendanceUpdateMock: vi.fn(),
  customerGetAllMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
}));

const navigateMock = vi.fn();
let routeId = '1';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: routeId }),
    useNavigate: () => navigateMock,
  };
});

vi.mock('../services/api', () => ({
  classAPI: {
    getById: classGetByIdMock,
    getRegistrations: classGetRegistrationsMock,
    register: classRegisterMock,
    update: classUpdateMock,
    cancelRegistration: classCancelRegistrationMock,
    updateRegistrationStatus: classUpdateRegistrationStatusMock,
  },
  customerAPI: {
    getAll: customerGetAllMock,
  },
  attendanceAPI: {
    checkIn: attendanceCheckInMock,
    update: attendanceUpdateMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

const renderPage = () => render(
  <MemoryRouter>
    <ClassDetail />
  </MemoryRouter>
);

const seedLoad = (overrides?: Record<string, unknown>) => {
  classGetByIdMock.mockResolvedValue({
    data: {
      id: 1,
      title: '빈야사',
      class_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      max_capacity: 10,
      is_open: true,
      class_status: 'open',
      current_enrollment: 1,
      remaining_seats: 9,
      ...overrides,
    },
  });
  classGetRegistrationsMock.mockResolvedValue({
    data: [
      {
        id: 1,
        class_id: 1,
        customer_id: 101,
        registered_at: '2026-03-01T01:00:00.000Z',
        registration_comment: '기존 코멘트',
        attendance_id: 9001,
        attendance_instructor_comment: '기존 강사 코멘트',
        customer_name: '홍길동',
        customer_phone: '010-1111-2222',
      },
    ],
  });
  customerGetAllMock.mockResolvedValue({
    data: [
      { id: 101, name: '홍길동', phone: '010-1111-2222' },
      { id: 102, name: '김영희', phone: '010-2222-3333' },
    ],
  });
};

describe('ClassDetail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    routeId = '1';
    seedLoad();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows invalid route error for bad class id', async () => {
    routeId = 'abc';
    renderPage();

    await waitFor(() => expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy());
    expect(classGetByIdMock).not.toHaveBeenCalled();
  });

  it('shows load error from API', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetByIdMock.mockRejectedValueOnce(new Error('load failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows missing class fallback and navigates back', async () => {
    classGetByIdMock.mockResolvedValueOnce({ data: null });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수업 관리로 돌아가기' }));
    expect(navigateMock).toHaveBeenCalledWith('/classes');
  });

  it('renders class detail and unregistered customer options', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('수업 상세')).toBeTruthy());
    expect(screen.getByText('상태: 오픈')).toBeTruthy();
    expect(screen.getByText('홍길동')).toBeTruthy();
    expect(screen.getByRole('option', { name: '김영희 (010-2222-3333)' })).toBeTruthy();
  });

  it('updates class basic info from detail page', async () => {
    classUpdateMock.mockResolvedValueOnce(undefined);
    classGetByIdMock
      .mockResolvedValueOnce({
        data: {
          id: 1,
          title: '빈야사',
          class_date: '2026-03-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: true,
          class_status: 'open',
          current_enrollment: 1,
          remaining_seats: 9,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 1,
          title: '수정 빈야사',
          class_date: '2026-03-02',
          start_time: '09:30:00',
          end_time: '10:30:00',
          max_capacity: 8,
          is_open: false,
          class_status: 'open',
          current_enrollment: 1,
          remaining_seats: 7,
        },
      });
    classGetRegistrationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본정보 수정' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '기본정보 수정' }));
    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '수정 빈야사' } });
    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-03-02' } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByLabelText('제한 인원'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('오픈 상태'));
    fireEvent.click(screen.getByRole('button', { name: '기본정보 저장' }));

    await waitFor(() => expect(classUpdateMock).toHaveBeenCalledWith(1, expect.objectContaining({
      title: '수정 빈야사',
      class_date: '2026-03-02',
      start_time: '09:30',
      end_time: '10:30',
      max_capacity: 8,
      is_open: false,
    })));
    await waitFor(() => expect(screen.getByText('수업 기본정보를 수정했습니다.')).toBeTruthy());
  });

  it('shows validation error when class basic info is invalid', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본정보 수정' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '기본정보 수정' }));
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '기본정보 저장' }));

    await waitFor(() => expect(screen.getByText('종료 시간은 시작 시간보다 늦어야 합니다.')).toBeTruthy());
    expect(classUpdateMock).not.toHaveBeenCalled();
  });

  it('shows all status labels', async () => {
    classGetRegistrationsMock.mockResolvedValue({ data: [] });

    classGetByIdMock.mockResolvedValueOnce({ data: { id: 1, title: 'A', class_date: '2026-03-01', start_time: '09:00:00', end_time: '10:00:00', max_capacity: 10, is_open: true, class_status: 'completed' } });
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('상태: 완료')).toBeTruthy());

    cleanup();
    classGetByIdMock.mockResolvedValueOnce({ data: { id: 1, title: 'A', class_date: '2026-03-01', start_time: '09:00:00', end_time: '10:00:00', max_capacity: 10, is_open: true, class_status: 'in_progress' } });
    classGetRegistrationsMock.mockResolvedValueOnce({ data: [] });
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('상태: 진행중')).toBeTruthy());

    cleanup();
    classGetByIdMock.mockResolvedValueOnce({ data: { id: 1, title: 'A', class_date: '2026-03-01', start_time: '09:00:00', end_time: '10:00:00', max_capacity: 10, is_open: true, class_status: 'closed' } });
    classGetRegistrationsMock.mockResolvedValueOnce({ data: [] });
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('상태: 닫힘')).toBeTruthy());

  });

  it('shows error when manual register is submitted without customer', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '수동 신청 등록' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(screen.getByText('신청할 고객을 선택하세요.')).toBeTruthy());
    expect(classRegisterMock).not.toHaveBeenCalled();
  });

  it('registers customer manually and refreshes state', async () => {
    classRegisterMock.mockResolvedValueOnce(undefined);
    classGetByIdMock.mockResolvedValue({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        max_capacity: 10,
        is_open: true,
        class_status: 'open',
        current_enrollment: 2,
      },
    });
    classGetRegistrationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            class_id: 1,
            customer_id: 102,
            registered_at: '2026-03-01T02:00:00.000Z',
            registration_comment: '',
            customer_name: '김영희',
            customer_phone: '010-2222-3333',
          },
        ],
      });

    renderPage();

    await waitFor(() => expect(screen.getByRole('option', { name: '김영희 (010-2222-3333)' })).toBeTruthy());
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledWith(1, { customer_id: 102 }));
    await waitFor(() => expect(screen.getByText('수동 신청이 등록되었습니다.')).toBeTruthy());
  });

  it('shows parsed error when manual register fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classRegisterMock.mockRejectedValueOnce(new Error('register failed'));

    renderPage();

    await waitFor(() => expect(screen.getByRole('option', { name: '김영희 (010-2222-3333)' })).toBeTruthy());
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('cancels registration with confirm cancel/success and handles failure', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    classCancelRegistrationMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '신청 취소' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    expect(classCancelRegistrationMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    await waitFor(() => expect(classCancelRegistrationMock).toHaveBeenCalledWith(1, 101));
    await waitFor(() => expect(screen.getByText('신청이 취소되었습니다.')).toBeTruthy());

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classCancelRegistrationMock.mockRejectedValueOnce(new Error('cancel failed'));

    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('renders registration comment as read-only customer-provided text', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('수련생 코멘트')).toBeTruthy());
    expect(screen.getByText('기존 코멘트')).toBeTruthy();
  });

  it('updates attendance status from registration list', async () => {
    classUpdateRegistrationStatusMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByLabelText('출석 상태')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('출석 상태'), { target: { value: 'absent' } });

    await waitFor(() => expect(classUpdateRegistrationStatusMock).toHaveBeenCalledWith(1, 101, 'absent'));
    await waitFor(() => expect(screen.getByText('출석 상태를 변경했습니다.')).toBeTruthy());
  });

  it('checks attendance with class_id and shows error on failure', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    promptSpy.mockReturnValueOnce('  첫 출석 코멘트  ');
    attendanceCheckInMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '출석 체크' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '출석 체크' }));
    await waitFor(() => expect(attendanceCheckInMock).toHaveBeenCalledWith({
      customer_id: 101,
      class_id: 1,
      instructor_comment: '첫 출석 코멘트',
    }));
    await waitFor(() => expect(screen.getByText('출석 체크를 완료했습니다.')).toBeTruthy());

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    promptSpy.mockReturnValueOnce('');
    attendanceCheckInMock.mockRejectedValueOnce(new Error('checkin failed'));

    fireEvent.click(screen.getByRole('button', { name: '출석 체크' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    promptSpy.mockRestore();
  });

  it('shows dash when registration comment is empty', async () => {
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 101,
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: null,
          attendance_id: 9001,
          attendance_instructor_comment: '',
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수련생 코멘트')).toBeTruthy());
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('saves instructor comment via attendance update and blocks when attendance is missing', async () => {
    attendanceUpdateMock.mockResolvedValueOnce(undefined);
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 101,
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: '기존 코멘트',
          attendance_id: 9001,
          attendance_instructor_comment: '기존 강사 코멘트',
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
        {
          id: 2,
          class_id: 1,
          customer_id: 102,
          registered_at: '2026-03-01T01:10:00.000Z',
          registration_comment: '',
          attendance_id: null,
          attendance_instructor_comment: null,
          customer_name: '김영희',
          customer_phone: '010-2222-3333',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByRole('button', { name: '강사 코멘트 저장' }).length).toBe(2));
    expect(screen.getByText('출석 체크 후 입력할 수 있습니다.')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: '강사 코멘트 저장' })[1] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getAllByLabelText('강사 코멘트')[0], { target: { value: '  수업 후 안정적입니다  ' } });
    fireEvent.click(screen.getAllByRole('button', { name: '강사 코멘트 저장' })[0]);

    await waitFor(() => expect(attendanceUpdateMock).toHaveBeenCalledWith(9001, {
      instructor_comment: '수업 후 안정적입니다',
    }));
    await waitFor(() => expect(screen.getByText('강사 코멘트를 저장했습니다.')).toBeTruthy());
  });

  it('disables register/cancel buttons for completed or unavailable class state', async () => {
    classGetByIdMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '완료수업',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        max_capacity: 10,
        is_open: false,
        class_status: 'completed',
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('상태: 완료')).toBeTruthy());
    expect((screen.getByRole('button', { name: '수동 신청 등록' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '신청 취소' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
