import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { membershipAPI } from '../services/api';
import { formatKoreanDate } from '../utils/dateFormat';

interface CustomerMembership {
  id: number;
  membership_type_name: string;
  remaining_sessions?: number | null;
  is_active: boolean;
  start_date?: string | null;
  expected_end_date?: string | null;
}

const CustomerMemberships: React.FC = () => {
  const { customerInfo } = useAuth();
  const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadMemberships = useCallback(async () => {
    try {
      const response = await membershipAPI.getByCustomer(customerInfo.id);
      setMemberships(response.data);
    } catch (error) {
      console.error('Failed to load memberships:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerInfo]);

  useEffect(() => {
    if (customerInfo) {
      void loadMemberships();
    }
  }, [customerInfo, loadMemberships]);

  const activeMemberships = useMemo(
    () => memberships.filter((membership) => membership.is_active),
    [memberships]
  );

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
        <h1 className="text-3xl font-display font-bold text-primary-800 mb-2">회원권</h1>
        <p className="text-warm-600">{customerInfo?.name}님의 회원권 현황입니다.</p>
      </div>

      <div className="card">
        <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">활성 회원권</h2>
        <div className="space-y-4">
          {activeMemberships.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-warm-500 mb-2">활성화된 회원권이 없습니다</p>
              <p className="text-sm text-warm-400">원장님께 문의해주세요</p>
            </div>
          ) : (
            activeMemberships.map((membership) => (
              <div key={membership.id} className="p-4 bg-primary-50 rounded-lg border border-primary-100 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-primary-800 text-lg">{membership.membership_type_name}</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">활성</span>
                </div>

                <div className="space-y-1.5 text-sm text-warm-700">
                  <p>
                    <span className="text-warm-600">잔여 횟수:</span>{' '}
                    <span className="font-semibold text-primary-800">
                      {membership.remaining_sessions === null || membership.remaining_sessions === undefined
                        ? '무제한'
                        : `${membership.remaining_sessions}회`}
                    </span>
                  </p>
                  <p>
                    <span className="text-warm-600">시작일:</span>{' '}
                    <span className="font-medium text-primary-800">
                      {membership.start_date ? formatKoreanDate(membership.start_date, false) : '-'}
                    </span>
                  </p>
                  <p>
                    <span className="text-warm-600">예상 종료일:</span>{' '}
                    <span className="font-medium text-primary-800">
                      {membership.expected_end_date ? formatKoreanDate(membership.expected_end_date, false) : '-'}
                    </span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerMemberships;
