import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerClassDetail from './CustomerClassDetail';

const { classGetMyClassDetailMock, parseApiErrorMock } = vi.hoisted(() => ({
  classGetMyClassDetailMock: vi.fn(),
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
