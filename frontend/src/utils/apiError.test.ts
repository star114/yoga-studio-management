import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  getCrossMembershipConfirmationMessage,
  parseApiError,
  shouldConfirmCrossMembershipRegistration,
} from './apiError';

const makeAxiosError = (data: unknown) => {
  const error = new AxiosError('request failed');
  error.response = {
    data,
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: { headers: {} },
  } as never;
  return error;
};

describe('parseApiError', () => {
  it('returns fallback message for unknown error', () => {
    expect(parseApiError(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('returns joined validation messages from errors array', () => {
    const error = makeAxiosError({
      errors: [{ msg: '이름은 필수입니다.' }, { msg: '' }, { msg: '전화번호 형식이 올바르지 않습니다.' }],
    });
    expect(parseApiError(error)).toBe('이름은 필수입니다., 전화번호 형식이 올바르지 않습니다.');
  });

  it('returns error message field when provided', () => {
    const error = makeAxiosError({ error: '권한이 없습니다.' });
    expect(parseApiError(error)).toBe('권한이 없습니다.');
  });

  it('includes reason next to error when provided', () => {
    const error = makeAxiosError({
      error: 'No valid membership for this class',
      reason: 'CLASS_TITLE_MISMATCH',
    });
    expect(parseApiError(error)).toBe('No valid membership for this class (CLASS_TITLE_MISMATCH)');
  });

  it('returns fallback when axios payload has no usable message', () => {
    const error = makeAxiosError({ error: '' });
    expect(parseApiError(error, 'fallback')).toBe('fallback');
  });

  it('detects cross-membership confirmation state', () => {
    const error = makeAxiosError({
      error: 'No valid membership for this class',
      reason: 'CROSS_MEMBERSHIP_CONFIRM_REQUIRED',
      checks: {
        has_alternative_membership: true,
        requires_confirmation: true,
      },
    });

    expect(shouldConfirmCrossMembershipRegistration(error)).toBe(true);
  });

  it('returns cross-membership confirmation message when provided', () => {
    const error = makeAxiosError({
      checks: {
        cross_membership_message: '회원권이 없는데 등록하시겠어요?',
      },
    });

    expect(getCrossMembershipConfirmationMessage(error)).toBe('회원권이 없는데 등록하시겠어요?');
  });

  it('returns default cross-membership confirmation message when payload message is missing', () => {
    const error = makeAxiosError({ checks: {} });

    expect(getCrossMembershipConfirmationMessage(error)).toBe('회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.');
  });
});
