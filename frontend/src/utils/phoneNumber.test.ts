import { describe, expect, it } from 'vitest';
import { formatPhoneNumberInput } from './phoneNumber';

describe('formatPhoneNumberInput', () => {
  it('formats 11 digit mobile numbers with hyphens', () => {
    expect(formatPhoneNumberInput('01000000000')).toBe('010-0000-0000');
  });

  it('keeps partial input progressively formatted', () => {
    expect(formatPhoneNumberInput('0101')).toBe('010-1');
    expect(formatPhoneNumberInput('01012345')).toBe('010-1234-5');
  });

  it('strips non-digit characters and limits to 11 digits', () => {
    expect(formatPhoneNumberInput('010-1234-5678abc9')).toBe('010-1234-5678');
  });
});
