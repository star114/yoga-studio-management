import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerDetail from './CustomerDetail';

const {
  getByIdMock,
  updateCustomerMock,
  resetPasswordMock,
  getTypesMock,
  getByCustomerMock,
  createMembershipMock,
  updateMembershipMock,
  deleteMembershipMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  getByIdMock: vi.fn(),
  updateCustomerMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  getTypesMock: vi.fn(),
  getByCustomerMock: vi.fn(),
  createMembershipMock: vi.fn(),
  updateMembershipMock: vi.fn(),
  deleteMembershipMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
}));

let routeId = '1';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: routeId }),
  };
});

vi.mock('../services/api', () => ({
  customerAPI: {
    getById: getByIdMock,
    update: updateCustomerMock,
    resetPassword: resetPasswordMock,
  },
  membershipAPI: {
    getTypes: getTypesMock,
    getByCustomer: getByCustomerMock,
    create: createMembershipMock,
    update: updateMembershipMock,
    delete: deleteMembershipMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerDetail />
  </MemoryRouter>
);

const seedLoadSuccess = () => {
  getByIdMock.mockResolvedValue({
    data: {
      customer: {
        id: 1,
        name: '홍길동',
        phone: '010-1111-2222',
        notes: '메모',
      },
      recentAttendances: [],
    },
  });
  getTypesMock.mockResolvedValue({ data: [{ id: 5, name: '10회권' }] });
  getByCustomerMock.mockResolvedValue({ data: [] });
};

describe('CustomerDetail page', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    routeId = '1';
    seedLoadSuccess();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows invalid id error', async () => {
    routeId = 'abc';
    renderPage();

    await waitFor(() => expect(screen.getByText('유효하지 않은 고객 ID입니다.')).toBeTruthy());
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it('shows load error when initialization fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getByIdMock.mockRejectedValueOnce(new Error('load failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('고객 상세 정보를 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders fallback when customer is missing', async () => {
    getByIdMock.mockResolvedValueOnce({ data: { customer: null } });

    renderPage();

    await waitFor(() => expect(screen.getByText('고객을 찾을 수 없습니다.')).toBeTruthy());
  });

  it('renders fallback profile fields when optional values are absent', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '옵션없음',
          phone: '010-0000-0000',
          notes: null,
        },
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('옵션없음')).toBeTruthy());
    expect(screen.queryByText('생년월일:')).toBeNull();
    expect(screen.queryByText('성별:')).toBeNull();
    expect(screen.queryByText('주소:')).toBeNull();
  });

  it('handles missing recentAttendances and null notes in edit/cancel forms', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '메모없음',
          phone: '010-1212-3434',
          notes: null,
        },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('메모없음')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    expect((screen.getByLabelText('고객 메모') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    expect((screen.getByLabelText('고객 메모') as HTMLTextAreaElement).value).toBe('');
  });

  it('renders detail info and empty memberships state', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('고객 상세')).toBeTruthy());
    expect(screen.getByText('홍길동')).toBeTruthy();
    expect(screen.getByText(/메모:/)).toBeTruthy();
    expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy();
    expect(screen.getByText('출석 기록이 없습니다.')).toBeTruthy();
  });

  it('edits customer info in detail page and supports cancel', async () => {
    updateCustomerMock.mockResolvedValueOnce(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));

    fireEvent.change(screen.getByLabelText('고객 이름'), { target: { value: '홍길순' } });
    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: ' 010-9999-8888 ' } });
    fireEvent.change(screen.getByLabelText('고객 메모'), { target: { value: '새 메모' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 정보 저장' }));

    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalledWith(1, {
      name: '홍길순',
      phone: '010-9999-8888',
      notes: '새 메모',
    }));
    await waitFor(() => expect(screen.getByText('고객 정보를 수정했습니다.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    fireEvent.change(screen.getByLabelText('고객 이름'), { target: { value: '변경전취소' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '고객 정보 저장' })).toBeNull();
  });

  it('validates required phone in customer edit and shows update error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    updateCustomerMock.mockRejectedValueOnce(new Error('update failed'));

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));

    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: '고객 정보 저장' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('전화번호는 필수입니다.')).toBeTruthy());
    expect(updateCustomerMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: '010-3333-4444' } });
    fireEvent.submit(screen.getByRole('button', { name: '고객 정보 저장' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders only latest attended class', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '홍길동',
          phone: '010-1111-2222',
        },
        recentAttendances: [
          {
            id: 101,
            attendance_date: '2026-02-20T10:00:00.000Z',
            class_title: '아쉬탕가',
            class_date: '2026-02-20',
            class_start_time: '09:00:00',
          },
          {
            id: 102,
            attendance_date: '2026-02-21T10:00:00.000Z',
            class_type: '빈야사',
          },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    expect(screen.getByText('아쉬탕가')).toBeTruthy();
    expect(screen.queryByText('빈야사')).toBeNull();
    expect(screen.getByRole('link', { name: '전체 보기' })).toBeTruthy();
  });

  it('renders fallback latest attendance datetime when class datetime is missing', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '홍길동',
          phone: '010-1111-2222',
        },
        recentAttendances: [
          {
            id: 201,
            attendance_date: '2026-02-20T10:00:00.000Z',
            class_title: '아쉬탕가',
            class_date: null,
            class_start_time: null,
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('renders fallback latest attendance title when class title/type are both missing', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '홍길동',
          phone: '010-1111-2222',
        },
        recentAttendances: [
          {
            id: 202,
            attendance_date: '2026-02-20T10:00:00.000Z',
            class_title: null,
            class_type: null,
            class_date: null,
            class_start_time: null,
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 정보 없음')).toBeTruthy());
  });

  it('resets password with cancel and success paths', async () => {
    resetPasswordMock.mockResolvedValueOnce(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('비밀번호 초기화')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));
    expect(resetPasswordMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));
    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByText('고객 비밀번호를 기본값(12345)으로 초기화했습니다.')).toBeTruthy());

    confirmSpy.mockRestore();
  });

  it('shows parsed error when reset password fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetPasswordMock.mockRejectedValueOnce(new Error('reset failed'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('비밀번호 초기화')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('creates membership and refreshes customer/membership data', async () => {
    createMembershipMock.mockResolvedValueOnce(undefined);

    renderPage();

    await waitFor(() => expect(screen.getByText('회원권 발급')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '프로모션' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalledWith({
      customer_id: 1,
      membership_type_id: 5,
      notes: '프로모션',
    }));

    expect(getByIdMock).toHaveBeenCalledTimes(2);
    expect(getByCustomerMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText('회원권을 지급했습니다.')).toBeTruthy());
  });

  it('handles create-membership refresh when recent attendances/notes are missing', async () => {
    getByIdMock
      .mockResolvedValueOnce({
        data: {
          customer: {
            id: 1,
            name: '홍길동',
            phone: '010-1111-2222',
            notes: '초기 메모',
          },
          recentAttendances: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          customer: {
            id: 1,
            name: '홍길동',
            phone: '010-1111-2222',
            notes: null,
          },
        },
      });
    createMembershipMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('회원권 발급')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('회원권을 지급했습니다.')).toBeTruthy());
  });

  it('saves customer edit with empty notes as null', async () => {
    updateCustomerMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    fireEvent.change(screen.getByLabelText('고객 메모'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 정보 저장' }));

    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalledWith(1, {
      name: '홍길동',
      phone: '010-1111-2222',
      notes: null,
    }));
  });

  it('shows parsed error when create membership fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMembershipMock.mockRejectedValueOnce(new Error('create failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('회원권 발급')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('edits membership and supports cancel', async () => {
    updateMembershipMock.mockResolvedValueOnce(undefined);
    getByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 8,
            membership_type_name: '프리패스',
            remaining_sessions: 5,
            is_active: true,
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 8,
            membership_type_name: '프리패스',
            remaining_sessions: null,
            is_active: false,
            notes: '변경됨',
          },
        ],
      });

    renderPage();

    await waitFor(() => expect(screen.getByText('프리패스')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('잔여 횟수'), { target: { value: '' } });
    fireEvent.change(document.getElementById('edit-notes-8') as HTMLTextAreaElement, { target: { value: '변경됨' } });
    fireEvent.click(screen.getByLabelText('활성 상태'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(updateMembershipMock).toHaveBeenCalledWith(8, {
      remaining_sessions: null,
      is_active: false,
      notes: '변경됨',
    }));

    await waitFor(() => expect(screen.getByText('회원권 정보를 수정했습니다.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('renders membership start/end dates when provided', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 10,
          membership_type_name: '날짜있음권',
          remaining_sessions: 3,
          is_active: true,
          start_date: '2026-02-01',
          expected_end_date: '2026-03-05',
          notes: null,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('날짜있음권')).toBeTruthy());
    expect(screen.getByText('시작일: 2026년 2월 1일')).toBeTruthy();
    expect(screen.getByText('예상 종료일: 2026년 3월 5일')).toBeTruthy();
  });

  it('renders membership date fallback as dash when dates are missing', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 9,
          membership_type_name: '날짜없음권',
          remaining_sessions: 1,
          is_active: true,
          start_date: null,
          expected_end_date: null,
          notes: null,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('날짜없음권')).toBeTruthy());
    expect(screen.getByText('시작일: -')).toBeTruthy();
    expect(screen.getByText('예상 종료일: -')).toBeTruthy();
  });

  it('shows parsed error when update membership fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    updateMembershipMock.mockRejectedValueOnce(new Error('update failed'));
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 15,
          membership_type_name: '10회권',
          remaining_sessions: 2,
          is_active: true,
          notes: '',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('delete membership handles confirm cancel and success', async () => {
    deleteMembershipMock.mockResolvedValueOnce(undefined);
    getByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 20,
            membership_type_name: '삭제대상',
            remaining_sessions: 1,
            is_active: true,
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('삭제대상')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteMembershipMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleteMembershipMock).toHaveBeenCalledWith(20));
    await waitFor(() => expect(screen.getByText('회원권을 삭제했습니다.')).toBeTruthy());

    confirmSpy.mockRestore();
  });

  it('shows parsed error when delete membership fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMembershipMock.mockRejectedValueOnce(new Error('delete failed'));
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 30,
          membership_type_name: '실패삭제',
          remaining_sessions: 1,
          is_active: true,
          notes: null,
        },
      ],
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('실패삭제')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
