import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerDashboard from './CustomerDashboard';

const {
  attendanceGetAllMock,
  classGetMyRegistrationsMock,
  classGetMyCommentThreadMock,
  updateMyRegistrationCommentMock,
  navigateMock,
  locationMock,
} = vi.hoisted(() => ({
  attendanceGetAllMock: vi.fn(),
  classGetMyRegistrationsMock: vi.fn(),
  classGetMyCommentThreadMock: vi.fn(),
  updateMyRegistrationCommentMock: vi.fn(),
  navigateMock: vi.fn(),
  locationMock: { pathname: '/', search: '', hash: '' },
}));

let customerInfoState: { id: number; name: string; phone: string } | null = {
  id: 1,
  name: '홍길동',
  phone: '010-0000-0000',
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => locationMock,
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    customerInfo: customerInfoState,
  }),
}));

vi.mock('../services/api', () => ({
  attendanceAPI: {
    getAll: attendanceGetAllMock,
  },
  classAPI: {
    getMyRegistrations: classGetMyRegistrationsMock,
    getMyCommentThread: classGetMyCommentThreadMock,
    updateMyRegistrationComment: updateMyRegistrationCommentMock,
  },
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerDashboard />
  </MemoryRouter>
);

const attendancePageResponse = (
  items: Array<Record<string, unknown>>,
  options?: { total?: number; offset?: number }
) => ({
  data: {
    items,
    total: options?.total ?? items.length,
    limit: 5,
    offset: options?.offset ?? 0,
    has_more: (options?.offset ?? 0) + items.length < (options?.total ?? items.length),
  },
});

describe('CustomerDashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerInfoState = { id: 1, name: '홍길동', phone: '010-0000-0000' };
    updateMyRegistrationCommentMock.mockResolvedValue({});
    classGetMyCommentThreadMock.mockResolvedValue({ data: { messages: [] } });
  });

  afterEach(() => {
    cleanup();
  });

  it('stays in loading state when customer info is missing', () => {
    customerInfoState = null;
    renderPage();
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect(attendanceGetAllMock).not.toHaveBeenCalled();
  });

  it('renders empty summaries when no upcoming or attendance data', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));
    expect(screen.getByText('예정된 수업이 없습니다')).toBeTruthy();
    expect(screen.getByText('최근 출석 수업이 없습니다.')).toBeTruthy();
    expect(screen.queryByText('수업 후 코멘트 대화')).toBeNull();
    expect(attendanceGetAllMock).toHaveBeenCalledWith({ customer_id: 1, limit: 5, offset: 0 });
    expect(classGetMyRegistrationsMock).toHaveBeenCalled();
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalled();
  });

  it('falls back safely when paginated attendance payload is sparse', async () => {
    attendanceGetAllMock.mockResolvedValueOnce({ data: {} });
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업이 없습니다.')).toBeTruthy());
    expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0);
  });

  it('falls back safely when a later attendance page payload is sparse', async () => {
    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '첫 출석', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '둘째 출석', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '셋째 출석', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '넷째 출석', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '다섯째 출석', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockResolvedValueOnce({ data: {} });
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /첫 출석/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByText('최근 출석 수업이 없습니다.')).toBeTruthy());
  });

  it('renders nearest class and hydrates saved comments', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 10,
          class_id: 5,
          attendance_status: 'reserved',
          title: '먼 미래 수업',
          class_date: '2099-12-30',
          start_time: '09:00:00',
          end_time: '10:00:00',
          is_open: true,
        },
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '가장 가까운 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
          registration_comment: '월경 중입니다\n어깨가 뻐근해요',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('가장 가까운 수업')).toBeTruthy());
    expect(screen.queryByText('먼 미래 수업')).toBeNull();
    expect(screen.getByText('월경 중입니다')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('어깨가 뻐근해요')).toBeTruthy());
    expect(screen.getByRole('button', { name: '초기화' })).toBeTruthy();
  });

  it('keeps attendance history visible when upcoming-class loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
      { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '출석 수업', class_date: '2026-03-06' },
    ]));
    classGetMyRegistrationsMock.mockRejectedValueOnce(new Error('registration fail'));

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    expect(screen.getByRole('button', { name: /출석 수업/ })).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('saves quick comments, custom comment chip, and reset', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenCalledWith(6, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByPlaceholderText(/강사에게 전달할 컨디션/), {
      target: { value: '허리가 뻐근합니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '코멘트 저장' }));

    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, '월경 중입니다\n허리가 뻐근합니다'));
    expect(screen.getByText('허리가 뻐근합니다')).toBeTruthy();

    fireEvent.click(screen.getByTitle('클릭하면 해당 직접 입력 코멘트 선택이 해제됩니다.'));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, ''));
  });

  it('shows recent attendances and navigates only when class exists', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
        {
          id: 1,
          class_id: null,
          attendance_date: '2026-03-01T10:00:00.000Z',
          class_title: '기록 전용 수업',
          class_date: '2026-03-01',
          class_start_time: '10:00:00',
        },
        {
          id: 2,
          class_id: 22,
          attendance_date: '2026-03-02T10:00:00.000Z',
          class_title: '이동 가능한 수업',
          class_date: '2026-03-02',
          class_start_time: '10:00:00',
        },
      ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    const disabledBtn = screen.getByRole('button', { name: /기록 전용 수업/ });
    const enabledBtn = screen.getByRole('button', { name: /이동 가능한 수업/ });

    expect(disabledBtn).toHaveProperty('disabled', true);
    fireEvent.click(enabledBtn);
    expect(navigateMock).toHaveBeenCalledWith('/classes/22', { state: { from: '/' } });
  });

  it('paginates all recent attendances instead of limiting to three cards', async () => {
    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 6, class_id: 106, attendance_date: '2026-03-01T10:00:00.000Z', class_title: '첫째 수업', class_date: '2026-03-01' },
      ], { total: 6, offset: 5 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6, offset: 0 }));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    expect(attendanceGetAllMock).toHaveBeenNthCalledWith(1, { customer_id: 1, limit: 5, offset: 0 });
    expect(screen.getByText('6개 중 1-5개')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /여섯째 수업/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /둘째 수업/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /첫째 수업/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => expect(screen.getByText('6개 중 6-6개')).toBeTruthy());
    expect(attendanceGetAllMock).toHaveBeenNthCalledWith(2, { customer_id: 1, limit: 5, offset: 5 });
    expect(screen.getByText('2 / 2')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /첫째 수업/ })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /여섯째 수업/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    await waitFor(() => expect(screen.getByText('6개 중 1-5개')).toBeTruthy());
    expect(attendanceGetAllMock).toHaveBeenNthCalledWith(3, { customer_id: 1, limit: 5, offset: 0 });
  });

  it('loads comment threads only for the visible attendance page', async () => {
    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 6, class_id: 106, attendance_date: '2026-03-01T10:00:00.000Z', class_title: '첫째 수업', class_date: '2026-03-01' },
      ], { total: 6, offset: 5 }));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    await waitFor(() => expect(classGetMyCommentThreadMock).toHaveBeenCalledTimes(5));
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalledWith(106);

    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => expect(classGetMyCommentThreadMock).toHaveBeenCalledWith(106));
    expect(classGetMyCommentThreadMock).toHaveBeenCalledTimes(6);
  });

  it('does not reload page 1 when the same customer context object changes', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
      { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '같은 페이지 수업', class_date: '2026-03-06' },
    ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    const view = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /같은 페이지 수업/ })).toBeTruthy());
    expect(attendanceGetAllMock).toHaveBeenCalledTimes(1);

    customerInfoState = { id: 1, name: '홍길동', phone: '010-1111-2222' };
    view.rerender(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /같은 페이지 수업/ })).toBeTruthy());
    expect(attendanceGetAllMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the current attendance page stable when the same customer context object changes', async () => {
    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 6, class_id: 106, attendance_date: '2026-03-01T10:00:00.000Z', class_title: '첫째 수업', class_date: '2026-03-01' },
      ], { total: 6, offset: 5 }));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    const view = renderPage();

    await waitFor(() => expect(screen.getByText('1 / 2')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('button', { name: /첫째 수업/ })).toBeTruthy());
    expect(attendanceGetAllMock).toHaveBeenCalledTimes(2);

    customerInfoState = { id: 1, name: '홍길동', phone: '010-1111-2222' };
    view.rerender(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('2 / 2')).toBeTruthy());
    expect(screen.getByRole('button', { name: /첫째 수업/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /여섯째 수업/ })).toBeNull();
    expect(attendanceGetAllMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a cancelled attendance page response after leaving the page', async () => {
    let resolveNextPage: (value: unknown) => void = () => {};
    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNextPage = resolve;
      }));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    cleanup();

    resolveNextPage(attendancePageResponse([
      { id: 6, class_id: 106, attendance_date: '2026-03-01T10:00:00.000Z', class_title: '첫째 수업', class_date: '2026-03-01' },
    ], { total: 6, offset: 5 }));

    await Promise.resolve();
    expect(screen.queryByText('첫째 수업')).toBeNull();
  });

  it('ignores late thread responses from a previous attendance page', async () => {
    let resolveFirstPageThread: (value: unknown) => void = () => {};
    classGetMyCommentThreadMock
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirstPageThread = resolve;
        })
      )
      .mockResolvedValue({ data: { messages: [] } });

    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 6, class_id: 106, attendance_date: '2026-03-01T10:00:00.000Z', class_title: '첫째 수업', class_date: '2026-03-01' },
      ], { total: 6, offset: 5 }));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    resolveFirstPageThread({
      data: {
        messages: [
          { id: 11, author_role: 'admin', message: '이전 페이지 응답', created_at: '2026-03-06T11:00:00.000Z' },
        ],
      },
    });

    await Promise.resolve();
    expect(screen.queryByText('이전 페이지 응답')).toBeNull();
  });

  it('retries thread loading when a previous page request was cancelled before completion', async () => {
    let resolveFirstPageThread: (value: unknown) => void = () => {};
    classGetMyCommentThreadMock.mockImplementation((classId: number) => {
      if (classId === 101 && classGetMyCommentThreadMock.mock.calls.filter(([id]) => id === 101).length === 1) {
        return new Promise((resolve) => {
          resolveFirstPageThread = resolve;
        });
      }

      if (classId === 101) {
        return Promise.resolve({
          data: {
            messages: [
              { id: 31, author_role: 'admin', message: '다시 불러온 응답', created_at: '2026-03-06T11:00:00.000Z' },
            ],
          },
        });
      }

      return Promise.resolve({ data: { messages: [] } });
    });

    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 6, class_id: 106, attendance_date: '2026-03-01T10:00:00.000Z', class_title: '첫째 수업', class_date: '2026-03-01' },
      ], { total: 6, offset: 5 }))
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '여섯째 수업', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '다섯째 수업', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '넷째 수업', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '셋째 수업', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-02' },
      ], { total: 6, offset: 0 }));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    resolveFirstPageThread({
      data: {
        messages: [
          { id: 11, author_role: 'admin', message: '취소된 이전 응답', created_at: '2026-03-06T11:00:00.000Z' },
        ],
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    fireEvent.click(screen.getByRole('button', { name: '이전' }));

    await waitFor(() => expect(classGetMyCommentThreadMock.mock.calls.filter(([id]) => id === 101)).toHaveLength(2));
    await waitFor(() => expect(screen.getByText('다시 불러온 응답')).toBeTruthy());
  });

  it('embeds class comment conversations in attended class cards', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
        {
          id: 1,
          class_id: 101,
          attendance_date: '2026-03-01T10:00:00.000Z',
          class_title: 'A 수업',
          class_date: '2026-03-01',
        },
        {
          id: 2,
          class_id: 102,
          attendance_date: '2026-03-02T10:00:00.000Z',
          class_title: null,
          class_type: '개인 레슨',
          class_date: '2026-03-02',
        },
      ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });
    classGetMyCommentThreadMock
      .mockResolvedValueOnce({
        data: {
          messages: [
            { id: 1, author_role: 'customer', message: '질문', created_at: '2026-03-01T11:00:00.000Z' },
            { id: 2, author_role: 'admin', message: '강사 답변', created_at: '2026-03-01T12:00:00.000Z' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          messages: [
            { id: 3, author_role: 'customer', message: '확인했어요', created_at: '2026-03-02T12:00:00.000Z' },
          ],
        },
      });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('질문')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('강사 답변')).toBeTruthy());
    expect(screen.getByText('확인했어요')).toBeTruthy();
    expect(screen.getAllByText('수업 후 코멘트 대화').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /A 수업/ }));
    expect(navigateMock).toHaveBeenCalledWith('/classes/101', { state: { from: '/' } });
  });

  it('handles attendance load failure and comment save failure without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    attendanceGetAllMock.mockRejectedValueOnce(new Error('load fail'));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('예정된 수업이 없습니다')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();

    cleanup();
    attendanceGetAllMock
      .mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 101, attendance_date: '2026-03-06T10:00:00.000Z', class_title: '첫 출석', class_date: '2026-03-06' },
        { id: 2, class_id: 102, attendance_date: '2026-03-05T10:00:00.000Z', class_title: '둘째 출석', class_date: '2026-03-05' },
        { id: 3, class_id: 103, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '셋째 출석', class_date: '2026-03-04' },
        { id: 4, class_id: 104, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '넷째 출석', class_date: '2026-03-03' },
        { id: 5, class_id: 105, attendance_date: '2026-03-02T10:00:00.000Z', class_title: '다섯째 출석', class_date: '2026-03-02' },
      ], { total: 6 }))
      .mockRejectedValueOnce(new Error('page fail'));
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });
    updateMyRegistrationCommentMock.mockRejectedValueOnce(new Error('save fail'));

    renderPage();

    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));

    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenCalled());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('ignores failed thread summary call and handles no class-id branch', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
        {
          id: 1,
          class_id: null,
          attendance_date: '2026-03-01T10:00:00.000Z',
          class_title: null,
          class_type: null,
          class_date: null,
        },
      ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    expect(await screen.findByRole('button', { name: /수업 기록/ })).toBeTruthy();
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalled();
    expect(screen.queryByText('수업 후 코멘트 대화')).toBeNull();

    cleanup();
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
        {
          id: 2,
          class_id: 333,
          attendance_date: '2026-03-02T10:00:00.000Z',
          class_title: '스레드 실패 수업',
          class_date: '2026-03-02',
        },
      ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });
    classGetMyCommentThreadMock.mockRejectedValueOnce(new Error('thread fail'));

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    await waitFor(() => expect(classGetMyCommentThreadMock).toHaveBeenCalledWith(333));
    expect(screen.queryByText('수업 후 코멘트 대화')).toBeNull();
  });

  it('toggles quick comment off and saves empty direct input', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({
      data: [
        {
          registration_id: 11,
          class_id: 6,
          attendance_status: 'reserved',
          title: '다음 수업',
          class_date: '2099-01-01',
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_open: true,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getAllByText('다음 수업').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, '월경 중입니다'));
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, ''));

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.click(screen.getByRole('button', { name: '코멘트 저장' }));
    await waitFor(() => expect(updateMyRegistrationCommentMock).toHaveBeenLastCalledWith(6, ''));
  });

  it('embeds pending conversation message on each matching attendance card', async () => {
    classGetMyCommentThreadMock
      .mockResolvedValueOnce({
        data: {
          messages: [
            { id: 11, author_role: 'admin', message: '먼저 답변', created_at: '2026-03-03T09:00:00.000Z' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          messages: [
            { id: 21, author_role: 'admin', message: '나중 답변', created_at: '2026-03-04T12:00:00.000Z' },
          ],
        },
      });

    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
        { id: 1, class_id: 201, attendance_date: '2026-03-03T10:00:00.000Z', class_title: '첫 수업', class_date: '2026-03-03' },
        { id: 2, class_id: 202, attendance_date: '2026-03-04T10:00:00.000Z', class_title: '둘째 수업', class_date: '2026-03-04' },
      ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });

    renderPage();
    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    expect(await screen.findByText('먼저 답변')).toBeTruthy();
    expect(screen.getByText('나중 답변')).toBeTruthy();
  });

  it('uses class id/title-date fallbacks when thread metadata is sparse', async () => {
    attendanceGetAllMock.mockResolvedValueOnce(attendancePageResponse([
        {
          id: 1,
          class_id: 444,
          attendance_date: '',
          class_title: null,
          class_type: null,
          class_date: '',
        },
        {
          id: 2,
          class_id: 445,
          attendance_date: '2026-03-04T10:00:00.000Z',
          class_title: '빈 메시지 수업',
          class_date: '2026-03-04',
        },
      ]));
    classGetMyRegistrationsMock.mockResolvedValueOnce({ data: [] });
    classGetMyCommentThreadMock
      .mockResolvedValueOnce({
        data: { messages: [{ id: 1, author_role: 'admin', message: '후속 확인 부탁해요', created_at: '2026-03-03T11:00:00.000Z' }] },
      })
      .mockResolvedValueOnce({ data: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText('최근 출석 수업')).toBeTruthy());
    expect(await screen.findByRole('button', { name: /수업 기록/ })).toBeTruthy();
    expect(screen.getByText('후속 확인 부탁해요')).toBeTruthy();
    const attendanceCard = screen.getByRole('button', { name: /빈 메시지 수업/ });
    expect(within(attendanceCard).queryByText('후속 확인 부탁해요')).toBeNull();
  });
});
