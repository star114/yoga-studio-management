import React from 'react';
import { AxiosError } from 'axios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerDetail from './CustomerDetail';

const {
  getByIdMock,
  getClassActivitiesMock,
  getRecommendedClassesMock,
  classCancelRegistrationMock,
  classUpdateRegistrationStatusMock,
  updateCustomerMock,
  resetPasswordMock,
  getTypesMock,
  getByCustomerMock,
  classRegisterMock,
  createMembershipMock,
  updateMembershipMock,
  deleteMembershipMock,
  parseApiErrorMock,
  shouldConfirmCrossMembershipRegistrationMock,
  getCrossMembershipConfirmationMessageMock,
} = vi.hoisted(() => ({
  getByIdMock: vi.fn(),
  getClassActivitiesMock: vi.fn(),
  getRecommendedClassesMock: vi.fn(),
  classCancelRegistrationMock: vi.fn(),
  classUpdateRegistrationStatusMock: vi.fn(),
  updateCustomerMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  getTypesMock: vi.fn(),
  getByCustomerMock: vi.fn(),
  classRegisterMock: vi.fn(),
  createMembershipMock: vi.fn(),
  updateMembershipMock: vi.fn(),
  deleteMembershipMock: vi.fn(),
  parseApiErrorMock: vi.fn(() => '요청 실패'),
  shouldConfirmCrossMembershipRegistrationMock: vi.fn(() => false),
  getCrossMembershipConfirmationMessageMock: vi.fn(() => '회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.'),
}));

let routeId = '1';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: routeId }),
  };
});

vi.mock('../services/api', () => ({
  customerAPI: {
    getById: getByIdMock,
    getClassActivities: getClassActivitiesMock,
    getRecommendedClasses: getRecommendedClassesMock,
    update: updateCustomerMock,
    resetPassword: resetPasswordMock,
  },
  classAPI: {
    register: classRegisterMock,
    cancelRegistration: classCancelRegistrationMock,
    updateRegistrationStatus: classUpdateRegistrationStatusMock,
  },
  membershipAPI: {
    getTypes: getTypesMock,
    getByCustomer: getByCustomerMock,
    create: createMembershipMock,
    update: updateMembershipMock,
    delete: deleteMembershipMock,
  },
}));

vi.mock('../utils/apiError', () => ({
  parseApiError: parseApiErrorMock,
  shouldConfirmCrossMembershipRegistration: shouldConfirmCrossMembershipRegistrationMock,
  getCrossMembershipConfirmationMessage: getCrossMembershipConfirmationMessageMock,
}));

const renderPage = () => render(
  <MemoryRouter>
    <CustomerDetail />
  </MemoryRouter>
);

const seedLoadSuccess = () => {
  getByIdMock.mockResolvedValue({
    data: {
      customer: {
        id: 1,
        name: '홍길동',
        phone: '010-1111-2222',
        notes: '메모',
      },
      recentAttendances: [],
    },
  });
  getClassActivitiesMock.mockResolvedValue({
    data: {
      items: [],
      pagination: { page: 1, page_size: 10, total: 0, total_pages: 1 },
    },
  });
  getRecommendedClassesMock.mockResolvedValue({ data: [] });
  getTypesMock.mockResolvedValue({ data: [{ id: 5, name: '10회권' }] });
  getByCustomerMock.mockResolvedValue({ data: [] });
};

