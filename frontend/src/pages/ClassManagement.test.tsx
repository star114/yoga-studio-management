import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ClassManagement, { buildRecurringDates } from './ClassManagement';

const {
  getAllMock,
  createMock,
  deleteMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  deleteMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
}));

vi.mock('../services/api', () => ({
  classAPI: {
    getAll: getAllMock,
    create: createMock,
    delete: deleteMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
}));

const renderPage = () => render(
  <MemoryRouter>
    <ClassManagement />
  </MemoryRouter>
);

describe('ClassManagement page', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    getAllMock.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows load error when fetching classes fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllMock.mockRejectedValueOnce(new Error('load failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 목록을 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows empty list state', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());
  });

  it('validates form fields before submission', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());

    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('수업명은 필수입니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '요가' } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('시작/종료 시간을 입력하세요.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('수업 날짜를 입력하세요.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-02-22' } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '09:00' } });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('종료 시간은 시작 시간보다 늦어야 합니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '11:00' } });
    fireEvent.change(screen.getByLabelText('제한 인원'), { target: { value: '0' } });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('제한 인원은 1명 이상 정수여야 합니다.')).toBeTruthy());

    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates single class successfully', async () => {
    createMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            title: '아침 요가',
            class_date: '2026-02-22',
            start_time: '09:00:00',
            end_time: '10:00:00',
            max_capacity: 12,
            is_open: true,
            class_status: 'open',
            current_enrollment: 2,
            remaining_seats: 10,
          },
        ],
      });

    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '  아침 요가  ' } });
    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-02-22' } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('제한 인원'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('오픈 상태'));
    fireEvent.click(screen.getByLabelText('오픈 상태'));
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '  note  ' } });
    fireEvent.click(screen.getByRole('button', { name: '수업 추가' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({
      title: '아침 요가',
      class_date: '2026-02-22',
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 12,
      is_open: true,
      notes: 'note',
    }));

    await waitFor(() => expect(screen.getByText('수업이 추가되었습니다.')).toBeTruthy());
  });

  it('creates recurring classes and validates recurring form', async () => {
    createMock.mockResolvedValue(undefined);
    getAllMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '반복 요가' } });
    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-02-23' } });
    fireEvent.click(screen.getByLabelText('반복 일정으로 생성'));

    fireEvent.change(screen.getByLabelText('반복 종료 날짜'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('반복 종료 날짜를 입력하세요.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('반복 종료 날짜'), { target: { value: '2026-02-22' } });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('반복 종료 날짜는 시작 날짜보다 같거나 늦어야 합니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('반복 종료 날짜'), { target: { value: '2026-02-24' } });
    ['일', '월', '화', '수', '목', '금', '토'].forEach((label) => {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      if (input.checked) {
        fireEvent.click(input);
      }
    });
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('반복 요일을 1개 이상 선택하세요.')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('월'));
    fireEvent.click(screen.getByLabelText('화'));
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: '반복 요가',
      class_date: '2026-02-23',
    }));
    expect(createMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: '반복 요가',
      class_date: '2026-02-24',
    }));
    await waitFor(() => expect(screen.getByText('반복 수업이 2건 생성되었습니다.')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('반복 일정으로 생성'));
    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '반복 요가2' } });
    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-02-24' } });
    fireEvent.change(screen.getByLabelText('반복 종료 날짜'), { target: { value: '2026-02-24' } });
    ['일', '월', '화', '수', '목', '금', '토'].forEach((label) => {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      if (input.checked) {
        fireEvent.click(input);
      }
    });
    fireEvent.click(screen.getByLabelText('수'));
    fireEvent.submit(screen.getByRole('button', { name: '수업 추가' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('선택한 조건에 맞는 반복 수업 날짜가 없습니다.')).toBeTruthy());

  });

  it('updates recurring end date when start date moves forward and clears weekdays when recurring is off', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-02-25' } });
    fireEvent.click(screen.getByLabelText('반복 일정으로 생성'));
    fireEvent.change(screen.getByLabelText('반복 종료 날짜'), { target: { value: '2026-02-26' } });
    fireEvent.click(screen.getByLabelText('화'));

    fireEvent.change(screen.getByLabelText('수업 날짜'), { target: { value: '2026-03-01' } });
    expect((screen.getByLabelText('반복 종료 날짜') as HTMLInputElement).value).toBe('2026-03-01');

    fireEvent.click(screen.getByLabelText('반복 일정으로 생성'));
    fireEvent.click(screen.getByLabelText('반복 일정으로 생성'));
    expect((screen.getByLabelText('화') as HTMLInputElement).checked).toBe(false);
  });

  it('returns empty recurring dates for invalid ranges', () => {
    expect(buildRecurringDates('invalid', '2026-02-01', [1])).toEqual([]);
    expect(buildRecurringDates('2026-03-02', '2026-03-01', [1])).toEqual([]);
  });

  it('shows parsed error when create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValueOnce(new Error('create failed'));

    renderPage();
    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업명'), { target: { value: '실패수업' } });
    fireEvent.click(screen.getByRole('button', { name: '수업 추가' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());

    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('filters list by search/open-only and shows status badges', async () => {
    getAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          title: '오픈수업',
          class_date: '2026-02-24',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: true,
          class_status: 'open',
          remaining_seats: 0,
        },
        {
          id: 2,
          title: '완료수업',
          class_date: '2026-02-25',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: true,
          class_status: 'completed',
        },
        {
          id: 3,
          title: '진행수업',
          class_date: '2026-02-26',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: true,
          class_status: 'in_progress',
        },
        {
          id: 4,
          title: '닫힘수업',
          class_date: '2026-02-27',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: false,
          class_status: 'closed',
        },
        {
          id: 5,
          title: '기본수업',
          class_date: '2026-02-28',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: true,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('오픈수업')).toBeTruthy());

    expect(screen.getAllByText('오픈').length).toBeGreaterThan(0);
    expect(screen.getByText('완료')).toBeTruthy();
    expect(screen.getByText('진행중')).toBeTruthy();
    expect(screen.getByText('닫힘')).toBeTruthy();
    expect(screen.getByText('기본수업')).toBeTruthy();
    expect(screen.getByText('0자리')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('수업명 검색'), { target: { value: '완료수업' } });
    expect(screen.getByText('완료수업')).toBeTruthy();
    expect(screen.queryByText('오픈수업')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('수업명 검색'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '오픈만 보기' }));
    expect(screen.queryByText('완료수업')).toBeNull();
    expect(screen.getByText('오픈수업')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
    expect(screen.getByText('완료수업')).toBeTruthy();
  });

  it('deletes class with cancel/success and handles delete failure', async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    getAllMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 9,
            title: '삭제수업',
            class_date: '2026-02-28',
            start_time: '09:00:00',
            end_time: '10:00:00',
            max_capacity: 10,
            is_open: true,
            class_status: 'open',
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderPage();
    await waitFor(() => expect(screen.getByText('삭제수업')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.getByText('표시할 수업이 없습니다.')).toBeTruthy());
    expect(screen.getByRole('heading', { name: '수업 추가' })).toBeTruthy();

    confirmSpy.mockRestore();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMock.mockRejectedValueOnce(new Error('delete failed'));
    getAllMock.mockResolvedValueOnce({
      data: [
        {
          id: 10,
          title: '삭제실패',
          class_date: '2026-03-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
          max_capacity: 10,
          is_open: true,
          class_status: 'open',
        },
      ],
    });
    const confirmSpy2 = vi.spyOn(window, 'confirm').mockReturnValue(true);

    cleanup();
    renderPage();
    await waitFor(() => expect(screen.getByText('삭제실패')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy2.mockRestore();
    consoleSpy.mockRestore();
  });

});
