import React from 'react';
import { AxiosError } from 'axios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ClassDetail from './ClassDetail';

const {
  classGetByIdMock,
  classGetRegistrationsMock,
  classRegisterMock,
  classUpdateMock,
  classDeleteMock,
  classCancelRegistrationMock,
  classUpdateRegistrationStatusMock,
  classGetRegistrationCommentThreadMock,
  classPostRegistrationCommentThreadMock,
  classUpdateRegistrationCommentThreadMessageMock,
  classDeleteRegistrationCommentThreadMessageMock,
  attendanceCheckInMock,
  customerGetAllMock,
  membershipGetByCustomerMock,
  parseApiErrorMock,
  shouldConfirmCrossMembershipRegistrationMock,
  getCrossMembershipConfirmationMessageMock,
} = vi.hoisted(() => ({
  classGetByIdMock: vi.fn(),
  classGetRegistrationsMock: vi.fn(),
  classRegisterMock: vi.fn(),
  classUpdateMock: vi.fn(),
  classDeleteMock: vi.fn(),
  classCancelRegistrationMock: vi.fn(),
  classUpdateRegistrationStatusMock: vi.fn(),
  classGetRegistrationCommentThreadMock: vi.fn(),
  classPostRegistrationCommentThreadMock: vi.fn(),
  classUpdateRegistrationCommentThreadMessageMock: vi.fn(),
  classDeleteRegistrationCommentThreadMessageMock: vi.fn(),
  attendanceCheckInMock: vi.fn(),
  customerGetAllMock: vi.fn(),
  membershipGetByCustomerMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
  shouldConfirmCrossMembershipRegistrationMock: vi.fn(() => false),
  getCrossMembershipConfirmationMessageMock: vi.fn(() => '회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.'),
}));

const navigateMock = vi.fn();
let routeId = '1';
let authState: {
  user: { id: number; login_id: string; role: 'admin' | 'customer' } | null;
} = {
  user: { id: 1, login_id: 'admin', role: 'admin' },
};

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
    delete: classDeleteMock,
    cancelRegistration: classCancelRegistrationMock,
    updateRegistrationStatus: classUpdateRegistrationStatusMock,
    getRegistrationCommentThread: classGetRegistrationCommentThreadMock,
    postRegistrationCommentThread: classPostRegistrationCommentThreadMock,
    updateRegistrationCommentThreadMessage: classUpdateRegistrationCommentThreadMessageMock,
    deleteRegistrationCommentThreadMessage: classDeleteRegistrationCommentThreadMessageMock,
  },
  customerAPI: {
    getAll: customerGetAllMock,
  },
  membershipAPI: {
    getByCustomer: membershipGetByCustomerMock,
  },
  attendanceAPI: {
    checkIn: attendanceCheckInMock,
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
  shouldConfirmCrossMembershipRegistration: shouldConfirmCrossMembershipRegistrationMock,
  getCrossMembershipConfirmationMessage: getCrossMembershipConfirmationMessageMock,
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
        attendance_status: 'reserved',
        registered_at: '2026-03-01T01:00:00.000Z',
        registration_comment: '기존 코멘트',
        attendance_id: 9001,
        customer_name: '홍길동',
        customer_phone: '010-1111-2222',
      },
    ],
  });
  customerGetAllMock.mockResolvedValue({
    data: [
      { id: 101, name: '홍길동', phone: '010-1111-2222' },
      { id: 102, name: '김영희', phone: '010-2222-3333' },
      { id: 103, name: '박민수', phone: '010-9999-8888' },
    ],
  });
  membershipGetByCustomerMock.mockResolvedValue({
    data: [
      { id: 31, membership_type_name: '빈야사 10회권', remaining_sessions: 8, available_sessions: 6, is_active: true },
      { id: 32, membership_type_name: '필라테스 20회권', remaining_sessions: 12, available_sessions: 11, is_active: true },
      { id: 33, membership_type_name: '소진된 5회권', remaining_sessions: 1, available_sessions: 0, is_active: true },
      { id: 34, membership_type_name: '비활성 10회권', remaining_sessions: 10, available_sessions: 10, is_active: false },
    ],
  });
};

