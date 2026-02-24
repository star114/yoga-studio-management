import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerAttendances from './CustomerAttendances';

const { customerGetAttendancesMock } = vi.hoisted(() => ({
  customerGetAttendancesMock: vi.fn(),
}));

vi.mock('../services/api', () => ({
  customerAPI: {
    getAttendances: customerGetAttendancesMock,
  },
}));

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/customers/:id/attendances" element={<CustomerAttendances />} />
    </Routes>
  </MemoryRouter>
);

describe('CustomerAttendances page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows invalid id message and skips loading', async () => {
    renderAt('/customers/abc/attendances');

    await waitFor(() => expect(screen.getByText('유효하지 않은 고객 ID입니다.')).toBeTruthy());
    expect(customerGetAttendancesMock).not.toHaveBeenCalled();
  });

  it('shows empty state when no attendance exists', async () => {
    customerGetAttendancesMock.mockResolvedValueOnce({
      data: {
        items: [],
        pagination: {
          page: 1,
          page_size: 20,
          total: 0,
          total_pages: 1,
        },
      },
    });

    renderAt('/customers/1/attendances');

    await waitFor(() => expect(screen.getByText('출석 기록이 없습니다.')).toBeTruthy());
    expect(customerGetAttendancesMock).toHaveBeenCalledWith(1, {
      page: 1,
      page_size: 20,
    });
  });

  it('renders attendance data and supports paging API params', async () => {
    customerGetAttendancesMock
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 1,
              attendance_date: '2026-02-10T09:10:00.000Z',
              class_title: '아쉬탕가',
              class_date: '2026-02-10',
              class_start_time: '09:00:00',
              instructor_comment: '호흡이 좋았습니다.',
            },
          ],
          pagination: {
            page: 1,
            page_size: 20,
            total: 21,
            total_pages: 2,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 2,
              attendance_date: '2026-02-11T09:10:00.000Z',
              class_title: '빈야사',
              class_date: '2026-02-11',
              class_start_time: '09:00:00',
              instructor_comment: null,
            },
          ],
          pagination: {
            page: 2,
            page_size: 20,
            total: 21,
            total_pages: 2,
          },
        },
      });

    renderAt('/customers/1/attendances');

    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    expect(screen.getByText(/수업일시:/)).toBeTruthy();
    expect(screen.getByText(/강사 코멘트:/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => expect(screen.getByText('빈야사')).toBeTruthy());
    expect(customerGetAttendancesMock).toHaveBeenLastCalledWith(1, {
      page: 2,
      page_size: 20,
    });
  });

  it('applies month filter when selecting recent 3 months', async () => {
    customerGetAttendancesMock
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 1,
              attendance_date: '2026-02-10T09:10:00.000Z',
              class_title: '아쉬탕가',
              class_date: '2026-02-10',
              class_start_time: '09:00:00',
            },
          ],
          pagination: {
            page: 1,
            page_size: 20,
            total: 1,
            total_pages: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [],
          pagination: {
            page: 1,
            page_size: 20,
            total: 0,
            total_pages: 1,
          },
        },
      });

    renderAt('/customers/1/attendances');

    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '최근 3개월' }));

    await waitFor(() => expect(customerGetAttendancesMock).toHaveBeenLastCalledWith(1, {
      page: 1,
      page_size: 20,
      months: 3,
    }));
  });
});
