import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MembershipManagement from './MembershipManagement';

const {
  customerGetAllMock,
  membershipGetTypesMock,
  membershipGetByCustomerMock,
  membershipCreateMock,
  membershipUpdateMock,
  membershipDeleteMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  customerGetAllMock: vi.fn(),
  membershipGetTypesMock: vi.fn(),
  membershipGetByCustomerMock: vi.fn(),
  membershipCreateMock: vi.fn(),
  membershipUpdateMock: vi.fn(),
  membershipDeleteMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '처리에 실패했습니다.'),
}));

vi.mock('../services/api', () => ({
  customerAPI: {
    getAll: customerGetAllMock,
  },
  membershipAPI: {
    getTypes: membershipGetTypesMock,
    getByCustomer: membershipGetByCustomerMock,
    create: membershipCreateMock,
    update: membershipUpdateMock,
    delete: membershipDeleteMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

const seedInitSuccess = () => {
  customerGetAllMock.mockResolvedValue({
    data: [
      { id: 1, name: '홍길동', phone: '010-1111-2222' },
      { id: 2, name: '김영희', phone: '010-3333-4444' },
    ],
  });
  membershipGetTypesMock.mockResolvedValue({ data: [{ id: 5, name: '10회권' }] });
};

describe('MembershipManagement page', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    seedInitSuccess();
    membershipGetByCustomerMock.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows initialize error when initial requests fail', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    customerGetAllMock.mockRejectedValueOnce(new Error('init failed'));

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('초기 데이터를 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders no-membership state after load', async () => {
    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());
    expect(membershipGetByCustomerMock).toHaveBeenCalledWith(1);
    expect(screen.getByText('로그인 아이디: 010-1111-2222')).toBeTruthy();
  });

  it('creates membership successfully', async () => {
    membershipCreateMock.mockResolvedValueOnce(undefined);
    membershipGetByCustomerMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 21,
            membership_type_name: '10회권',
            remaining_sessions: null,
            is_active: true,
            notes: null,
          },
        ],
      });

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '특가' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(membershipCreateMock).toHaveBeenCalledWith({
      customer_id: 1,
      membership_type_id: 5,
      notes: '특가',
    }));

    await waitFor(() => expect(screen.getByText('회원권을 지급했습니다.')).toBeTruthy());
  });

  it('shows parsed error when create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    membershipCreateMock.mockRejectedValueOnce(new Error('create failed'));

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(screen.getByText('처리에 실패했습니다.')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('loads memberships and handles loadMemberships failure on customer switch', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    membershipGetByCustomerMock
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('load failed'));

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('고객 선택'), { target: { value: '2' } });

    await waitFor(() => expect(screen.getByText('회원권 목록을 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('edits membership and supports cancel', async () => {
    membershipUpdateMock.mockResolvedValueOnce(undefined);
    membershipGetByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 31,
            membership_type_name: '프리패스',
            remaining_sessions: null,
            is_active: true,
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 31,
            membership_type_name: '프리패스',
            remaining_sessions: 3,
            is_active: false,
            notes: '변경됨',
          },
        ],
      });

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('프리패스')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('잔여 횟수'), { target: { value: '3' } });
    fireEvent.change(document.getElementById('edit-notes-31') as HTMLTextAreaElement, { target: { value: '변경됨' } });
    fireEvent.click(screen.getByLabelText('활성 상태'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(membershipUpdateMock).toHaveBeenCalledWith(31, {
      remaining_sessions: 3,
      is_active: false,
      notes: '변경됨',
    }));

    await waitFor(() => expect(screen.getByText('회원권 정보를 수정했습니다.')).toBeTruthy());
    expect(screen.getByText('비활성')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('renders start/expected end date values when provided', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 71,
          membership_type_name: '날짜표시권',
          remaining_sessions: 4,
          is_active: true,
          start_date: '2026-02-01',
          expected_end_date: '2026-03-01',
          notes: null,
        },
      ],
    });

    render(<MembershipManagement />);
    await waitFor(() => expect(screen.getByText('날짜표시권')).toBeTruthy());
    expect(screen.getByText('시작일: 2026년 2월 1일')).toBeTruthy();
    expect(screen.getByText('예상 종료일: 2026년 3월 1일')).toBeTruthy();
  });

  it('shows parsed error when update fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    membershipUpdateMock.mockRejectedValueOnce(new Error('update failed'));
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 32,
          membership_type_name: '회수권',
          remaining_sessions: 2,
          is_active: true,
          notes: '',
        },
      ],
    });

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('회수권')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('처리에 실패했습니다.')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('delete flow handles confirm cancel and success', async () => {
    membershipDeleteMock.mockResolvedValueOnce(undefined);
    membershipGetByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 41,
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

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('삭제대상')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(membershipDeleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(membershipDeleteMock).toHaveBeenCalledWith(41));
    await waitFor(() => expect(screen.getByText('회원권을 삭제했습니다.')).toBeTruthy());

    confirmSpy.mockRestore();
  });

  it('shows parsed error when delete fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    membershipDeleteMock.mockRejectedValueOnce(new Error('delete failed'));
    membershipGetByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 51,
          membership_type_name: '실패삭제',
          remaining_sessions: 1,
          is_active: true,
          notes: null,
        },
      ],
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('실패삭제')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByText('처리에 실패했습니다.')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('keeps memberships empty when no customers are returned', async () => {
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    membershipGetTypesMock.mockResolvedValueOnce({ data: [] });

    render(<MembershipManagement />);

    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());
    expect(membershipGetByCustomerMock).not.toHaveBeenCalled();
  });

  it('returns early on create submit when no customer is selected', async () => {
    customerGetAllMock.mockResolvedValueOnce({ data: [] });
    membershipGetTypesMock.mockResolvedValueOnce({ data: [{ id: 5, name: '10회권' }] });

    render(<MembershipManagement />);
    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.submit(screen.getByRole('button', { name: '회원권 지급' }).closest('form') as HTMLFormElement);

    expect(membershipCreateMock).not.toHaveBeenCalled();
  });

  it('updates membership with null remaining sessions', async () => {
    membershipUpdateMock.mockResolvedValueOnce(undefined);
    membershipGetByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 61,
            membership_type_name: '정기권',
            remaining_sessions: 2,
            is_active: true,
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 61,
            membership_type_name: '정기권',
            remaining_sessions: null,
            is_active: true,
            notes: null,
          },
        ],
      });

    render(<MembershipManagement />);
    await waitFor(() => expect(screen.getByText('정기권')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('잔여 횟수'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(membershipUpdateMock).toHaveBeenCalledWith(61, {
      remaining_sessions: null,
      is_active: true,
      notes: null,
    }));
  });

  it('clears selected customer when customer selector is changed to empty value', async () => {
    membershipGetByCustomerMock.mockResolvedValueOnce({ data: [] });

    render(<MembershipManagement />);
    await waitFor(() => expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('고객 선택'), { target: { value: '' } });
    expect(screen.queryByText(/로그인 아이디:/)).toBeNull();
  });

});
