import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerClassDetail from './CustomerClassDetail';

const {
  classGetMyClassDetailMock,
  classGetMyCommentThreadMock,
  classPostMyCommentThreadMock,
  classUpdateMyCommentThreadMessageMock,
  classDeleteMyCommentThreadMessageMock,
  classUpdateMyRegistrationCommentMock,
  parseApiErrorMock,
  navigateMock,
} = vi.hoisted(() => ({
  classGetMyClassDetailMock: vi.fn(),
  classGetMyCommentThreadMock: vi.fn(),
  classPostMyCommentThreadMock: vi.fn(),
  classUpdateMyCommentThreadMessageMock: vi.fn(),
  classDeleteMyCommentThreadMessageMock: vi.fn(),
  classUpdateMyRegistrationCommentMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
  navigateMock: vi.fn(),
}));

let authState: {
  user: { id: number; login_id: string; role: 'admin' | 'customer' } | null;
} = {
  user: { id: 1, login_id: 'customer', role: 'customer' },
};

let routeId = '1';
let locationState: unknown = undefined;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: routeId }),
    useNavigate: () => navigateMock,
    useLocation: () => ({
      pathname: `/classes/${routeId}`,
      search: '',
      hash: '',
      state: locationState,
    }),
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
    updateMyCommentThreadMessage: classUpdateMyCommentThreadMessageMock,
    deleteMyCommentThreadMessage: classDeleteMyCommentThreadMessageMock,
    updateMyRegistrationComment: classUpdateMyRegistrationCommentMock,
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
    locationState = undefined;
    classGetMyClassDetailMock.mockResolvedValue({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'attended',
        registration_comment: '오늘 허리 뻐근함',
        membership_id: 301,
        membership_type_name: '빈야사 20회권',
        membership_created_date: '2026-02-15',
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
    classUpdateMyCommentThreadMessageMock.mockResolvedValue({
      data: {
        id: 6011,
        attendance_id: 9001,
        author_role: 'customer',
        author_user_id: 1,
        message: '수정된 메시지',
        created_at: '2026-03-01T03:00:00.000Z',
      },
    });
    classDeleteMyCommentThreadMessageMock.mockResolvedValue({});
    classUpdateMyRegistrationCommentMock.mockResolvedValue({});
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
    await waitFor(() => expect(screen.getByText('출석')).toBeTruthy());
    expect(screen.getByText('출석')).toBeTruthy();
    expect(screen.getByText('오늘 허리 뻐근함')).toBeTruthy();
    expect(screen.getByText('빈야사 20회권 (지급일 2026년 2월 15일)')).toBeTruthy();
    expect(classGetMyCommentThreadMock).toHaveBeenCalledWith(1);
  });

  it('returns to previous page when navigation state is present', async () => {
    locationState = { from: '/memberships' };

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '이전 페이지로' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지로' }));

    expect(navigateMock).toHaveBeenCalledWith('/memberships');
  });

  it('falls back to home when previous page state is missing', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '이전 페이지로' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지로' }));

    expect(navigateMock).toHaveBeenCalledWith('/');
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
        membership_id: null,
        membership_type_name: null,
        membership_created_date: null,
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
        membership_id: 302,
        membership_type_name: '아쉬탕가 10회권',
        membership_created_date: null,
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('예약')).toBeTruthy());
    expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy();
    expect(screen.getByText('아쉬탕가 10회권')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '대화 전송' })).toBeNull();
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalled();
  });

  it('renders hold status label', async () => {
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'hold',
        registration_comment: null,
        membership_id: 302,
        membership_type_name: '아쉬탕가 10회권',
        membership_created_date: null,
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('보류')).toBeTruthy());
    expect(classGetMyCommentThreadMock).not.toHaveBeenCalled();
  });

  it('saves quick comments, custom comment, and reset in reserved detail view', async () => {
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
    await waitFor(() => expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(classUpdateMyRegistrationCommentMock).toHaveBeenCalledWith(1, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByPlaceholderText('강사에게 전달할 컨디션/주의사항을 입력해 주세요.'), {
      target: { value: '허리가 뻐근합니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '코멘트 저장' }));

    await waitFor(() => expect(classUpdateMyRegistrationCommentMock).toHaveBeenLastCalledWith(1, '월경 중입니다\n허리가 뻐근합니다'));
    expect(screen.getByText('허리가 뻐근합니다')).toBeTruthy();

    fireEvent.click(screen.getByTitle('클릭하면 해당 직접 입력 코멘트 선택이 해제됩니다.'));
    await waitFor(() => expect(classUpdateMyRegistrationCommentMock).toHaveBeenLastCalledWith(1, '월경 중입니다'));

    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(classUpdateMyRegistrationCommentMock).toHaveBeenLastCalledWith(1, ''));
  });

  it('removes quick comment and saves empty direct input in reserved detail view', async () => {
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '빈야사',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'reserved',
        registration_comment: '월경 중입니다',
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));
    await waitFor(() => expect(classUpdateMyRegistrationCommentMock).toHaveBeenCalledWith(1, ''));

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByPlaceholderText('강사에게 전달할 컨디션/주의사항을 입력해 주세요.'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '코멘트 저장' }));

    await waitFor(() => expect(classUpdateMyRegistrationCommentMock).toHaveBeenLastCalledWith(1, ''));
  });

  it('shows comment save error in reserved detail view', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    classUpdateMyRegistrationCommentMock.mockRejectedValueOnce(new Error('save failed'));

    renderPage();
    await waitFor(() => expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
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

  it('edits and deletes only my attendance comment thread message', async () => {
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
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());
    expect(screen.getByText('수정')).toBeTruthy();
    expect(screen.getByText('삭제')).toBeTruthy();

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 메시지'), { target: { value: '수정할 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(classUpdateMyCommentThreadMessageMock).toHaveBeenCalledWith(1, 6011, '수정할 메시지'));
    expect(screen.getByText('수정된 메시지')).toBeTruthy();

    fireEvent.click(screen.getByText('삭제'));
    await waitFor(() => expect(classDeleteMyCommentThreadMessageMock).toHaveBeenCalledWith(1, 6011));
    expect(screen.queryByText('수정된 메시지')).toBeNull();
  });

  it('shows thread edit/delete error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });
    classUpdateMyCommentThreadMessageMock.mockRejectedValueOnce(new Error('thread edit failed'));
    classDeleteMyCommentThreadMessageMock.mockRejectedValueOnce(new Error('thread delete failed'));

    renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 메시지'), { target: { value: '수정 실패 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByText('삭제'));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not save empty edited attendance comment thread message', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 메시지'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(classUpdateMyCommentThreadMessageMock).not.toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
  });

  it('clears edit state when deleting the message currently being edited', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());

    fireEvent.click(screen.getByText('수정'));
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();

    fireEvent.click(screen.getByText('삭제'));
    await waitFor(() => expect(classDeleteMyCommentThreadMessageMock).toHaveBeenCalledWith(1, 6011));
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
    expect(screen.queryByText('내 메시지')).toBeNull();
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

  it('ignores late reserved comment save response after leaving detail', async () => {
    let resolveSave: (value: unknown) => void = () => {};
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
    classUpdateMyRegistrationCommentMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSave = resolve;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));

    routeId = '2';
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: null,
    });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy());

    resolveSave({});
    await Promise.resolve();
    expect(screen.getByText('수업 정보를 찾을 수 없습니다.')).toBeTruthy();
  });

  it('does not overwrite another reserved class detail with stale save response', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '첫 번째 수업',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'reserved',
        registration_comment: null,
      },
    });
    classUpdateMyRegistrationCommentMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSave = resolve;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));

    routeId = '2';
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '두 번째 수업',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        attendance_status: 'reserved',
        registration_comment: '두 번째 코멘트',
      },
    });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('두 번째 코멘트')).toBeTruthy());

    resolveSave({});
    await Promise.resolve();
    expect(screen.getByText('두 번째 코멘트')).toBeTruthy();
  });

  it('ignores stale reserved comment save error after route changes', async () => {
    let rejectSave: (reason?: unknown) => void = () => {};
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 1,
        title: '첫 번째 수업',
        class_date: '2026-03-01',
        start_time: '09:00:00',
        end_time: '10:00:00',
        attendance_status: 'reserved',
        registration_comment: null,
      },
    });
    classUpdateMyRegistrationCommentMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectSave = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('강사에게 전달할 코멘트')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '월경 중입니다' }));

    routeId = '2';
    classGetMyClassDetailMock.mockResolvedValueOnce({
      data: {
        id: 2,
        title: '두 번째 수업',
        class_date: '2026-03-02',
        start_time: '11:00:00',
        end_time: '12:00:00',
        attendance_status: 'reserved',
        registration_comment: '두 번째 코멘트',
      },
    });
    rerender(
      <MemoryRouter>
        <CustomerClassDetail />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('두 번째 코멘트')).toBeTruthy());

    rejectSave(new Error('late save failure'));
    await Promise.resolve();
    expect(screen.queryByText('요청 실패')).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
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

  it('ignores late thread delete error after route changed', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    let rejectDelete: (reason?: unknown) => void = () => {};
    classDeleteMyCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectDelete = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());
    fireEvent.click(screen.getByText('삭제'));

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

    rejectDelete(new Error('old thread delete failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });

  it('ignores late thread edit error after route changed', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    let rejectEdit: (reason?: unknown) => void = () => {};
    classUpdateMyCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectEdit = reject;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());
    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 메시지'), { target: { value: '수정 예정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

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

    rejectEdit(new Error('old thread edit failed'));
    await waitFor(() => expect(screen.queryByText('요청 실패')).toBeNull());
  });

  it('ignores late thread edit response after route changed', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    let resolveEdit: (value: { data: { id: number; attendance_id: number; author_role: string; author_user_id: number; message: string; created_at: string } }) => void = () => {};
    classUpdateMyCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveEdit = resolve as (value: { data: { id: number; attendance_id: number; author_role: string; author_user_id: number; message: string; created_at: string } }) => void;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());
    fireEvent.click(screen.getByText('수정'));
    fireEvent.change(screen.getByDisplayValue('내 메시지'), { target: { value: '수정 예정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

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

    resolveEdit({
      data: {
        id: 6011,
        attendance_id: 9001,
        author_role: 'customer',
        author_user_id: 1,
        message: '늦게 온 수정 응답',
        created_at: '2026-03-01T01:05:00.000Z',
      },
    });
    await waitFor(() => expect(screen.queryByText('늦게 온 수정 응답')).toBeNull());
  });

  it('ignores late thread delete response after route changed', async () => {
    classGetMyCommentThreadMock.mockResolvedValueOnce({
      data: {
        attendance_id: 9001,
        messages: [
          {
            id: 6011,
            attendance_id: 9001,
            author_role: 'customer',
            author_user_id: 1,
            message: '내 메시지',
            created_at: '2026-03-01T01:05:00.000Z',
          },
        ],
      },
    });

    let resolveDelete: (value: unknown) => void = () => {};
    classDeleteMyCommentThreadMessageMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );

    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getByText('내 메시지')).toBeTruthy());
    fireEvent.click(screen.getByText('삭제'));

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

    resolveDelete({});
    await waitFor(() => expect(screen.queryByText('내 메시지')).toBeNull());
    expect(screen.queryByText('요청 실패')).toBeNull();
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
