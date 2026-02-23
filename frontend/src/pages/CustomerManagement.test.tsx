import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerManagement from './CustomerManagement';

const {
  getAllMock,
  createMock,
  updateMock,
  deleteMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
}));

vi.mock('../services/api', () => ({
  customerAPI: {
    getAll: getAllMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerManagement />
  </MemoryRouter>
);

describe('CustomerManagement page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getAllMock.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows load error when customer list fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllMock.mockRejectedValueOnce(new Error('load failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('고객 목록을 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders empty list state', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 고객이 없습니다.')).toBeTruthy());
    expect(screen.getByText('신규 고객 계정 생성')).toBeTruthy();
  });

  it('validates create form requires phone', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('표시할 고객이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '신규회원' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 생성' }));

    await waitFor(() => expect(createMock).not.toHaveBeenCalled());
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates customer successfully with trimmed phone', async () => {
    createMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            user_id: 10,
            name: '홍길동',
            phone: '010-1234-5678',
            membership_count: 2,
            total_attendance: 12,
          },
        ],
      });

    renderPage();

    await waitFor(() => expect(screen.getByText('표시할 고객이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: ' 010-1234-5678 ' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: 'VIP' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 생성' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({
      name: '홍길동',
      phone: '010-1234-5678',
      notes: 'VIP',
    }));

    expect(await screen.findByText('홍길동')).toBeTruthy();
  });

  it('shows parsed error when create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValueOnce(new Error('create failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('표시할 고객이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '실패회원' } });
    fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: '010-9999-0000' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 생성' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('filters list by search keyword', async () => {
    getAllMock.mockResolvedValueOnce({
      data: [
        { id: 1, user_id: 1, name: '홍길동', phone: '010-1111', membership_count: 1, total_attendance: 2 },
        { id: 2, user_id: 2, name: '김영희', phone: '010-2222', membership_count: 0, total_attendance: 0 },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('홍길동')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('이름/전화번호 검색'), { target: { value: '2222' } });

    expect(screen.queryByText('홍길동')).toBeNull();
    expect(screen.getByText('김영희')).toBeTruthy();
  });

  it('renders zero fallback when membership/attendance stats are null', async () => {
    getAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 3,
          user_id: 3,
          name: '통계없음',
          phone: '010-0000',
          membership_count: null,
          total_attendance: null,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('통계없음')).toBeTruthy());

    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });

  it('starts edit mode, updates customer, and supports cancel', async () => {
    updateMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 5,
            user_id: 100,
            name: '수정대상',
            phone: '010-9999-9999',
            notes: null,
            membership_count: 1,
            total_attendance: 3,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 5,
            user_id: 100,
            name: '수정완료',
            phone: '010-8888-8888',
            membership_count: 1,
            total_attendance: 3,
          },
        ],
      });

    renderPage();

    await waitFor(() => expect(screen.getByText('수정대상')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(screen.getByText('고객 정보 수정')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '수정완료' } });
    fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: ' 010-8888-8888 ' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '정보 저장' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(5, {
      name: '수정완료',
      phone: '010-8888-8888',
      notes: null,
    }));

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByText('신규 고객 계정 생성')).toBeTruthy();
  });

  it('delete flow handles cancel and success including edit-reset', async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 9,
            user_id: 90,
            name: '삭제대상',
            phone: '010-1010',
            membership_count: 0,
            total_attendance: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('삭제대상')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.getByText('표시할 고객이 없습니다.')).toBeTruthy());
    expect(screen.getByText('신규 고객 계정 생성')).toBeTruthy();

    confirmSpy.mockRestore();
  });

  it('shows parsed error when delete fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMock.mockRejectedValueOnce(new Error('delete failed'));
    getAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 11,
          user_id: 11,
          name: '삭제실패',
          phone: '010-3333',
          membership_count: 0,
          total_attendance: 0,
        },
      ],
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('삭제실패')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
