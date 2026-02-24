import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MembershipTypeManagement from './MembershipTypeManagement';

const {
  getTypesMock,
  createTypeMock,
  updateTypeMock,
  deactivateTypeMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  getTypesMock: vi.fn(),
  createTypeMock: vi.fn(),
  updateTypeMock: vi.fn(),
  deactivateTypeMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 처리 실패'),
}));

vi.mock('../services/api', () => ({
  membershipAPI: {
    getTypes: getTypesMock,
    createType: createTypeMock,
    updateType: updateTypeMock,
    deactivateType: deactivateTypeMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

describe('MembershipTypeManagement page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getTypesMock.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows load error when initial fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getTypesMock.mockRejectedValueOnce(new Error('load failed'));

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('회원권 관리 목록을 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders empty state when type list is empty', async () => {
    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('운영 중인 회원권 관리 항목이 없습니다.')).toBeTruthy());
  });

  it('creates membership type and clears success message after timeout', async () => {
    createTypeMock.mockResolvedValueOnce(undefined);
    getTypesMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            name: '10회권',
            description: null,
            total_sessions: null,
            is_active: true,
          },
        ],
      });

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('운영 중인 회원권 관리 항목이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '10회권' } });
    fireEvent.change(screen.getByLabelText('총 횟수'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '입문자용' } });
    fireEvent.click(screen.getByRole('button', { name: '종류 추가' }));

    await waitFor(() => expect(createTypeMock).toHaveBeenCalledWith({
      name: '10회권',
      description: '입문자용',
      total_sessions: 10,
    }));

    expect(screen.getByText('회원권 관리 항목을 추가했습니다.')).toBeTruthy();
  });

  it('edits existing type and supports cancel/reset', async () => {
    updateTypeMock.mockResolvedValueOnce(undefined);
    getTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 7,
            name: '프리패스',
            description: '기존 설명',
            total_sessions: null,
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 7,
            name: '프리패스+',
            description: null,
            total_sessions: 20,
            is_active: true,
          },
        ],
      });

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('프리패스')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(screen.getByRole('button', { name: '수정 저장' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '프리패스+' } });
    fireEvent.change(screen.getByLabelText('총 횟수'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => expect(updateTypeMock).toHaveBeenCalledWith(7, {
      name: '프리패스+',
      description: null,
      total_sessions: 20,
    }));

    await waitFor(() => expect(screen.getByText('회원권 관리 정보를 수정했습니다.')).toBeTruthy());
    expect(screen.getByText(/횟수:\s*20/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '수정 저장' })).toBeNull();
  });

  it('shows parsed error when save fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createTypeMock.mockRejectedValueOnce(new Error('save failed'));

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('운영 중인 회원권 관리 항목이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '실패 케이스' } });
    fireEvent.click(screen.getByRole('button', { name: '종류 추가' }));

    await waitFor(() => expect(screen.getByText('요청 처리 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('deactivate flow supports confirm cancel and failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deactivateTypeMock.mockRejectedValueOnce(new Error('deactivate failed'));
    getTypesMock.mockResolvedValue({
      data: [
        {
          id: 3,
          name: '테스트권',
          description: '',
          total_sessions: 3,
          is_active: true,
        },
      ],
    });

    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('테스트권')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '비활성화' }));
    expect(deactivateTypeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '비활성화' }));
    await waitFor(() => expect(deactivateTypeMock).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.getByText('요청 처리 실패')).toBeTruthy());

    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('deactivates successfully and resets edit mode when target is being edited', async () => {
    deactivateTypeMock.mockResolvedValueOnce(undefined);
    getTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 11,
            name: '요가 기본권',
            description: '기본권',
            total_sessions: 8,
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('요가 기본권')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByRole('button', { name: '수정 저장' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '비활성화' }));

    await waitFor(() => expect(deactivateTypeMock).toHaveBeenCalledWith(11));
    await waitFor(() => expect(screen.getByText('회원권 관리 항목을 비활성화했습니다.')).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('button', { name: '수정 저장' })).toBeNull());

    confirmSpy.mockRestore();
  });

  it('keeps total sessions input editable when editing a type', async () => {
    getTypesMock.mockResolvedValueOnce({
      data: [
        {
          id: 15,
          name: '기본 횟수권',
          description: null,
          total_sessions: 4,
          is_active: true,
        },
      ],
    });

    render(<MembershipTypeManagement />);

    await waitFor(() => expect(screen.getByText('기본 횟수권')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    expect((screen.getByLabelText('총 횟수') as HTMLInputElement).value).toBe('4');
  });
});
