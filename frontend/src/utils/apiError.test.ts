import { describe, expect, it } from 'vitest';
import { parseApiError } from './apiError';

describe('parseApiError', () => {
  it('returns fallback message for unknown error', () => {
    expect(parseApiError(new Error('boom'), 'fallback')).toBe('fallback');
  });
});