describe('ClassDetail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    routeId = '1';
    authState = { user: { id: 1, login_id: 'admin', role: 'admin' } };
    seedLoad();
    vi.stubGlobal('confirm', vi.fn(() => true));
    classGetRegistrationCommentThreadMock.mockResolvedValue({
      data: { attendance_id: 9001, messages: [] },
    });
    classPostRegistrationCommentThreadMock.mockResolvedValue({
      data: {
        id: 5001,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '관리자 메시지',
        created_at: '2026-03-01T02:00:00.000Z',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it('filters manual registration customers by search keyword', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('고객 검색')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('고객 검색'), { target: { value: '2222' } });

    expect(screen.getByRole('option', { name: '김영희 (010-2222-3333)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '신청할 고객 선택' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '박민수 (010-9999-8888)' })).toBeFalsy();
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
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '변경 메모' } });
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

  it('deletes class from detail page with confirm cancel/success and handles failure', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    classDeleteMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '수업 삭제' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수업 삭제' }));
    expect(classDeleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '수업 삭제' }));
    await waitFor(() => expect(classDeleteMock).toHaveBeenCalledWith(1));
    expect(navigateMock).toHaveBeenCalledWith('/classes');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classDeleteMock.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(screen.getByRole('button', { name: '수업 삭제' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
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
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledWith(1, { customer_id: 102 }));
    await waitFor(() => expect(screen.getByText('수동 신청이 등록되었습니다.')).toBeTruthy());
  });

  it('registers walk-in attendance manually after class completion', async () => {
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
    classGetRegistrationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            class_id: 1,
            customer_id: 102,
            registered_at: '2026-03-01T02:00:00.000Z',
            attendance_status: 'attended',
            customer_name: '김영희',
            customer_phone: '010-2222-3333',
          },
        ],
      });
    classRegisterMock.mockResolvedValueOnce(undefined);

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '사후 출석 등록' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '사후 출석 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledWith(1, {
      customer_id: 102,
      mark_attended_after_register: true,
    }));
    await waitFor(() => expect(screen.getByText('사후 출석 등록을 완료했습니다.')).toBeTruthy());
  });

  it('loads memberships for selected customer and sends chosen membership id', async () => {
    classRegisterMock.mockResolvedValueOnce(undefined);
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

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });

    await waitFor(() => expect(membershipGetByCustomerMock).toHaveBeenCalledWith(102));
    await waitFor(() => expect(screen.getByText('회원권을 지정하지 않으면 서버가 신청 가능 수업명 set 기준으로 자동 선택합니다.')).toBeTruthy());
    expect(screen.queryByRole('option', { name: /소진된 5회권/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /비활성 10회권/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('사용할 회원권'), { target: { value: '32' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledWith(1, {
      customer_id: 102,
      membership_id: 32,
    }));
  });

  it('shows membership load error under selector', async () => {
    membershipGetByCustomerMock.mockRejectedValueOnce(new Error('membership load failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows empty-state hint when customer has no reservable active memberships', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        { id: 50, membership_type_name: '소진됨', remaining_sessions: 0, available_sessions: 0, is_active: true },
        { id: 51, membership_type_name: '비활성', remaining_sessions: 5, available_sessions: 5, is_active: false },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });

    await waitFor(() => expect(screen.getByText('예약 가능한 활성 회원권이 없습니다. 선택 없이 진행하면 서버가 신청 가능 수업명 set 기준으로 다시 확인합니다.')).toBeTruthy());
  });

  it('auto-selects membership when exactly one reservable active membership exists', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        { id: 77, membership_type_name: '유일한 회원권', remaining_sessions: 3, available_sessions: 1, is_active: true },
        { id: 78, membership_type_name: '비활성 회원권', remaining_sessions: 5, available_sessions: 5, is_active: false },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });

    await waitFor(() => expect((screen.getByLabelText('사용할 회원권') as HTMLSelectElement).value).toBe('77'));
  });

  it('uses remaining sessions fallback when available sessions is missing', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        { id: 79, membership_type_name: 'fallback 회원권', remaining_sessions: 4, is_active: true },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });

    await waitFor(() => expect(screen.getByRole('option', { name: 'fallback 회원권 · 예약 가능 4회 / 잔여 4회' })).toBeTruthy());
  });

  it('ignores membership load failure after component unmount', async () => {
    let rejectMembershipLoad: (reason?: unknown) => void = () => {};
    membershipGetByCustomerMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectMembershipLoad = reject;
      })
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderPage();

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    unmount();

    rejectMembershipLoad(new Error('late membership failure'));
    await Promise.resolve();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('ignores late membership load success after customer selection is cleared', async () => {
    let resolveMembershipLoad: (value: unknown) => void = () => {};
    membershipGetByCustomerMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveMembershipLoad = resolve;
      })
    );

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('신청할 고객')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '' } });

    resolveMembershipLoad({
      data: [
        { id: 77, membership_type_name: '늦게 온 회원권', remaining_sessions: 3, available_sessions: 2, is_active: true },
      ],
    });

    await Promise.resolve();
    expect(screen.queryByRole('option', { name: /늦게 온 회원권/ })).toBeNull();
  });

  it('shows parsed error when manual register fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classRegisterMock.mockRejectedValueOnce(new Error('register failed'));

    renderPage();

    await waitFor(() => expect(screen.getByRole('option', { name: '김영희 (010-2222-3333)' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
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

  it('disables cancel button when registration is already attended or absent', async () => {
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 101,
          attendance_status: 'attended',
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: null,
          attendance_id: 9001,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
        {
          id: 2,
          class_id: 1,
          customer_id: 102,
          attendance_status: 'absent',
          registered_at: '2026-03-01T01:10:00.000Z',
          registration_comment: null,
          attendance_id: null,
          customer_name: '김영희',
          customer_phone: '010-2222-3333',
        },
      ],
    });

    renderPage();
    const cancelButtons = await screen.findAllByRole('button', { name: '신청 취소' });
    expect((cancelButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((cancelButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('handles refresh result where class detail disappears', async () => {
    classRegisterMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '김영희 (010-2222-3333)' })).toBeTruthy());

    classGetByIdMock.mockResolvedValueOnce({ data: null });
    classGetRegistrationsMock.mockResolvedValueOnce({ data: [] });

    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy());
  });

  it('renders registration comment as read-only customer-provided text', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('수업 전 코멘트 (신청 시)')).toBeTruthy());
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

  it('runs check-in flow when changing status from reserved to attended', async () => {
    attendanceCheckInMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByLabelText('출석 상태')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('출석 상태'), { target: { value: 'attended' } });

    await waitFor(() => expect(attendanceCheckInMock).toHaveBeenCalledWith({
      customer_id: 101,
      class_id: 1,
    }));
    expect(classUpdateRegistrationStatusMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('출석 체크를 완료했습니다.')).toBeTruthy());
  });

  it('treats missing attendance status as reserved when changing status to attended', async () => {
    attendanceCheckInMock.mockResolvedValueOnce(undefined);
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 101,
          attendance_status: null,
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: '기존 코멘트',
          attendance_id: null,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText('출석 상태')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('출석 상태'), { target: { value: 'attended' } });

    await waitFor(() => expect(attendanceCheckInMock).toHaveBeenCalledWith({
      customer_id: 101,
      class_id: 1,
    }));
    expect(classUpdateRegistrationStatusMock).not.toHaveBeenCalled();
  });

  it('runs check-in flow when changing status from absent to attended', async () => {
    attendanceCheckInMock.mockResolvedValueOnce(undefined);
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 101,
          attendance_status: 'absent',
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: '기존 코멘트',
          attendance_id: 9001,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText('출석 상태')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('출석 상태'), { target: { value: 'attended' } });

    await waitFor(() => expect(attendanceCheckInMock).toHaveBeenCalledWith({
      customer_id: 101,
      class_id: 1,
    }));
    expect(classUpdateRegistrationStatusMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('출석 체크를 완료했습니다.')).toBeTruthy());
  });

  it('checks attendance with class_id and shows error on failure', async () => {
    attendanceCheckInMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '출석 체크' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '출석 체크' }));
    await waitFor(() => expect(attendanceCheckInMock).toHaveBeenCalledWith({
      customer_id: 101,
      class_id: 1,
    }));
    await waitFor(() => expect(screen.getByText('출석 체크를 완료했습니다.')).toBeTruthy());

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    attendanceCheckInMock.mockRejectedValueOnce(new Error('checkin failed'));

    fireEvent.click(screen.getByRole('button', { name: '출석 체크' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
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
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 전 코멘트 (신청 시)')).toBeTruthy());
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
  });

  it('loads and sends attendance comment thread in registration card', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7101,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 11,
            message: '수련생 첫 메시지',
            created_at: '2026-03-01T01:30:00.000Z',
          },
        ],
      },
    });
    classPostRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        id: 7102,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '강사 답변',
        created_at: '2026-03-01T01:35:00.000Z',
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 불러오기' })).toBeTruthy());
    await waitFor(() => expect(classGetRegistrationCommentThreadMock).toHaveBeenCalledWith(1, 101));
    await waitFor(() => expect(screen.getByText('수련생 첫 메시지')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '강사 답변' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));

    await waitFor(() => expect(classPostRegistrationCommentThreadMock).toHaveBeenCalledWith(1, 101, '강사 답변'));
    await waitFor(() => expect(screen.getByText('수업 후 코멘트 대화를 전송했습니다.')).toBeTruthy());
    expect(screen.getByText('강사 답변')).toBeTruthy();
  });

  it('edits and deletes only the current admin attendance comment thread message', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7101,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 11,
            message: '수련생 첫 메시지',
            created_at: '2026-03-01T01:30:00.000Z',
          },
          {
            id: 7102,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 1,
            message: '내 안내 메시지',
            created_at: '2026-03-01T01:35:00.000Z',
          },
        ],
      },
    });
    classUpdateRegistrationCommentThreadMessageMock.mockResolvedValueOnce({
      data: {
        id: 7102,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '수정된 안내 메시지',
        created_at: '2026-03-01T01:35:00.000Z',
      },
    });
    classDeleteRegistrationCommentThreadMessageMock.mockResolvedValueOnce({});

    renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 안내 메시지'), { target: { value: '수정 요청 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(classUpdateRegistrationCommentThreadMessageMock).toHaveBeenCalledWith(1, 101, 7102, '수정 요청 메시지'));
    await waitFor(() => expect(screen.getByText('수업 후 코멘트 대화를 수정했습니다.')).toBeTruthy());
    expect(screen.getByText('수정된 안내 메시지')).toBeTruthy();

    fireEvent.click(screen.getByText('삭제'));
    await waitFor(() => expect(classDeleteRegistrationCommentThreadMessageMock).toHaveBeenCalledWith(1, 101, 7102));
    await waitFor(() => expect(screen.getByText('수업 후 코멘트 대화를 삭제했습니다.')).toBeTruthy());
    expect(screen.queryByText('수정된 안내 메시지')).toBeNull();
  });

  it('clears admin edit state when deleting the message currently being edited', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7102,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 1,
            message: '내 안내 메시지',
            created_at: '2026-03-01T01:35:00.000Z',
          },
        ],
      },
    });
    classDeleteRegistrationCommentThreadMessageMock.mockResolvedValueOnce({});

    renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();

    fireEvent.click(screen.getByText('삭제'));
    await waitFor(() => expect(classDeleteRegistrationCommentThreadMessageMock).toHaveBeenCalledWith(1, 101, 7102));
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
    expect(screen.queryByText('내 안내 메시지')).toBeNull();
  });

  it('does not save empty edited admin attendance comment thread message', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7102,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 1,
            message: '내 안내 메시지',
            created_at: '2026-03-01T01:35:00.000Z',
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 안내 메시지'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(classUpdateRegistrationCommentThreadMessageMock).not.toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
  });

  it('ignores late admin thread edit response after route changed', async () => {
    classGetRegistrationCommentThreadMock
      .mockResolvedValueOnce({
        data: {
          attendance_id: 9001,
          messages: [
            {
              id: 7102,
              attendance_id: 9001,
              author_role: 'admin',
              author_user_id: 1,
              message: '내 안내 메시지',
              created_at: '2026-03-01T01:35:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });

    let resolveEdit: (value: {
      data: {
        id: number;
        attendance_id: number;
        author_role: 'admin' | 'customer';
        author_user_id: number;
        message: string;
        created_at: string;
      };
    }) => void = () => {};
    classUpdateRegistrationCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveEdit = resolve as (value: {
          data: {
            id: number;
            attendance_id: number;
            author_role: 'admin' | 'customer';
            author_user_id: number;
            message: string;
            created_at: string;
          };
        }) => void;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 안내 메시지'), { target: { value: '수정 예정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    routeId = '2';
    classGetByIdMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '아쉬탕가',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        max_capacity: 12,
        is_open: true,
        class_status: 'open',
        current_enrollment: 1,
        remaining_seats: 11,
      },
    });
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          class_id: 2,
          customer_id: 101,
          attendance_status: 'reserved',
          registered_at: '2026-03-02T01:00:00.000Z',
          registration_comment: '',
          attendance_id: 9002,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });
    rerender(
      <MemoryRouter>
        <ClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    resolveEdit({
      data: {
        id: 7102,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '늦게 온 수정 응답',
        created_at: '2026-03-01T01:35:00.000Z',
      },
    });
    await waitFor(() => expect(screen.queryByText('늦게 온 수정 응답')).toBeNull());
    expect(screen.queryByText('수업 후 코멘트 대화를 수정했습니다.')).toBeNull();
  });

  it('ignores late admin thread edit error after route changed', async () => {
    classGetRegistrationCommentThreadMock
      .mockResolvedValueOnce({
        data: {
          attendance_id: 9001,
          messages: [
            {
              id: 7102,
              attendance_id: 9001,
              author_role: 'admin',
              author_user_id: 1,
              message: '내 안내 메시지',
              created_at: '2026-03-01T01:35:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });

    let rejectEdit: (reason?: unknown) => void = () => {};
    classUpdateRegistrationCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectEdit = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 안내 메시지'), { target: { value: '수정 예정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    routeId = '2';
    classGetByIdMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '아쉬탕가',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        max_capacity: 12,
        is_open: true,
        class_status: 'open',
        current_enrollment: 1,
        remaining_seats: 11,
      },
    });
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          class_id: 2,
          customer_id: 101,
          attendance_status: 'reserved',
          registered_at: '2026-03-02T01:00:00.000Z',
          registration_comment: '',
          attendance_id: 9002,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });
    rerender(
      <MemoryRouter>
        <ClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    rejectEdit(new Error('old admin thread edit failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });

  it('ignores late admin thread edit success after registrations refresh clears thread cache', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7102,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 1,
            message: '내 안내 메시지',
            created_at: '2026-03-01T01:35:00.000Z',
          },
        ],
      },
    });

    let resolveEdit: (value: {
      data: {
        id: number;
        attendance_id: number;
        author_role: 'admin' | 'customer';
        author_user_id: number;
        message: string;
        created_at: string;
      };
    }) => void = () => {};
    classUpdateRegistrationCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveEdit = resolve as (value: {
          data: {
            id: number;
            attendance_id: number;
            author_role: 'admin' | 'customer';
            author_user_id: number;
            message: string;
            created_at: string;
          };
        }) => void;
      })
    );
    classUpdateRegistrationStatusMock.mockResolvedValueOnce({});

    renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 안내 메시지'), { target: { value: '수정 예정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    fireEvent.change(screen.getByDisplayValue('예약'), { target: { value: 'absent' } });
    await waitFor(() => expect(classUpdateRegistrationStatusMock).toHaveBeenCalledWith(1, 101, 'absent'));
    await waitFor(() => expect(screen.getByText('출석 상태를 변경했습니다.')).toBeTruthy());

    resolveEdit({
      data: {
        id: 7102,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '늦게 온 수정 응답',
        created_at: '2026-03-01T01:35:00.000Z',
      },
    });

    await waitFor(() => expect(screen.queryByText('늦게 온 수정 응답')).toBeNull());
    expect(screen.queryByText('수업 후 코멘트 대화를 수정했습니다.')).toBeNull();
  });

  it('ignores late admin thread delete response after route changed', async () => {
    classGetRegistrationCommentThreadMock
      .mockResolvedValueOnce({
        data: {
          attendance_id: 9001,
          messages: [
            {
              id: 7102,
              attendance_id: 9001,
              author_role: 'admin',
              author_user_id: 1,
              message: '내 안내 메시지',
              created_at: '2026-03-01T01:35:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });

    let resolveDelete: (value: unknown) => void = () => {};
    classDeleteRegistrationCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());
    fireEvent.click(screen.getByText('삭제'));

    routeId = '2';
    classGetByIdMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '아쉬탕가',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        max_capacity: 12,
        is_open: true,
        class_status: 'open',
        current_enrollment: 1,
        remaining_seats: 11,
      },
    });
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          class_id: 2,
          customer_id: 101,
          attendance_status: 'reserved',
          registered_at: '2026-03-02T01:00:00.000Z',
          registration_comment: '',
          attendance_id: 9002,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });
    rerender(
      <MemoryRouter>
        <ClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    resolveDelete({});
    await waitFor(() => expect(screen.queryByText('내 안내 메시지')).toBeNull());
    expect(screen.queryByText('수업 후 코멘트 대화를 삭제했습니다.')).toBeNull();
  });

  it('ignores late admin thread delete error after route changed', async () => {
    classGetRegistrationCommentThreadMock
      .mockResolvedValueOnce({
        data: {
          attendance_id: 9001,
          messages: [
            {
              id: 7102,
              attendance_id: 9001,
              author_role: 'admin',
              author_user_id: 1,
              message: '내 안내 메시지',
              created_at: '2026-03-01T01:35:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });

    let rejectDelete: (reason?: unknown) => void = () => {};
    classDeleteRegistrationCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectDelete = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());
    fireEvent.click(screen.getByText('삭제'));

    routeId = '2';
    classGetByIdMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '아쉬탕가',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        max_capacity: 12,
        is_open: true,
        class_status: 'open',
        current_enrollment: 1,
        remaining_seats: 11,
      },
    });
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          class_id: 2,
          customer_id: 101,
          attendance_status: 'reserved',
          registered_at: '2026-03-02T01:00:00.000Z',
          registration_comment: '',
          attendance_id: 9002,
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
      ],
    });
    rerender(
      <MemoryRouter>
        <ClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    rejectDelete(new Error('old admin thread delete failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });

  it('ignores late admin thread delete success after registrations refresh clears thread cache', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7102,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 1,
            message: '내 안내 메시지',
            created_at: '2026-03-01T01:35:00.000Z',
          },
        ],
      },
    });

    let resolveDelete: (value: unknown) => void = () => {};
    classDeleteRegistrationCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    classUpdateRegistrationStatusMock.mockResolvedValueOnce({});

    renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('삭제'));
    fireEvent.change(screen.getByDisplayValue('예약'), { target: { value: 'absent' } });
    await waitFor(() => expect(classUpdateRegistrationStatusMock).toHaveBeenCalledWith(1, 101, 'absent'));
    await waitFor(() => expect(screen.getByText('출석 상태를 변경했습니다.')).toBeTruthy());

    resolveDelete({});

    await waitFor(() => expect(screen.queryByText('내 안내 메시지')).toBeNull());
    expect(screen.queryByText('수업 후 코멘트 대화를 삭제했습니다.')).toBeNull();
  });

  it('does not send empty attendance comment thread and shows empty thread placeholder', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 불러오기' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '대화 불러오기' }));

    await waitFor(() => expect(screen.getByText('아직 대화가 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));
    await waitFor(() => expect(classPostRegistrationCommentThreadMock).not.toHaveBeenCalled());
  });

  it('preloads thread in background batches for many attended registrations', async () => {
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: Array.from({ length: 6 }, (_, idx) => ({
        id: idx + 1,
        class_id: 1,
        customer_id: 200 + idx,
        registered_at: '2026-03-01T01:00:00.000Z',
        registration_comment: '',
        attendance_id: 9000 + idx,
        customer_name: `수련생${idx + 1}`,
        customer_phone: `010-0000-000${idx}`,
      })),
    });
    classGetRegistrationCommentThreadMock.mockResolvedValue({
      data: { messages: [] },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수련생 목록')).toBeTruthy());
    await waitFor(() => expect(classGetRegistrationCommentThreadMock).toHaveBeenCalledTimes(6));
  });

  it('skips duplicate in-flight thread preload requests for same customer', async () => {
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 333,
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: '',
          attendance_id: 9333,
          customer_name: '중복수련생1',
          customer_phone: '010-3333-0001',
        },
        {
          id: 2,
          class_id: 1,
          customer_id: 333,
          registered_at: '2026-03-01T01:01:00.000Z',
          registration_comment: '',
          attendance_id: 9334,
          customer_name: '중복수련생2',
          customer_phone: '010-3333-0002',
        },
      ],
    });
    classGetRegistrationCommentThreadMock.mockImplementation(() => new Promise(() => {}));

    renderPage();

    await waitFor(() => expect(screen.getByText('수련생 목록')).toBeTruthy());
    await waitFor(() => expect(classGetRegistrationCommentThreadMock).toHaveBeenCalledTimes(1));
  });

  it('stops deferred thread preload after unmount', async () => {
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: Array.from({ length: 6 }, (_, idx) => ({
        id: idx + 1,
        class_id: 1,
        customer_id: 500 + idx,
        registered_at: '2026-03-01T01:00:00.000Z',
        registration_comment: '',
        attendance_id: 9500 + idx,
        customer_name: `취소수련생${idx + 1}`,
        customer_phone: `010-5555-000${idx}`,
      })),
    });
    classGetRegistrationCommentThreadMock.mockResolvedValue({
      data: { messages: [] },
    });

    const view = renderPage();
    await waitFor(() => expect(classGetRegistrationCommentThreadMock).toHaveBeenCalledTimes(4));

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(classGetRegistrationCommentThreadMock).toHaveBeenCalledTimes(4);
  });

  it('handles thread fallback branches for missing messages and first send append', async () => {
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({ data: {} });
    classPostRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        id: 7301,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '첫 전송 메시지',
        created_at: '2026-03-01T02:10:00.000Z',
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 불러오기' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '대화 불러오기' }));
    await waitFor(() => expect(screen.getByText('아직 대화가 없습니다.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));
    await waitFor(() => expect(classPostRegistrationCommentThreadMock).not.toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '첫 전송 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));
    await waitFor(() => expect(classPostRegistrationCommentThreadMock).toHaveBeenCalledWith(1, 101, '첫 전송 메시지'));
    expect(screen.getByText('첫 전송 메시지')).toBeTruthy();
  });

  it('appends first sent message even when thread was not preloaded', async () => {
    classGetRegistrationCommentThreadMock.mockImplementationOnce(() => new Promise(() => {}));
    classPostRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        id: 7401,
        attendance_id: 9001,
        author_role: 'admin',
        author_user_id: 1,
        message: '선조회 없이 전송',
        created_at: '2026-03-01T02:20:00.000Z',
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText('수업 후 코멘트 대화 작성')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '선조회 없이 전송' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));

    await waitFor(() => expect(classPostRegistrationCommentThreadMock).toHaveBeenCalledWith(1, 101, '선조회 없이 전송'));
    await waitFor(() => expect(screen.getByText('수업 후 코멘트 대화를 전송했습니다.')).toBeTruthy());
  });

  it('shows error when loading or sending attendance comment thread fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetRegistrationCommentThreadMock.mockRejectedValue(new Error('thread load failed'));

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 불러오기' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '대화 불러오기' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());

    classPostRegistrationCommentThreadMock.mockRejectedValueOnce(new Error('thread send failed'));
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '실패 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows error when editing or deleting attendance comment thread fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetRegistrationCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 7102,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 1,
            message: '내 안내 메시지',
            created_at: '2026-03-01T01:35:00.000Z',
          },
        ],
      },
    });
    classUpdateRegistrationCommentThreadMessageMock.mockRejectedValueOnce(new Error('thread edit failed'));
    classDeleteRegistrationCommentThreadMessageMock.mockRejectedValueOnce(new Error('thread delete failed'));

    renderPage();
    await waitFor(() => expect(screen.getByText('내 안내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 안내 메시지'), { target: { value: '수정 실패 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByText('삭제'));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows attended/absent status labels in registration list', async () => {
    classGetRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          class_id: 1,
          customer_id: 101,
          registered_at: '2026-03-01T01:00:00.000Z',
          registration_comment: '',
          attendance_id: 9001,
          attendance_status: 'attended',
          customer_name: '홍길동',
          customer_phone: '010-1111-2222',
        },
        {
          id: 2,
          class_id: 1,
          customer_id: 102,
          registered_at: '2026-03-01T01:10:00.000Z',
          registration_comment: '',
          attendance_id: 9002,
          attendance_status: 'absent',
          customer_name: '김영희',
          customer_phone: '010-2222-3333',
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('출석 상태: 출석')).toBeTruthy());
    expect(screen.getByText('출석 상태: 결석')).toBeTruthy();
  });

  it('shows validation errors for empty required class edit fields', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본정보 수정' }));

    const editForm = screen.getByRole('button', { name: '기본정보 저장' }).closest('form');
    if (!editForm) throw new Error('edit form not found');

    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '   ' } });
    fireEvent.submit(editForm);
    await waitFor(() => expect(screen.getByText('수업명은 필수입니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '정상명' } });
    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '' } });
    fireEvent.submit(editForm);
    await waitFor(() => expect(screen.getByText('수업 날짜를 입력하세요.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-03-02' } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '' } });
    fireEvent.submit(editForm);
    await waitFor(() => expect(screen.getByText('시작/종료 시간을 입력하세요.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('제한 인원'), { target: { value: '0' } });
    fireEvent.submit(editForm);
    await waitFor(() => expect(screen.getByText('제한 인원은 1명 이상 정수여야 합니다.')).toBeTruthy());
  });

  it('resets edit form on cancel and handles class update/status update errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classUpdateMock.mockRejectedValueOnce(new Error('update failed'));

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본정보 수정' }));
    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '변경값' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect((screen.getByText('상태: 오픈'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '기본정보 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '기본정보 저장' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());

    classUpdateRegistrationStatusMock.mockRejectedValueOnce(new Error('status failed'));
    fireEvent.change(screen.getByLabelText('출석 상태'), { target: { value: 'absent' } });
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('retries manual registration after cross-membership confirmation', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockResolvedValueOnce(undefined);
    classGetRegistrationsMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            class_id: 1,
            customer_id: 101,
            registered_at: '2026-03-01T01:00:00.000Z',
            customer_name: '홍길동',
            customer_phone: '010-1111-2222',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            class_id: 1,
            customer_id: 101,
            registered_at: '2026-03-01T01:00:00.000Z',
            customer_name: '홍길동',
            customer_phone: '010-1111-2222',
          },
          {
            id: 2,
            class_id: 1,
            customer_id: 102,
            registered_at: '2026-03-01T02:00:00.000Z',
            customer_name: '김영희',
            customer_phone: '010-2222-3333',
          },
        ],
      });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '수동 신청 등록' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(1, 1, { customer_id: 102 }));
    await waitFor(() => expect(globalThis.confirm).toHaveBeenCalledWith('회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.'));
    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(2, 1, {
      customer_id: 102,
      allow_cross_membership_registration: true,
    }));
    await waitFor(() => expect(screen.getByText('다른 회원권 차감으로 수동 신청이 등록되었습니다.')).toBeTruthy());
  });

  it('keeps selected membership id when retrying manual registration after cross-membership confirmation', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '수동 신청 등록' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    await waitFor(() => expect(screen.getByLabelText('사용할 회원권')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('사용할 회원권'), { target: { value: '31' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(1, 1, {
      customer_id: 102,
      membership_id: 31,
    }));
    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(2, 1, {
      customer_id: 102,
      membership_id: 31,
      allow_cross_membership_registration: true,
    }));
  });

  it('retries post-attendance registration after cross-membership confirmation', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
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
    classGetRegistrationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            class_id: 1,
            customer_id: 102,
            registered_at: '2026-03-01T02:00:00.000Z',
            attendance_status: 'attended',
            customer_name: '김영희',
            customer_phone: '010-2222-3333',
          },
        ],
      });
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '사후 출석 등록' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '사후 출석 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(1, 1, {
      customer_id: 102,
      mark_attended_after_register: true,
    }));
    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(2, 1, {
      customer_id: 102,
      allow_cross_membership_registration: true,
      mark_attended_after_register: true,
    }));
    await waitFor(() => expect(screen.getByText('다른 회원권 차감으로 사후 출석 등록을 완료했습니다.')).toBeTruthy());
  });

  it('stops manual registration retry when cross-membership confirmation is canceled', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    classRegisterMock.mockRejectedValueOnce(crossMembershipError);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '수동 신청 등록' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledTimes(1));
    expect(parseApiErrorMock).not.toHaveBeenCalled();
  });

  it('shows error when cross-membership retry fails during manual registration', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    const retryError = new Error('retry failed');
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockRejectedValueOnce(retryError);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '수동 신청 등록' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('신청할 고객'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '수동 신청 등록' }));

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(parseApiErrorMock).toHaveBeenCalledWith(retryError));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
  });

  it('keeps completed-class attendance actions available except cancel', async () => {
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
    expect((screen.getByRole('button', { name: '사후 출석 등록' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '신청 취소' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '출석 체크' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
