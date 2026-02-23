import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { attendanceAPI, classAPI } from '../services/api';
import { format } from 'date-fns';

interface CustomerAttendance {
  id: number;
  attendance_date: string;
  class_type?: string | null;
  class_title?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  instructor_comment?: string | null;
}

interface MyRegistrationClass {
  registration_id: number;
  class_id: number;
  title: string;
  instructor_name?: string | null;
  class_date: string;
  start_time: string;
  end_time: string;
  is_open: boolean;
  is_excluded: boolean;
}

const CustomerDashboard: React.FC = () => {
  const { customerInfo } = useAuth();
  const [attendances, setAttendances] = useState<CustomerAttendance[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<MyRegistrationClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAttendanceData = useCallback(async () => {
    try {
      const [attendancesRes, registrationsRes] = await Promise.all([
        attendanceAPI.getAll({ customer_id: customerInfo.id, limit: 20 }),
        classAPI.getMyRegistrations(),
      ]);

      setAttendances(attendancesRes.data);

      const now = new Date();
      const nextClasses = (registrationsRes.data as MyRegistrationClass[]).filter((item) => {
        const classStartAt = new Date(`${String(item.class_date).slice(0, 10)}T${String(item.start_time).slice(0, 8)}`);
        return classStartAt >= now && !item.is_excluded;
      });
      setUpcomingClasses(nextClasses);
    } catch (error) {
      console.error('Failed to load attendance data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerInfo]);

  useEffect(() => {
    if (customerInfo) {
      void loadAttendanceData();
    }
  }, [customerInfo, loadAttendanceData]);

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
        <p className="text-warm-600">수련의 흐름과 몸과 마음의 상태를 간단히 기록하고 나누는 공간입니다.</p>
      </div>

      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
          다음 수업
        </h2>
        <div className="space-y-3">
          {upcomingClasses.length === 0 ? (
            <p className="text-warm-500 text-center py-8">예정된 수업이 없습니다</p>
          ) : (
            upcomingClasses.map((item) => (
              <div key={item.registration_id} className="p-4 bg-primary-50 rounded-lg border border-primary-100">
                <p className="font-semibold text-primary-800">{item.title}</p>
                <p className="text-sm text-warm-700 mt-1">
                  {item.class_date.slice(0, 10)} {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                </p>
                {item.instructor_name && (
                  <p className="text-sm text-warm-600 mt-1">강사: {item.instructor_name}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
          지난 수업
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
