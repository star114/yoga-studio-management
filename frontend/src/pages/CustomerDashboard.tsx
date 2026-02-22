import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { membershipAPI, attendanceAPI } from '../services/api';
import { format } from 'date-fns';

interface CustomerMembership {
  id: number;
  membership_type_name: string;
  start_date: string;
  end_date?: string | null;
  remaining_sessions?: number | null;
  is_active: boolean;
}

interface CustomerAttendance {
  id: number;
  attendance_date: string;
  class_type?: string | null;
  class_title?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  instructor_comment?: string | null;
}

const CustomerDashboard: React.FC = () => {
  const { customerInfo } = useAuth();
  const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
  const [attendances, setAttendances] = useState<CustomerAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCustomerData = useCallback(async () => {
    try {
      const [membershipsRes, attendancesRes] = await Promise.all([
        membershipAPI.getByCustomer(customerInfo.id),
        attendanceAPI.getAll({ customer_id: customerInfo.id, limit: 10 }),
      ]);

      setMemberships(membershipsRes.data);
      setAttendances(attendancesRes.data);
    } catch (error) {
      console.error('Failed to load customer data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerInfo]);

  useEffect(() => {
    if (customerInfo) {
      void loadCustomerData();
    }
  }, [customerInfo, loadCustomerData]);

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

  const activeMemberships = memberships.filter((membership) => membership.is_active);

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary-800 mb-2">
          안녕하세요, {customerInfo?.name}님
        </h1>
        <p className="text-warm-600">오늘도 건강한 하루 되세요</p>
      </div>

      {/* 활성 회원권 */}
      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
          내 회원권
        </h2>
        <div className="space-y-4">
          {activeMemberships.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-warm-500 mb-2">활성화된 회원권이 없습니다</p>
              <p className="text-sm text-warm-400">원장님께 문의해주세요</p>
            </div>
          ) : (
            activeMemberships.map((membership) => (
              <div key={membership.id} className="p-4 bg-gradient-to-r from-primary-50 to-warm-50 rounded-lg border border-primary-100">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-primary-800 text-lg">
                      {membership.membership_type_name}
                    </h3>
                    <p className="text-sm text-warm-600 mt-1">
                      {format(new Date(membership.start_date), 'yyyy년 MM월 dd일')} 시작
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-medium">
                    활성
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {membership.remaining_sessions !== null && (
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-sm text-warm-600 mb-1">잔여 횟수</p>
                      <p className="text-2xl font-bold text-primary-800">
                        {membership.remaining_sessions}회
                      </p>
                    </div>
                  )}
                  {membership.end_date && (
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-sm text-warm-600 mb-1">종료일</p>
                      <p className="text-lg font-semibold text-primary-800">
                        {format(new Date(membership.end_date), 'MM/dd')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 최근 출석 기록 */}
      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
          최근 출석 기록
        </h2>
        <div className="space-y-3">
          {attendances.length === 0 ? (
            <p className="text-warm-500 text-center py-8">출석 기록이 없습니다</p>
          ) : (
            attendances.map((attendance) => (
              <div key={attendance.id} className="p-4 bg-warm-50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-primary-800">
                      {format(new Date(attendance.attendance_date), 'yyyy년 MM월 dd일 HH:mm')}
                    </p>
                    {(attendance.class_title || attendance.class_type) && (
                      <p className="text-sm text-warm-600 mt-1">
                        {attendance.class_title || attendance.class_type}
                        {attendance.class_date && attendance.class_start_time ? (
                          <> · {attendance.class_date.slice(0, 10)} {attendance.class_start_time.slice(0, 5)}</>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                {attendance.instructor_comment && (
                  <div className="mt-2 p-3 bg-white rounded border border-warm-100">
                    <p className="text-sm text-warm-700">
                      💬 {attendance.instructor_comment}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