describe('CustomerDetail page', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    routeId = '1';
    seedLoadSuccess();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows invalid id error', async () => {
    routeId = 'abc';
    renderPage();

    await waitFor(() => expect(screen.getByText('유효하지 않은 고객 ID입니다.')).toBeTruthy());
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it('shows load error when initialization fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getByIdMock.mockRejectedValueOnce(new Error('load failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('고객 상세 정보를 불러오지 못했습니다.')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders fallback when customer is missing', async () => {
    getByIdMock.mockResolvedValueOnce({ data: { customer: null } });

    renderPage();

    await waitFor(() => expect(screen.getByText('고객을 찾을 수 없습니다.')).toBeTruthy());
  });

  it('renders fallback profile fields when optional values are absent', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '옵션없음',
          phone: '010-0000-0000',
          notes: null,
        },
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('옵션없음')).toBeTruthy());
    expect(screen.queryByText('생년월일:')).toBeNull();
    expect(screen.queryByText('성별:')).toBeNull();
    expect(screen.queryByText('주소:')).toBeNull();
  });

  it('handles missing recentAttendances and null notes in edit/cancel forms', async () => {
    getByIdMock.mockResolvedValueOnce({
      data: {
        customer: {
          id: 1,
          name: '메모없음',
          phone: '010-1212-3434',
          notes: null,
        },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('메모없음')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    expect((screen.getByLabelText('고객 메모') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    expect((screen.getByLabelText('고객 메모') as HTMLTextAreaElement).value).toBe('');
  });

  it('renders detail info and empty memberships state', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('고객 상세')).toBeTruthy());
    expect(screen.getByText('홍길동')).toBeTruthy();
    expect(screen.getByText(/메모:/)).toBeTruthy();
    expect(screen.getByText('등록된 회원권이 없습니다.')).toBeTruthy();
    expect(screen.getByText('수업 기록이 없습니다.')).toBeTruthy();
  });

  it('paginates memberships with numbered buttons in customer detail', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        { id: 201, membership_type_name: '상세 회원권 1', remaining_sessions: 10, is_active: true, notes: null },
        { id: 202, membership_type_name: '상세 회원권 2', remaining_sessions: 9, is_active: true, notes: null },
        { id: 203, membership_type_name: '상세 회원권 3', remaining_sessions: 8, is_active: true, notes: null },
        { id: 204, membership_type_name: '상세 회원권 4', remaining_sessions: 7, is_active: true, notes: null },
        { id: 205, membership_type_name: '상세 회원권 5', remaining_sessions: 6, is_active: true, notes: null },
        { id: 206, membership_type_name: '상세 회원권 6', remaining_sessions: 5, is_active: true, notes: null },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('상세 회원권 1')).toBeTruthy());
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2' })).toBeTruthy();
    expect(screen.queryByText('상세 회원권 6')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(screen.getByText('상세 회원권 6')).toBeTruthy());
    expect(screen.queryByText('상세 회원권 1')).toBeNull();
  });

  it('edits customer info in detail page and supports cancel', async () => {
    updateCustomerMock.mockResolvedValueOnce(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));

    fireEvent.change(screen.getByLabelText('고객 이름'), { target: { value: '홍길순' } });
    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: ' 010-9999-8888 ' } });
    fireEvent.change(screen.getByLabelText('고객 메모'), { target: { value: '새 메모' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 정보 저장' }));

    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalledWith(1, {
      name: '홍길순',
      phone: '010-9999-8888',
      notes: '새 메모',
    }));
    await waitFor(() => expect(screen.getByText('고객 정보를 수정했습니다.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    fireEvent.change(screen.getByLabelText('고객 이름'), { target: { value: '변경전취소' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '고객 정보 저장' })).toBeNull();
  });

  it('formats plain phone digits while editing customer detail', async () => {
    updateCustomerMock.mockResolvedValueOnce(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));

    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: '01000000000' } });
    expect((screen.getByLabelText('고객 전화번호') as HTMLInputElement).value).toBe('010-0000-0000');

    fireEvent.click(screen.getByRole('button', { name: '고객 정보 저장' }));

    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalledWith(1, {
      name: '홍길동',
      phone: '010-0000-0000',
      notes: '메모',
    }));
  });

  it('validates required phone in customer edit and shows update error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    updateCustomerMock.mockRejectedValueOnce(new Error('update failed'));

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));

    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: '고객 정보 저장' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('전화번호는 필수입니다.')).toBeTruthy());
    expect(updateCustomerMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('고객 전화번호'), { target: { value: '010-3333-4444' } });
    fireEvent.submit(screen.getByRole('button', { name: '고객 정보 저장' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders attended, reserved, and absent activities together', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'attended',
            activity_id: 101,
            class_id: 201,
            class_title: '아쉬탕가',
            class_date: '2026-02-20',
            class_start_time: '09:00:00',
          },
          {
            activity_type: 'reserved',
            activity_id: 102,
            class_id: 202,
            class_title: '빈야사',
            class_date: '2026-02-21',
            class_start_time: '10:00:00',
          },
          {
            activity_type: 'absent',
            activity_id: 103,
            class_id: 203,
            class_title: '하타',
            class_date: '2026-02-22',
            class_start_time: '11:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 3, total_pages: 1 },
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('수업 기록 (출석/예약/결석)')).toBeTruthy());
    expect(screen.getByText('아쉬탕가')).toBeTruthy();
    expect(screen.getByText('빈야사')).toBeTruthy();
    expect(screen.getByText('하타')).toBeTruthy();
    expect(screen.getByText('출석')).toBeTruthy();
    expect(screen.getByText('예약')).toBeTruthy();
    expect(screen.getByText('결석')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: '예약 취소' })).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: '결석 처리' })).toHaveLength(1);
  });

  it('applies activity filters from modal and requests filtered page', async () => {
    getClassActivitiesMock
      .mockResolvedValueOnce({
        data: {
          items: [],
          pagination: { page: 1, page_size: 10, total: 0, total_pages: 1 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              activity_type: 'reserved',
              activity_id: 501,
              class_title: '테스트 수업',
              class_date: '2026-03-01',
              class_start_time: '11:00:00',
            },
          ],
          pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
        },
      });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '필터' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'reserved' } });
    fireEvent.change(screen.getByLabelText('수업명 검색'), { target: { value: '테스트' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    await waitFor(() => expect(getClassActivitiesMock).toHaveBeenLastCalledWith(1, {
      page: 1,
      page_size: 10,
      activity_type: 'reserved',
      search: '테스트',
    }));
    await waitFor(() => expect(screen.getByText('테스트 수업')).toBeTruthy());
  });

  it('applies activity date range filters', async () => {
    getClassActivitiesMock
      .mockResolvedValueOnce({
        data: {
          items: [],
          pagination: { page: 1, page_size: 10, total: 0, total_pages: 1 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [],
          pagination: { page: 1, page_size: 10, total: 0, total_pages: 1 },
        },
      });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '필터' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    await waitFor(() => expect(getClassActivitiesMock).toHaveBeenLastCalledWith(1, {
      page: 1,
      page_size: 10,
      date_from: '2026-03-01',
      date_to: '2026-03-31',
    }));
  });

  it('resets activity filter inputs and closes modal with cancel', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'reserved',
            activity_id: 888,
            class_id: 88,
            class_title: '페이지 수업',
            class_date: '2026-03-07',
            class_start_time: '11:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 120, total_pages: 12 },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '필터' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText('...')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'reserved' } });
    fireEvent.change(screen.getByLabelText('수업명 검색'), { target: { value: '임시검색' } });
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-03-31' } });

    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    expect((screen.getByLabelText('상태') as HTMLSelectElement).value).toBe('all');
    expect((screen.getByLabelText('수업명 검색') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('종료일') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByText('필터 설정')).toBeNull();
  });

  it('closes activity filter modal with close button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '필터' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('필터 설정')).toBeNull();
  });

  it('shows activity load error message', async () => {
    getClassActivitiesMock.mockRejectedValueOnce(new Error('activity fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 기록을 불러오지 못했습니다.')).toBeTruthy());
  });

  it('handles legacy array response for class activities', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: [
        {
          activity_type: 'attended',
          activity_id: 777,
          class_id: 91,
          class_title: '배열 응답 수업',
          class_date: '2026-03-02',
          class_start_time: '08:00:00',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('배열 응답 수업')).toBeTruthy());
    expect(screen.getByText('총 1건 · 1/1 페이지')).toBeTruthy();
  });

  it('handles class activity object response without items/pagination fields', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {},
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('수업 기록이 없습니다.')).toBeTruthy());
    expect(screen.getByText('총 0건 · 1/1 페이지')).toBeTruthy();
  });

  it('links class activity item to class detail when class_id exists', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'attended',
            activity_id: 301,
            class_id: 77,
            class_title: '링크 수업',
            class_date: '2026-03-03',
            class_start_time: '07:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });

    renderPage();

    const classLink = await screen.findByRole('link', { name: '링크 수업' });
    expect(classLink.getAttribute('href')).toBe('/classes/77');
  });

  it('shows both-side ellipsis when activity page moves to middle range', async () => {
    getClassActivitiesMock.mockResolvedValue({
      data: {
        items: [
          {
            activity_type: 'reserved',
            activity_id: 909,
            class_id: 99,
            class_title: '다중 페이지 수업',
            class_date: '2026-03-08',
            class_start_time: '12:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 120, total_pages: 12 },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeTruthy());
    for (let i = 0; i < 5; i += 1) {
      await waitFor(() => expect(screen.queryByText('수업 기록을 불러오는 중...')).toBeNull());
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
    }

    await waitFor(() => expect(screen.getAllByText('...').length).toBe(2));
  });

  it('changes activity page by clicking page number and next button', async () => {
    getClassActivitiesMock.mockResolvedValue({
      data: {
        items: [
          {
            activity_type: 'reserved',
            activity_id: 910,
            class_id: 100,
            class_title: '페이지 이동 수업',
            class_date: '2026-03-08',
            class_start_time: '12:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 120, total_pages: 12 },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(screen.getByText('총 120건 · 2/12 페이지')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('수업 기록을 불러오는 중...')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByText('총 120건 · 3/12 페이지')).toBeTruthy());
  });

  it('changes activity page with previous button', async () => {
    getClassActivitiesMock.mockResolvedValue({
      data: {
        items: [
          {
            activity_type: 'reserved',
            activity_id: 911,
            class_id: 101,
            class_title: '이전 페이지 수업',
            class_date: '2026-03-08',
            class_start_time: '12:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 120, total_pages: 12 },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(screen.getByText('총 120건 · 2/12 페이지')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('수업 기록을 불러오는 중...')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    await waitFor(() => expect(screen.getByText('총 120건 · 1/12 페이지')).toBeTruthy());
  });

  it('shows dash when class datetime is missing in activity card', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'attended',
            activity_id: 302,
            class_id: 78,
            class_title: '일시 없음 수업',
            class_date: null,
            class_start_time: null,
          },
        ],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('일시 없음 수업')).toBeTruthy());
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('allows canceling reserved class from activity list', async () => {
    getClassActivitiesMock
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              activity_type: 'reserved',
              activity_id: 401,
              class_id: 55,
              class_title: '예약 수업',
              class_date: '2026-03-05',
              class_start_time: '09:00:00',
            },
          ],
          pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [],
          pagination: { page: 1, page_size: 10, total: 0, total_pages: 1 },
        },
      });
    classCancelRegistrationMock.mockResolvedValueOnce(undefined);

    renderPage();
    const cancelButton = await screen.findByRole('button', { name: '예약 취소' });
    fireEvent.click(cancelButton);

    await waitFor(() => expect(classCancelRegistrationMock).toHaveBeenCalledWith(55, 1));
    await waitFor(() => expect(screen.getByText('예약을 취소했습니다.')).toBeTruthy());
  });

  it('shows error when canceling reserved class fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'reserved',
            activity_id: 402,
            class_id: 56,
            class_title: '예약 실패 수업',
            class_date: '2026-03-05',
            class_start_time: '09:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });
    classCancelRegistrationMock.mockRejectedValueOnce(new Error('cancel fail'));

    renderPage();
    const cancelButton = await screen.findByRole('button', { name: '예약 취소' });
    fireEvent.click(cancelButton);

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('allows marking attended class as absent from activity list', async () => {
    getClassActivitiesMock
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              activity_type: 'attended',
              activity_id: 501,
              class_id: 66,
              class_title: '출석 수업',
              class_date: '2026-03-06',
              class_start_time: '10:00:00',
            },
          ],
          pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [],
          pagination: { page: 1, page_size: 10, total: 0, total_pages: 1 },
        },
      });
    classUpdateRegistrationStatusMock.mockResolvedValueOnce(undefined);

    renderPage();
    const absentButton = await screen.findByRole('button', { name: '결석 처리' });
    fireEvent.click(absentButton);

    await waitFor(() => expect(classUpdateRegistrationStatusMock).toHaveBeenCalledWith(66, 1, 'absent'));
    await waitFor(() => expect(screen.getByText('출석을 결석으로 변경했습니다.')).toBeTruthy());
  });

  it('shows error when marking attended class as absent fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'attended',
            activity_id: 502,
            class_id: 67,
            class_title: '결석 실패 수업',
            class_date: '2026-03-06',
            class_start_time: '10:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });
    classUpdateRegistrationStatusMock.mockRejectedValueOnce(new Error('absent fail'));

    renderPage();
    const absentButton = await screen.findByRole('button', { name: '결석 처리' });
    fireEvent.click(absentButton);

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('resets password with cancel and success paths', async () => {
    resetPasswordMock.mockResolvedValueOnce(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('비밀번호 초기화')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));
    expect(resetPasswordMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));
    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByText('고객 비밀번호를 기본값(12345)으로 초기화했습니다.')).toBeTruthy());

    confirmSpy.mockRestore();
  });

  it('replaces pending notice timer and clears notice after timeout', async () => {
    resetPasswordMock.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('비밀번호 초기화')).toBeTruthy());
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByText('고객 비밀번호를 기본값(12345)으로 초기화했습니다.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(resetPasswordMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2500);
    expect(screen.queryByText('고객 비밀번호를 기본값(12345)으로 초기화했습니다.')).toBeNull();

    confirmSpy.mockRestore();
  });

  it('shows parsed error when reset password fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetPasswordMock.mockRejectedValueOnce(new Error('reset failed'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('비밀번호 초기화')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 초기화' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('creates membership and refreshes customer/membership data', async () => {
    createMembershipMock.mockResolvedValueOnce(undefined);

    renderPage();

    await waitFor(() => expect(screen.getByText('회원권 발급')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '프로모션' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalledWith({
      customer_id: 1,
      membership_type_id: 5,
      notes: '프로모션',
    }));

    expect(getByIdMock).toHaveBeenCalledTimes(2);
    expect(getByCustomerMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText('회원권을 지급했습니다.')).toBeTruthy());
  });

  it('handles create-membership refresh when recent attendances/notes are missing', async () => {
    getByIdMock
      .mockResolvedValueOnce({
        data: {
          customer: {
            id: 1,
            name: '홍길동',
            phone: '010-1111-2222',
            notes: '초기 메모',
          },
          recentAttendances: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          customer: {
            id: 1,
            name: '홍길동',
            phone: '010-1111-2222',
            notes: null,
          },
        },
      });
    createMembershipMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('회원권 발급')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('회원권을 지급했습니다.')).toBeTruthy());
  });

  it('saves customer edit with empty notes as null', async () => {
    updateCustomerMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    fireEvent.change(screen.getByLabelText('고객 메모'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '고객 정보 저장' }));

    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalledWith(1, {
      name: '홍길동',
      phone: '010-1111-2222',
      notes: null,
    }));
  });

  it('shows parsed error when create membership fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMembershipMock.mockRejectedValueOnce(new Error('create failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText('회원권 발급')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('회원권 관리'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '회원권 지급' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('edits membership and supports cancel', async () => {
    updateMembershipMock.mockResolvedValueOnce(undefined);
    getByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 8,
            membership_type_name: '20회권',
            remaining_sessions: 5,
            total_sessions: 20,
            is_active: true,
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 8,
            membership_type_name: '20회권',
            remaining_sessions: 0,
            total_sessions: 20,
            is_active: false,
            notes: '변경됨',
          },
        ],
      });

    renderPage();

    await waitFor(() => expect(screen.getByText('20회권')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('잔여 횟수'), { target: { value: '0' } });
    fireEvent.change(document.getElementById('edit-notes-8') as HTMLTextAreaElement, { target: { value: '변경됨' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(updateMembershipMock).toHaveBeenCalledWith(8, {
      remaining_sessions: 0,
      notes: '변경됨',
    }));

    await waitFor(() => expect(screen.getByText('회원권 정보를 수정했습니다.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('omits is_active when editing a limited membership', async () => {
    updateMembershipMock.mockResolvedValueOnce(undefined);
    getByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 18,
            membership_type_name: '10회권',
            remaining_sessions: 4,
            is_active: true,
            notes: '기존 메모',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 18,
            membership_type_name: '10회권',
            remaining_sessions: 4,
            is_active: true,
            notes: '메모 수정',
          },
        ],
      });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('10회권').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(document.getElementById('edit-notes-18') as HTMLTextAreaElement, { target: { value: '메모 수정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(updateMembershipMock).toHaveBeenCalledWith(18, {
      remaining_sessions: 4,
      notes: '메모 수정',
    }));
  });

  it('renders membership start/end dates when provided', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 10,
          membership_type_name: '날짜있음권',
          remaining_sessions: 3,
          total_sessions: 10,
          consumed_sessions: 4,
          is_active: true,
          start_date: '2026-02-01',
          expected_end_date: '2026-03-05',
          notes: null,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('날짜있음권')).toBeTruthy());
    expect(screen.getByText('예약 가능 잔여: 3회')).toBeTruthy();
    expect(screen.getByText('소진 횟수: 4 / 10회')).toBeTruthy();
    expect(screen.getByText('시작일: 2026년 2월 1일')).toBeTruthy();
    expect(screen.getByText('예상 종료일: 2026년 3월 5일')).toBeTruthy();
  });

  it('renders membership date fallback as dash when dates are missing', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 9,
          membership_type_name: '날짜없음권',
          remaining_sessions: 1,
          is_active: true,
          start_date: null,
          expected_end_date: null,
          notes: null,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('날짜없음권')).toBeTruthy());
    expect(screen.getByText('시작일: -')).toBeTruthy();
    expect(screen.getByText('예상 종료일: -')).toBeTruthy();
  });

  it('shows parsed error when update membership fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    updateMembershipMock.mockRejectedValueOnce(new Error('update failed'));
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 15,
          membership_type_name: '10회권',
          remaining_sessions: 2,
          is_active: true,
          notes: '',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '수정' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('delete membership handles confirm cancel and success', async () => {
    deleteMembershipMock.mockResolvedValueOnce(undefined);
    getByCustomerMock
      .mockResolvedValueOnce({
        data: [
          {
            id: 20,
            membership_type_name: '삭제대상',
            remaining_sessions: 1,
            is_active: true,
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('삭제대상')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteMembershipMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleteMembershipMock).toHaveBeenCalledWith(20));
    await waitFor(() => expect(screen.getByText('회원권을 삭제했습니다.')).toBeTruthy());

    confirmSpy.mockRestore();
  });

  it('shows parsed error when delete membership fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMembershipMock.mockRejectedValueOnce(new Error('delete failed'));
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 30,
          membership_type_name: '실패삭제',
          remaining_sessions: 1,
          is_active: true,
          notes: null,
        },
      ],
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await waitFor(() => expect(screen.getByText('실패삭제')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(parseApiErrorMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('loads recommended classes for membership and allows quick reserve', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 31,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 500,
          title: '아쉬탕가',
          class_date: '2026-03-10',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 3,
          current_enrollment: 2,
          is_registered: false,
        },
      ],
    });
    classRegisterMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));
    await waitFor(() => expect(getRecommendedClassesMock).toHaveBeenCalledWith(1, {
      membership_name: '아쉬탕가',
      limit: 10,
    }));

    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButton);
    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledWith(500, {
      customer_id: 1,
      membership_id: 31,
    }));
    await waitFor(() => expect(screen.getByText('예약됨')).toBeTruthy());
  });

  it('updates only the selected class when quick reserving among multiple recommendations', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 36,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 701,
          title: '아쉬탕가 A',
          class_date: '2026-03-20',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 3,
          current_enrollment: 2,
          is_registered: false,
        },
        {
          id: 702,
          title: '아쉬탕가 B',
          class_date: '2026-03-21',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 2,
          current_enrollment: 4,
          is_registered: false,
        },
      ],
    });
    classRegisterMock.mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    await waitFor(() => expect(screen.getByText('아쉬탕가 A')).toBeTruthy());
    const quickReserveButtons = screen.getAllByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButtons[1]);

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledWith(702, {
      customer_id: 1,
      membership_id: 36,
    }));
    await waitFor(() => expect(screen.getByText('예약됨')).toBeTruthy());
  });

  it('shows error when loading recommended classes fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 32,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockRejectedValueOnce(new Error('recommended load fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows error when quick reserve from membership card fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 33,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 501,
          title: '아쉬탕가',
          class_date: '2026-03-11',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 2,
          current_enrollment: 3,
          is_registered: false,
        },
      ],
    });
    classRegisterMock.mockRejectedValueOnce(new Error('reserve fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));
    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButton);

    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('retries quick reserve after cross-membership confirmation', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 37,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 801,
          title: '저녁 아쉬탕가',
          class_date: '2026-03-22',
          start_time: '18:00:00',
          end_time: '19:00:00',
          remaining_seats: 3,
          current_enrollment: 2,
          is_registered: false,
        },
      ],
    });
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButton);

    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(1, 801, {
      customer_id: 1,
      membership_id: 37,
    }));
    await waitFor(() => expect(globalThis.confirm).toHaveBeenCalledWith('회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.'));
    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(2, 801, {
      customer_id: 1,
      membership_id: 37,
      allow_cross_membership_registration: true,
    }));
    await waitFor(() => expect(screen.getByText('다른 회원권 차감으로 수업을 예약했습니다.')).toBeTruthy());
  });

  it('updates only the selected recommendation after cross-membership retry success', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 40,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 804,
          title: '아침 아쉬탕가',
          class_date: '2026-03-25',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 3,
          current_enrollment: 2,
          is_registered: false,
        },
        {
          id: 805,
          title: '저녁 아쉬탕가',
          class_date: '2026-03-25',
          start_time: '18:00:00',
          end_time: '19:00:00',
          remaining_seats: 2,
          current_enrollment: 4,
          is_registered: false,
        },
      ],
    });
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockResolvedValueOnce(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    const quickReserveButtons = await screen.findAllByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButtons[1]);

    await waitFor(() => expect(classRegisterMock).toHaveBeenNthCalledWith(2, 805, {
      customer_id: 1,
      membership_id: 40,
      allow_cross_membership_registration: true,
    }));
    await waitFor(() => expect(screen.getByText('아침 아쉬탕가')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('예약됨')).toBeTruthy());
  });

  it('shows error when cross-membership retry fails during quick reserve', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    const retryError = new Error('retry failed');
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 38,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 802,
          title: '저녁 아쉬탕가',
          class_date: '2026-03-23',
          start_time: '18:00:00',
          end_time: '19:00:00',
          remaining_seats: 3,
          current_enrollment: 2,
          is_registered: false,
        },
      ],
    });
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    classRegisterMock
      .mockRejectedValueOnce(crossMembershipError)
      .mockRejectedValueOnce(retryError);

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButton);

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(parseApiErrorMock).toHaveBeenCalledWith(retryError));
    await waitFor(() => expect(screen.getByText('요청 실패')).toBeTruthy());
  });

  it('stops quick reserve retry when cross-membership confirmation is canceled', async () => {
    const crossMembershipError = new AxiosError('cross membership required');
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 39,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 803,
          title: '저녁 아쉬탕가',
          class_date: '2026-03-24',
          start_time: '18:00:00',
          end_time: '19:00:00',
          remaining_seats: 3,
          current_enrollment: 2,
          is_registered: false,
        },
      ],
    });
    shouldConfirmCrossMembershipRegistrationMock.mockReturnValueOnce(true);
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    classRegisterMock.mockRejectedValueOnce(crossMembershipError);

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    fireEvent.click(quickReserveButton);

    await waitFor(() => expect(classRegisterMock).toHaveBeenCalledTimes(1));
    expect(parseApiErrorMock).not.toHaveBeenCalled();
  });

  it('disables quick reserve when membership has no remaining sessions', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 34,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 0,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 610,
          title: '아쉬탕가',
          class_date: '2026-03-13',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 2,
          current_enrollment: 5,
          is_registered: false,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    expect((quickReserveButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables quick reserve when remaining seats are zero', async () => {
    getByCustomerMock.mockResolvedValueOnce({
      data: [
        {
          id: 35,
          membership_type_name: '아쉬탕가',
          remaining_sessions: 5,
          total_sessions: 10,
          is_active: true,
          notes: null,
        },
      ],
    });
    getRecommendedClassesMock.mockResolvedValueOnce({
      data: [
        {
          id: 611,
          title: '아쉬탕가',
          class_date: '2026-03-14',
          start_time: '09:00:00',
          end_time: '10:00:00',
          remaining_seats: 0,
          current_enrollment: 10,
          is_registered: false,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('아쉬탕가')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));

    const quickReserveButton = await screen.findByRole('button', { name: '바로 예약' });
    expect((quickReserveButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders class activity title fallback from class_type and default text', async () => {
    getClassActivitiesMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            activity_type: 'attended',
            activity_id: 1201,
            class_id: 120,
            class_title: '',
            class_type: '대체 수업명',
            class_date: '2026-03-15',
            class_start_time: '08:00:00',
          },
          {
            activity_type: 'reserved',
            activity_id: 1202,
            class_id: 121,
            class_title: '',
            class_type: '',
            class_date: '2026-03-15',
            class_start_time: '09:00:00',
          },
          {
            activity_type: 'reserved',
            activity_id: 1203,
            class_id: null,
            class_title: '',
            class_type: '',
            class_date: '2026-03-15',
            class_start_time: '09:00:00',
          },
        ],
        pagination: { page: 1, page_size: 10, total: 3, total_pages: 1 },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: '대체 수업명' })).toBeTruthy());
    expect(screen.getAllByText('수업 정보 없음').length).toBeGreaterThanOrEqual(2);
  });
});
