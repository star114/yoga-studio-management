import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerClassDetail from './CustomerClassDetail';

const { classGetMyClassDetailMock, classUpdateMyAttendanceCommentMock, parseApiErrorMock } = vi.hoisted(() => ({
  classGetMyClassDetailMock: vi.fn(),
  classUpdateMyAttendanceCommentMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
}));

let authState: {
  user: { id: number; login_id: string; role: 'admin' | 'customer' } | null;
} = {
  user: { id: 1, login_id: 'customer', role: 'customer' },
};

let routeId = '1';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: routeId }),
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../services/api', () => ({
  classAPI: {
    getMyClassDetail: classGetMyClassDetailMock,
    updateMyAttendanceComment: classUpdateMyAttendanceCommentMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerClassDetail />
  </MemoryRouter>
);

describe('CustomerClassDetail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authState = { user: { id: 1, login_id: 'customer', role: 'customer' } };
    routeId = '1';
    classGetMyClassDetailMock.mockResolvedValue({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'attended',
        registration_comment: '오늘 허리 뻐근함',
        instructor_comment: '호흡 안정적',
        customer_comment: '오늘 컨디션 좋아요',
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects non-customer user', () => {
    authState = { user: { id: 9, login_id: 'admin', role: 'admin' } };
    renderPage();
    expect(classGetMyClassDetailMock).not.toHaveBeenCalled();
  });

  it('shows invalid route error for bad class id', async () => {
    routeId = 'abc';
    renderPage();

    await waitFor(() => expect(screen.getByText('유효하지 않은 수업 경로입니다.')).toBeTruthy());
    expect(classGetMyClassDetailMock).not.toHaveBeenCalled();
  });

  it('renders class detail values', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('수업 상세')).toBeTruthy());
    expect(screen.getByText('출석')).toBeTruthy();
    expect(screen.getByText('오늘 허리 뻐근함')).toBeTruthy();
    expect(screen.getByText('호흡 안정적')).toBeTruthy();
    expect((screen.getByLabelText('나의 출석 코멘트') as HTMLTextAreaElement).value).toBe('오늘 컨디션 좋아요');
  });

  it('renders absent status and fallback comments', async () => {
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'absent',
        registration_comment: null,
        instructor_comment: null,
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('결석')).toBeTruthy());
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '출석 코멘트 저장' })).toBeNull();
  });

  it('renders reserved status label', async () => {
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'reserved',
        registration_comment: null,
        instructor_comment: null,
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('예약')).toBeTruthy());
    expect(screen.queryByRole('button', { name: '출석 코멘트 저장' })).toBeNull();
  });

  it('saves attendance comment for attended class', async () => {
    classUpdateMyAttendanceCommentMock.mockResolvedValueOnce({
      data: { customer_comment: '업데이트 코멘트' },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '출석 코멘트 저장' })).toBeTruthy());

    const textarea = screen.getByLabelText('나의 출석 코멘트') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '업데이트 코멘트' } });
    fireEvent.click(screen.getByRole('button', { name: '출석 코멘트 저장' }));

    await waitFor(() => expect(classUpdateMyAttendanceCommentMock).toHaveBeenCalledWith(1, '업데이트 코멘트'));
    await waitFor(() => expect(screen.getByText('출석 코멘트를 저장했습니다.')).toBeTruthy());
  });

  it('normalizes empty saved attendance comment to empty textarea', async () => {
    classUpdateMyAttendanceCommentMock.mockResolvedValueOnce({
      data: {},
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '출석 코멘트 저장' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('나의 출석 코멘트'), { target: { value: '임시 코멘트' } });
    fireEvent.click(screen.getByRole('button', { name: '출석 코멘트 저장' }));

    await waitFor(() => expect(classUpdateMyAttendanceCommentMock).toHaveBeenCalledWith(1, '임시 코멘트'));
    await waitFor(() => expect((screen.getByLabelText('나의 출석 코멘트') as HTMLTextAreaElement).value).toBe(''));
  });

  it('shows save error when attendance comment update fails', async () => {
    classUpdateMyAttendanceCommentMock.mockRejectedValueOnce(new Error('save failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '출석 코멘트 저장' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '출석 코멘트 저장' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('ignores late save response after route changed to another class', async () => {
    let resolveSave: (value: { data: { customer_comment: string } }) => void = () => {};
    classUpdateMyAttendanceCommentMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSave = resolve as (value: { data: { customer_comment: string } }) => void;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('수업 상세')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('나의 출석 코멘트'), { target: { value: '클래스1 저장값' } });
    fireEvent.click(screen.getByRole('button', { name: '출석 코멘트 저장' }));

    routeId = '2';
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '아쉬탕가',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        attendance_status: 'attended',
        registration_comment: '두번째 수업',
        instructor_comment: '좋습니다',
        customer_comment: '클래스2 기존값',
      },
    });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    resolveSave({ data: { customer_comment: '늦게 온 클래스1 응답' } });
    await waitFor(() => expect((screen.getByLabelText('나의 출석 코멘트') as HTMLTextAreaElement).value).toBe('클래스2 기존값'));
    expect(screen.queryByText('출석 코멘트를 저장했습니다.')).toBeNull();
  });

  it('shows API error fallback', async () => {
    classGetMyClassDetailMock.mockRejectedValueOnce(new Error('failed'));
    renderPage();
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
  });

  it('shows default not-found message when API returns empty detail', async () => {
    classGetMyClassDetailMock.mockResolvedValueOnce({ data: null });
    renderPage();
    await waitFor(() => expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy());
  });

  it('keeps detail and shows error banner when a later reload fails', async () => {
    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('수업 상세')).toBeTruthy());

    routeId = '2';
    classGetMyClassDetailMock.mockRejectedValueOnce(new Error('reload failed'));

    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(screen.getByText('나의 수업 정보')).toBeTruthy();
  });
});
