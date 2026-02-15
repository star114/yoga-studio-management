import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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
  login: (email: string, password: string) => 
    api.post('/auth/login', { email, password }),
  
  getCurrentUser: () => 
    api.get('/auth/me'),
};

// Customer API
export const customerAPI = {
  getAll: () => 
    api.get('/customers'),
  
  getById: (id: number) => 
    api.get(`/customers/${id}`),
  
  create: (data: any) => 
    api.post('/customers', data),
  
  update: (id: number, data: any) => 
    api.put(`/customers/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/customers/${id}`),
};

// Membership API
export const membershipAPI = {
  getTypes: () => 
    api.get('/memberships/types'),
  
  createType: (data: any) => 
    api.post('/memberships/types', data),

  updateType: (id: number, data: any) =>
    api.put(`/memberships/types/${id}`, data),

  deactivateType: (id: number) =>
    api.delete(`/memberships/types/${id}`),
  
  getByCustomer: (customerId: number) => 
    api.get(`/memberships/customer/${customerId}`),
  
  create: (data: any) => 
    api.post('/memberships', data),
  
  update: (id: number, data: any) => 
    api.put(`/memberships/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/memberships/${id}`),
};

// Attendance API
export const attendanceAPI = {
  getAll: (params?: any) => 
    api.get('/attendances', { params }),
  
  getToday: () => 
    api.get('/attendances/today'),
  
  checkIn: (data: any) => 
    api.post('/attendances', data),
  
  update: (id: number, data: any) => 
    api.put(`/attendances/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/attendances/${id}`),
};

// Class API
export const classAPI = {
  getAll: (params?: any) =>
    api.get('/classes', { params }),

  getRegistrations: (classId: number) =>
    api.get(`/classes/${classId}/registrations`),

  create: (data: any) =>
    api.post('/classes', data),

  update: (id: number, data: any) =>
    api.put(`/classes/${id}`, data),

  createRecurring: (data: any) =>
    api.post('/classes/recurring', data),

  excludeRecurringOccurrence: (seriesId: number, classDate: string, classId?: number, reason?: string) =>
    api.post(`/classes/series/${seriesId}/exclusions`, {
      class_id: classId,
      class_date: classDate,
      reason,
    }),

  register: (classId: number, data?: any) =>
    api.post(`/classes/${classId}/registrations`, data || {}),

  cancelRegistration: (classId: number, customerId: number) =>
    api.delete(`/classes/${classId}/registrations/${customerId}`),

  cancelMyRegistration: (classId: number) =>
    api.delete(`/classes/${classId}/registrations/me`),

  delete: (id: number) =>
    api.delete(`/classes/${id}`),
};

export default api;
