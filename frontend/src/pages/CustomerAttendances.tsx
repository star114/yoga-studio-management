import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { customerAPI } from '../services/api';
import { formatKoreanDateTime } from '../utils/dateFormat';

interface Attendance {
  id: number;
  attendance_date: string;
  class_title?: string | null;
  class_type?: string | null;
  class_date?: string | null;
  class_start_time?: string | null;
  instructor_comment?: string | null;
}

interface AttendanceResponse {
  items: Attendance[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

const PAGE_SIZE = 20;

const CustomerAttendances: React.FC = () => {
  const { id } = useParams();
  const customerId = Number(id);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthsFilter, setMonthsFilter] = useState<'all' | 3 | 6>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const hasValidCustomerId = useMemo(() => Number.isInteger(customerId) && customerId > 0, [customerId]);
  const groupedAttendances = useMemo(() => {
    return attendances.reduce<Array<{ monthLabel: string; items: Attendance[] }>>((acc, attendance) => {
      const monthLabel = format(parseISO(attendance.attendance_date), 'yyyy년 M월');
      const last = acc[acc.length - 1];
      if (!last || last.monthLabel !== monthLabel) {
        acc.push({ monthLabel, items: [attendance] });
        return acc;
      }
      last.items.push(attendance);
      return acc;
    }, []);
  }, [attendances]);

  useEffect(() => {
    if (!hasValidCustomerId) {
      setError('유효하지 않은 고객 ID입니다.');
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        setError('');
        setIsLoading(true);
        const response = await customerAPI.getAttendances(customerId, {
          page,
          page_size: PAGE_SIZE,
          ...(monthsFilter === 'all' ? {} : { months: monthsFilter }),
        });
        const data = response.data as Attendance[] | AttendanceResponse;

        if (Array.isArray(data)) {
          setAttendances(data);
          setTotal(data.length);
          setTotalPages(1);
          return;
        }

        setAttendances(data.items || []);
        setTotal(data.pagination?.total ?? 0);
        setTotalPages(data.pagination?.total_pages ?? 1);
      } catch (loadError) {
        console.error('Failed to load customer attendances:', loadError);
        setError('출석 기록을 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [customerId, hasValidCustomerId, monthsFilter, page]);

  const handleFilterChange = (nextFilter: 'all' | 3 | 6) => {
    setMonthsFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary-800">출석 수업 전체 내역</h1>
          <p className="text-warm-600">이 고객의 출석 수업과 수업 후 강사 코멘트를 모두 확인합니다.</p>
        </div>
        <Link to={`/customers/${customerId}`} className="btn-secondary">고객 상세로</Link>
      </div>

      <section className="card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              className={monthsFilter === 'all' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => handleFilterChange('all')}
            >
              전체
            </button>
            <button
              type="button"
              className={monthsFilter === 3 ? 'btn-primary' : 'btn-secondary'}
              onClick={() => handleFilterChange(3)}
            >
              최근 3개월
            </button>
            <button
              type="button"
              className={monthsFilter === 6 ? 'btn-primary' : 'btn-secondary'}
              onClick={() => handleFilterChange(6)}
            >
              최근 6개월
            </button>
          </div>
          <p className="text-sm text-warm-600">
            총 {total}건 · {page}/{Math.max(1, totalPages)} 페이지
          </p>
        </div>
      </section>

      {isLoading ? (
        <div className="card">
          <p className="text-warm-600 py-8 text-center">출석 기록 불러오는 중...</p>
        </div>
      ) : error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      ) : attendances.length === 0 ? (
        <div className="card">
          <p className="text-warm-600 py-8 text-center">출석 기록이 없습니다.</p>
        </div>
      ) : (
        <section className="card">
          <div className="space-y-6">
            {groupedAttendances.map((group) => (
              <div key={group.monthLabel} className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-primary-800">{group.monthLabel}</h2>
                {group.items.map((attendance) => (
                  <div key={attendance.id} className="rounded-lg border border-warm-200 bg-warm-50 p-4">
                    <p className="text-primary-800 font-medium">
                      {attendance.class_title || attendance.class_type || '수업 정보 없음'}
                    </p>
                    <p className="text-sm text-warm-700 mt-1">
                      {attendance.class_date && attendance.class_start_time
                        ? `수업일시: ${formatKoreanDateTime(attendance.class_date, attendance.class_start_time)}`
                        : '-'}
                    </p>
                    <p className="text-sm text-warm-700 mt-2">
                      수업 후 강사 코멘트: {attendance.instructor_comment?.trim() || '-'}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              이전
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              다음
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default CustomerAttendances;
