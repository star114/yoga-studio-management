import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { parseApiError } from './apiError';

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

  it('returns fallback when axios payload has no usable message', () => {
    const error = makeAxiosError({ error: '' });
    expect(parseApiError(error, 'fallback')).toBe('fallback');
  });
});
