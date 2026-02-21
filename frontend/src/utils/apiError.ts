import { AxiosError } from 'axios';

interface ValidationErrorItem {
  msg?: string;
}

interface ApiErrorPayload {
  error?: string;
  errors?: ValidationErrorItem[];
}

export const parseApiError = (error: unknown, fallback = '요청 처리에 실패했습니다.'): string => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorPayload | undefined;

    if (Array.isArray(data?.errors)) {
      return data.errors
        .map((item) => item.msg)
        .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0)
        .join(', ');
    }

    if (typeof data?.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  }

  return fallback;
};
