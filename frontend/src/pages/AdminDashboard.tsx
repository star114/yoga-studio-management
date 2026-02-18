import React, { useEffect, useState } from 'react';
import { customerAPI, attendanceAPI } from '../services/api';
import { format } from 'date-fns';

interface DashboardAttendance {
  id: number;
  customer_name: string;
  attendance_date: string;
  class_type?: string | null;
}

interface DashboardCustomer {
  id: number;
  name: string;
  phone: string;
  membership_count?: string | number;
  total_attendance?: string | number;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    todayAttendance: 0,
  });
  const [todayAttendances, setTodayAttendances] = useState<DashboardAttendance[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<DashboardCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [customersRes, todayRes] = await Promise.all([
        customerAPI.getAll(),
        attendanceAPI.getToday(),
      ]);

      setStats({
        totalCustomers: customersRes.data.length,
        todayAttendance: todayRes.data.length,
      });

      setRecentCustomers(customersRes.data.slice(0, 5));
      setTodayAttendances(todayRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-warm-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary-800 mb-2">
          대시보드
        </h1>
        <p className="text-warm-600">오늘도 평온한 하루 되세요</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-warm-600 mb-1">전체 회원</p>
              <p className="text-3xl font-bold text-primary-800">{stats.totalCustomers}</p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-warm-600 mb-1">오늘 출석</p>
              <p className="text-3xl font-bold text-primary-800">{stats.todayAttendance}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 오늘 출석 */}
        <div className="card">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            오늘 출석
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {todayAttendances.length === 0 ? (
              <p className="text-warm-500 text-center py-8">아직 출석한 회원이 없습니다</p>
            ) : (
              todayAttendances.map((attendance) => (
                <div key={attendance.id} className="flex items-center justify-between p-3 bg-warm-50 rounded-lg">
                  <div>
                    <p className="font-medium text-primary-800">{attendance.customer_name}</p>
                    <p className="text-sm text-warm-600">
                      {format(new Date(attendance.attendance_date), 'HH:mm')}
                    </p>
                  </div>
                  {attendance.class_type && (
                    <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm rounded-full">
                      {attendance.class_type}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 최근 등록 회원 */}
        <div className="card">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            최근 등록 회원
          </h2>
          <div className="space-y-3">
            {recentCustomers.length === 0 ? (
              <p className="text-warm-500 text-center py-8">등록된 회원이 없습니다</p>
            ) : (
              recentCustomers.map((customer) => (
                <div key={customer.id} className="flex items-center justify-between p-3 bg-warm-50 rounded-lg hover:bg-warm-100 transition-colors">
                  <div>
                    <p className="font-medium text-primary-800">{customer.name}</p>
                    <p className="text-sm text-warm-600">{customer.phone}</p>
                  </div>
                  <div className="text-right text-sm text-warm-600">
                    <p>회원권 {customer.membership_count}개</p>
                    <p>출석 {customer.total_attendance}회</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
