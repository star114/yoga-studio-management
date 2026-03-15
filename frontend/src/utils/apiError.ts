import { AxiosError } from 'axios';

interface ValidationErrorItem {
  msg?: string;
}

interface ApiErrorPayload {
  error?: string;
  reason?: string;
  failed_checks?: string[];
  checks?: {
    cross_membership_message?: string;
    has_alternative_membership?: boolean;
    requires_confirmation?: boolean;
  };
  errors?: ValidationErrorItem[];
}

const getApiErrorPayload = (error: unknown): ApiErrorPayload | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  return error.response?.data as ApiErrorPayload | undefined;
};

export const shouldConfirmCrossMembershipRegistration = (error: unknown): boolean => {
  const data = getApiErrorPayload(error);

  return data?.reason === 'CROSS_MEMBERSHIP_CONFIRM_REQUIRED'
    && data.checks?.has_alternative_membership === true
    && data.checks?.requires_confirmation === true;
};

export const getCrossMembershipConfirmationMessage = (error: unknown): string => {
  const data = getApiErrorPayload(error);
  const message = data?.checks?.cross_membership_message?.trim();

  if (message && message.length > 0) {
    return message;
  }

  return '회원권이 없는데 등록하시겠어요? 다른 회원권에서 1회 차감됩니다.';
};

export const parseApiError = (error: unknown, fallback = '요청 처리에 실패했습니다.'): string => {
  const data = getApiErrorPayload(error);

  if (data) {
    if (Array.isArray(data?.errors)) {
      return data.errors
        .map((item) => item.msg)
        .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0)
        .join(', ');
    }

    if (typeof data?.error === 'string' && data.error.length > 0) {
      if (typeof data.reason === 'string' && data.reason.length > 0) {
        return `${data.error} (${data.reason})`;
      }

      return data.error;
    }
  }

  return fallback;
};
