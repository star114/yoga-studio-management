import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
type QueryParams = Record<string, string | number | boolean | null | undefined>;
type ClassRegistrationPayload = {
  customer_id?: number;
};

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터 - 토큰 추가
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터 - 401 처리
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (identifier: string, password: string) => 
    api.post('/auth/login', { identifier, password }),
  
  getCurrentUser: () => 
    api.get('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/password', { currentPassword, newPassword }),
};

// Customer API
export const customerAPI = {
  getAll: () => 
    api.get('/customers'),
  
  getById: (id: number) => 
    api.get(`/customers/${id}`),
  
  create: (data: unknown) => 
    api.post('/customers', data),
  
  update: (id: number, data: unknown) => 
    api.put(`/customers/${id}`, data),

  resetPassword: (id: number) =>
    api.put(`/customers/${id}/password`),
  
  delete: (id: number) => 
    api.delete(`/customers/${id}`),
};

// Membership API
export const membershipAPI = {
  getTypes: () => 
    api.get('/memberships/types'),
  
  createType: (data: unknown) => 
    api.post('/memberships/types', data),

  updateType: (id: number, data: unknown) =>
    api.put(`/memberships/types/${id}`, data),

  deactivateType: (id: number) =>
    api.delete(`/memberships/types/${id}`),
  
  getByCustomer: (customerId: number) => 
    api.get(`/memberships/customer/${customerId}`),
  
  create: (data: unknown) => 
    api.post('/memberships', data),
  
  update: (id: number, data: unknown) => 
    api.put(`/memberships/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/memberships/${id}`),
};

// Attendance API
export const attendanceAPI = {
  getAll: (params?: QueryParams) => 
    api.get('/attendances', { params }),
  
  getToday: () => 
    api.get('/attendances/today'),
  
  checkIn: (data: unknown) => 
    api.post('/attendances', data),
  
  update: (id: number, data: unknown) => 
    api.put(`/attendances/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/attendances/${id}`),
};

// Class API
export const classAPI = {
  getAll: (params?: QueryParams) =>
    api.get('/classes', { params }),

  getById: (classId: number) =>
    api.get(`/classes/${classId}`),

  getRegistrations: (classId: number) =>
    api.get(`/classes/${classId}/registrations`),

  getMyRegistrations: () =>
    api.get('/classes/registrations/me'),

  create: (data: unknown) =>
    api.post('/classes', data),

  update: (id: number, data: unknown) =>
    api.put(`/classes/${id}`, data),

  createRecurring: (data: unknown) =>
    api.post('/classes/recurring', data),

  excludeRecurringOccurrence: (seriesId: number, classDate: string, classId?: number, reason?: string) =>
    api.post(`/classes/series/${seriesId}/exclusions`, {
      class_id: classId,
      class_date: classDate,
      reason,
    }),

  register: (classId: number, data: ClassRegistrationPayload = {}) =>
    api.post(`/classes/${classId}/registrations`, data),

  updateRegistrationComment: (classId: number, customerId: number, registration_comment: string) =>
    api.put(`/classes/${classId}/registrations/${customerId}/comment`, { registration_comment }),

  cancelRegistration: (classId: number, customerId: number) =>
    api.delete(`/classes/${classId}/registrations/${customerId}`),

  cancelMyRegistration: (classId: number) =>
    api.delete(`/classes/${classId}/registrations/me`),

  delete: (id: number) =>
    api.delete(`/classes/${id}`),
};

export default api;
