import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerClassDetail from './CustomerClassDetail';

const {
  classGetMyClassDetailMock,
  classGetMyCommentThreadMock,
  classPostMyCommentThreadMock,
  parseApiErrorMock,
} = vi.hoisted(() => ({
  classGetMyClassDetailMock: vi.fn(),
  classGetMyCommentThreadMock: vi.fn(),
  classPostMyCommentThreadMock: vi.fn(),
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
    getMyCommentThread: classGetMyCommentThreadMock,
    postMyCommentThread: classPostMyCommentThreadMock,
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
      },
    });
    classGetMyCommentThreadMock.mockResolvedValue({
      data: { attendance_id: 9001, messages: [] },
    });
    classPostMyCommentThreadMock.mockResolvedValue({
      data: {
        id: 6001,
        attendance_id: 9001,
        author_role: 'customer',
        author_user_id: 1,
        message: '새 메시지',
        created_at: '2026-03-01T03:00:00.000Z',
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
    await waitFor(() => expect(screen.getByText('수업 상세 로딩 중...')).toBeTruthy());
    expect(screen.getByText('출석')).toBeTruthy();
    expect(screen.getByText('오늘 허리 뻐근함')).toBeTruthy();
    expect(classGetMyCommentThreadMock).toHaveBeenCalledWith(1);
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
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('결석')).toBeTruthy());
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '대화 전송' })).toBeNull();
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalled();
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
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('예약')).toBeTruthy());
    expect(screen.queryByRole('button', { name: '대화 전송' })).toBeNull();
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalled();
  });

  it('renders loaded attendance comment thread and sends a message', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6010,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 10,
            message: '강사 안내 메시지',
            created_at: '2026-03-01T01:00:00.000Z',
          },
        ],
      },
    });
    classPostMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        id: 6011,
        attendance_id: 9001,
        author_role: 'customer',
        author_user_id: 1,
        message: '수련생 답장',
        created_at: '2026-03-01T01:05:00.000Z',
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('강사 안내 메시지')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '수련생 답장' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));

    await waitFor(() => expect(classPostMyCommentThreadMock).toHaveBeenCalledWith(1, '수련생 답장'));
    expect(screen.getByText('수련생 답장')).toBeTruthy();
  });

  it('falls back to empty thread when thread response has no messages field', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {},
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('아직 대화가 없습니다.')).toBeTruthy());
  });

  it('does not send empty attendance comment thread message', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 전송' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));
    await waitFor(() => expect(classPostMyCommentThreadMock).not.toHaveBeenCalled());
  });

  it('shows thread load/send error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetMyCommentThreadMock.mockRejectedValueOnce(new Error('thread load failed'));

    renderPage();
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());

    classPostMyCommentThreadMock.mockRejectedValueOnce(new Error('thread send failed'));
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '실패 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows thread loading indicator while attendance thread request is pending', async () => {
    classGetMyCommentThreadMock.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await waitFor(() => expect(screen.getByText('대화 불러오는 중...')).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText('수업 상세 로딩 중...')).toBeTruthy());

    routeId = '2';
    classGetMyClassDetailMock.mockRejectedValueOnce(new Error('reload failed'));
    classGetMyCommentThreadMock.mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });

    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(screen.getByText('나의 수업 정보')).toBeTruthy();
  });

  it('ignores late thread response after route changed to another class', async () => {
    let resolveThread: (value: { data: { attendance_id: number; messages: Array<Record<string, unknown>> } }) => void = () => {};
    classGetMyCommentThreadMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveThread = resolve as (value: { data: { attendance_id: number; messages: Array<Record<string, unknown>> } }) => void;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('수업 상세 로딩 중...')).toBeTruthy());

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
      },
    });
    classGetMyCommentThreadMock.mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });

    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    resolveThread({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 9911,
            attendance_id: 9001,
            author_role: 'admin',
            author_user_id: 10,
            message: '늦게 온 클래스1 대화',
            created_at: '2026-03-01T01:00:00.000Z',
          },
        ],
      },
    });

    await waitFor(() => expect(screen.queryByText('늦게 온 클래스1 대화')).toBeNull());
  });

  it('ignores late thread load error after route changed', async () => {
    let rejectThread: (reason?: unknown) => void = () => {};
    classGetMyCommentThreadMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectThread = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('수업 상세 로딩 중...')).toBeTruthy());

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
      },
    });
    classGetMyCommentThreadMock.mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    rejectThread(new Error('old thread load failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });

  it('ignores late thread send error after route changed', async () => {
    let rejectPost: (reason?: unknown) => void = () => {};
    classPostMyCommentThreadMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectPost = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 전송' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '클래스1 실패 예정' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));

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
      },
    });
    classGetMyCommentThreadMock.mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    rejectPost(new Error('old thread send failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });

  it('ignores late thread send response/error after route changed', async () => {
    let resolvePost: (value: { data: { id: number; attendance_id: number; author_role: string; author_user_id: number; message: string; created_at: string } }) => void = () => {};
    let rejectPost: (reason?: unknown) => void = () => {};

    classPostMyCommentThreadMock
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolvePost = resolve as (value: { data: { id: number; attendance_id: number; author_role: string; author_user_id: number; message: string; created_at: string } }) => void;
        })
      )
      .mockImplementationOnce(
        () => new Promise((_, reject) => {
          rejectPost = reject;
        })
      );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '대화 전송' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '클래스1 전송' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));

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
      },
    });
    classGetMyCommentThreadMock.mockResolvedValueOnce({ data: { attendance_id: 9002, messages: [] } });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/아쉬탕가/)).toBeTruthy());

    resolvePost({
      data: {
        id: 9991,
        attendance_id: 9001,
        author_role: 'customer',
        author_user_id: 1,
        message: '늦게 온 클래스1 전송',
        created_at: '2026-03-01T05:00:00.000Z',
      },
    });
    await waitFor(() => expect(screen.queryByText('늦게 온 클래스1 전송')).toBeNull());

    fireEvent.change(screen.getByLabelText('수업 후 코멘트 대화 작성'), { target: { value: '클래스2 실패 전송' } });
    fireEvent.click(screen.getByRole('button', { name: '대화 전송' }));
    rejectPost(new Error('old thread send failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });
});
