import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAccountManagement from './AdminAccountManagement';

const {
  getAllMock,
  createMock,
  resetPasswordMock,
  deleteMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  deleteMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
}));

const authState = vi.hoisted(() => ({
  user: { id: 1, login_id: 'admin', role: 'admin' as const },
}));

vi.mock('../services/api', () => ({
  adminAccountAPI: {
    getAll: getAllMock,
    create: createMock,
    resetPassword: resetPasswordMock,
    delete: deleteMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const renderPage = () => render(<AdminAccountManagement />);

describe('AdminAccountManagement page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getAllMock.mockResolvedValue({
      data: [
        { id: 1, login_id: 'admin', created_at: '2026-02-28T00:00:00.000Z' },
        { id: 2, login_id: 'manager', created_at: 'invalid-date' },
      ],
    });
    authState.user = { id: 1, login_id: 'admin', role: 'admin' };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders account list and current-user marker', async () => {
    renderPage();
    expect(await screen.findByText('(내 계정)')).toBeTruthy();
    expect(screen.getByText('-')).toBeTruthy();
    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    expect((deleteButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows load error when fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllMock.mockRejectedValueOnce(new Error('load fail'));
    renderPage();
    await waitFor(() => expect(screen.getByText('관리자 계정 목록을 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('filters list by login id', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('manager')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('로그인 ID 검색'), { target: { value: 'manager' } });
    expect(screen.queryByText('admin')).toBeNull();
    expect(screen.getByText('manager')).toBeTruthy();
  });

  it('validates create form and creates account', async () => {
    createMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 3, login_id: 'ops', created_at: '2026-02-28T00:00:00.000Z' }] });

    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 관리자 계정이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('로그인 ID'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('초기 비밀번호'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '관리자 생성' }));
    await waitFor(() => expect(screen.getByText('로그인 ID는 필수입니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('로그인 ID'), { target: { value: 'ops' } });
    fireEvent.change(screen.getByLabelText('초기 비밀번호'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: '관리자 생성' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('비밀번호는 필수입니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('로그인 ID'), { target: { value: ' ops ' } });
    fireEvent.change(screen.getByLabelText('초기 비밀번호'), { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: '관리자 생성' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({ login_id: 'ops', password: 'abcd' }));
    expect(await screen.findByText('ops')).toBeTruthy();
  });

  it('shows parsed error when create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValueOnce(new Error('create fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('manager')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('로그인 ID'), { target: { value: 'new-admin' } });
    fireEvent.change(screen.getByLabelText('초기 비밀번호'), { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: '관리자 생성' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('resets password with prompt flow', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    promptSpy.mockReturnValueOnce(null).mockReturnValueOnce('   ').mockReturnValueOnce('new-pass');
    resetPasswordMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('manager')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: '비밀번호 재설정' })[1]);
    expect(resetPasswordMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: '비밀번호 재설정' })[1]);
    await waitFor(() => expect(screen.getByText('비밀번호는 비워둘 수 없습니다.')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: '비밀번호 재설정' })[1]);
    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith(2, 'new-pass'));
    expect(alertSpy).toHaveBeenCalled();

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('shows parsed error when password reset fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('new-pass');
    resetPasswordMock.mockRejectedValueOnce(new Error('reset fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('manager')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: '비밀번호 재설정' })[1]);
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    promptSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('deletes account with confirm flow', async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({
        data: [
          { id: 1, login_id: 'admin' },
          { id: 2, login_id: 'manager' },
        ],
      })
      .mockResolvedValueOnce({ data: [{ id: 1, login_id: 'admin' }] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderPage();
    await waitFor(() => expect(screen.getByText('manager')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[1]);
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[1]);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByText('manager')).toBeNull());
    confirmSpy.mockRestore();
  });

  it('shows parsed error when delete fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteMock.mockRejectedValueOnce(new Error('delete fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('manager')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[1]);
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
