import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ClassHistory from './ClassHistory';

const { classGetAllMock } = vi.hoisted(() => ({
  classGetAllMock: vi.fn(),
}));

vi.mock('../services/api', () => ({
  classAPI: {
    getAll: classGetAllMock,
  },
}));

const renderPage = () => render(
  <MemoryRouter>
    <ClassHistory />
  </MemoryRouter>
);

describe('ClassHistory page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows load error when fetching history fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetAllMock.mockRejectedValueOnce(new Error('load failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 전체 내역을 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows empty state when there is no class history', async () => {
    classGetAllMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());
  });

  it('renders grouped classes and supports search', async () => {
    classGetAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          title: '아침 빈야사',
          class_date: '2026-02-10',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 8,
          class_status: 'completed',
          current_enrollment: 6,
          remaining_seats: 2,
        },
        {
          id: 2,
          title: '저녁 하타',
          class_date: '2026-02-11',
          start_time: '18:00:00',
          end_time: '19:00:00',
          max_capacity: 10,
          class_status: 'open',
          current_enrollment: 3,
          remaining_seats: 7,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('2026년 2월')).toBeTruthy());
    expect(screen.getByText('완료')).toBeTruthy();
    expect(screen.getByText('오픈')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('수업명 검색'), { target: { value: '하타' } });

    expect(screen.getByText('저녁 하타')).toBeTruthy();
    expect(screen.queryByText('아침 빈야사')).toBeNull();
  });

  it('supports pagination for long history', async () => {
    const manyClasses = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      title: `수업 ${index + 1}`,
      class_date: '2026-02-12',
      start_time: '09:00:00',
      end_time: '10:00:00',
      max_capacity: 10,
      class_status: 'open' as const,
      current_enrollment: 0,
      remaining_seats: 10,
    }));

    classGetAllMock.mockResolvedValueOnce({ data: manyClasses });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 1')).toBeTruthy());
    expect(screen.queryByText('수업 21')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => expect(screen.getByText('수업 21')).toBeTruthy());
    expect(screen.queryByText('수업 1')).toBeNull();
  });
});
