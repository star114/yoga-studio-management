import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

const requestUseMock = vi.fn();
const responseUseMock = vi.fn();

const mockApiInstance = {
  get: getMock,
  post: postMock,
  put: putMock,
  delete: deleteMock,
  interceptors: {
    request: {
      use: requestUseMock,
    },
    response: {
      use: responseUseMock,
    },
  },
};

const createMock = vi.fn(() => mockApiInstance);

vi.mock('axios', () => ({
  default: {
    create: createMock,
  },
}));

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

type RequestConfig = {
  headers: Record<string, string | undefined>;
};

type ResponseLikeError = {
  response?: {
    status?: number;
  };
};

describe('api service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
    });
    Object.defineProperty(window, 'location', {
      value: { href: '/' },
      configurable: true,
      writable: true,
    });
  });

  it('registers axios instance with default base config', async () => {
    await import('./api');
    expect(createMock).toHaveBeenCalledWith({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('request interceptor attaches bearer token and response interceptor handles 401', async () => {
    await import('./api');

    const requestFulfilled = requestUseMock.mock.calls[0][0] as (config: RequestConfig) => RequestConfig;
    const requestRejected = requestUseMock.mock.calls[0][1] as (error: Error) => Promise<never>;
    const responseRejected = responseUseMock.mock.calls[0][1] as (error: ResponseLikeError) => Promise<never>;

    localStorage.setItem('token', 'abc-token');
    const reqConfigWithToken = requestFulfilled({ headers: {} });
    expect(reqConfigWithToken.headers.Authorization).toBe('Bearer abc-token');

    localStorage.removeItem('token');
    const reqConfigWithoutToken = requestFulfilled({ headers: {} });
    expect(reqConfigWithoutToken.headers.Authorization).toBeUndefined();

    await expect(requestRejected(new Error('x'))).rejects.toThrow('x');

    localStorage.setItem('token', 'to-be-cleared');
    await expect(responseRejected({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');

    await expect(responseRejected({ response: { status: 500 } })).rejects.toEqual({ response: { status: 500 } });
  });

  it('routes all exported API helpers to underlying axios instance', async () => {
    const {
      authAPI,
      customerAPI,
      membershipAPI,
      attendanceAPI,
      classAPI,
      default: api,
    } = await import('./api');

    const payload = { a: 1 };

    authAPI.login('id', 'pw');
    authAPI.getCurrentUser();
    authAPI.changePassword('old', 'new');

    customerAPI.getAll();
    customerAPI.getById(1);
    customerAPI.create(payload);
    customerAPI.update(1, payload);
    customerAPI.resetPassword(1);
    customerAPI.delete(1);

    membershipAPI.getTypes();
    membershipAPI.createType(payload);
    membershipAPI.updateType(1, payload);
    membershipAPI.deactivateType(1);
    membershipAPI.getByCustomer(1);
    membershipAPI.create(payload);
    membershipAPI.update(1, payload);
    membershipAPI.delete(1);

    attendanceAPI.getAll({ limit: 10 });
    attendanceAPI.getToday();
    attendanceAPI.checkIn(payload);
    attendanceAPI.update(1, payload);
    attendanceAPI.delete(1);

    classAPI.getAll({ limit: 10 });
    classAPI.getById(2);
    classAPI.getRegistrations(2);
    classAPI.create(payload);
    classAPI.update(2, payload);
    classAPI.createRecurring(payload);
    classAPI.excludeRecurringOccurrence(3, '2026-01-01', 2, 'skip');
    classAPI.register(2);
    classAPI.register(2, { customer_id: 7 });
    classAPI.updateRegistrationComment(2, 7, 'note');
    classAPI.cancelRegistration(2, 7);
    classAPI.cancelMyRegistration(2);
    classAPI.delete(2);

    expect(api).toBe(mockApiInstance);

    expect(postMock).toHaveBeenCalledWith('/auth/login', { identifier: 'id', password: 'pw' });
    expect(getMock).toHaveBeenCalledWith('/auth/me');
    expect(putMock).toHaveBeenCalledWith('/auth/password', { currentPassword: 'old', newPassword: 'new' });

    expect(getMock).toHaveBeenCalledWith('/customers');
    expect(getMock).toHaveBeenCalledWith('/customers/1');
    expect(postMock).toHaveBeenCalledWith('/customers', payload);
    expect(putMock).toHaveBeenCalledWith('/customers/1', payload);
    expect(putMock).toHaveBeenCalledWith('/customers/1/password');
    expect(deleteMock).toHaveBeenCalledWith('/customers/1');

    expect(getMock).toHaveBeenCalledWith('/memberships/types');
    expect(postMock).toHaveBeenCalledWith('/memberships/types', payload);
    expect(putMock).toHaveBeenCalledWith('/memberships/types/1', payload);
    expect(deleteMock).toHaveBeenCalledWith('/memberships/types/1');
    expect(getMock).toHaveBeenCalledWith('/memberships/customer/1');
    expect(postMock).toHaveBeenCalledWith('/memberships', payload);
    expect(putMock).toHaveBeenCalledWith('/memberships/1', payload);
    expect(deleteMock).toHaveBeenCalledWith('/memberships/1');

    expect(getMock).toHaveBeenCalledWith('/attendances', { params: { limit: 10 } });
    expect(getMock).toHaveBeenCalledWith('/attendances/today');
    expect(postMock).toHaveBeenCalledWith('/attendances', payload);
    expect(putMock).toHaveBeenCalledWith('/attendances/1', payload);
    expect(deleteMock).toHaveBeenCalledWith('/attendances/1');

    expect(getMock).toHaveBeenCalledWith('/classes', { params: { limit: 10 } });
    expect(getMock).toHaveBeenCalledWith('/classes/2');
    expect(getMock).toHaveBeenCalledWith('/classes/2/registrations');
    expect(postMock).toHaveBeenCalledWith('/classes', payload);
    expect(putMock).toHaveBeenCalledWith('/classes/2', payload);
    expect(postMock).toHaveBeenCalledWith('/classes/recurring', payload);
    expect(postMock).toHaveBeenCalledWith('/classes/series/3/exclusions', {
      class_id: 2,
      class_date: '2026-01-01',
      reason: 'skip',
    });
    expect(postMock).toHaveBeenCalledWith('/classes/2/registrations', {});
    expect(postMock).toHaveBeenCalledWith('/classes/2/registrations', { customer_id: 7 });
    expect(putMock).toHaveBeenCalledWith('/classes/2/registrations/7/comment', { registration_comment: 'note' });
    expect(deleteMock).toHaveBeenCalledWith('/classes/2/registrations/7');
    expect(deleteMock).toHaveBeenCalledWith('/classes/2/registrations/me');
    expect(deleteMock).toHaveBeenCalledWith('/classes/2');
  });
});
