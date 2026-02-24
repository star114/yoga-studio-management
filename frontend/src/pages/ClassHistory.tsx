import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, subMonths } from 'date-fns';
import { classAPI } from '../services/api';
import { formatKoreanDateTime, formatKoreanTime } from '../utils/dateFormat';

interface YogaClass {
  id: number;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  class_status?: 'open' | 'closed' | 'in_progress' | 'completed' | 'excluded';
  current_enrollment?: number;
  remaining_seats?: number;
}

const PAGE_SIZE = 20;

const getClassStatusBadge = (item: YogaClass) => {
  switch (item.class_status) {
    case 'excluded':
      return { label: '제외', className: 'bg-red-100 text-red-700' };
    case 'completed':
      return { label: '완료', className: 'bg-slate-200 text-slate-700' };
    case 'in_progress':
      return { label: '진행중', className: 'bg-blue-100 text-blue-700' };
    case 'closed':
      return { label: '닫힘', className: 'bg-gray-200 text-gray-700' };
    default:
      return { label: '오픈', className: 'bg-green-100 text-green-700' };
  }
};

const ClassHistory: React.FC = () => {
  const [items, setItems] = useState<YogaClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthsFilter, setMonthsFilter] = useState<'all' | 3 | 6>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        setError('');
        setIsLoading(true);
        const response = await classAPI.getAll(
          monthsFilter === 'all'
            ? undefined
            : { date_from: format(subMonths(new Date(), monthsFilter), 'yyyy-MM-dd') }
        );
        setItems(response.data || []);
      } catch (loadError) {
        console.error('Failed to load class history:', loadError);
        setError('수업 전체 내역을 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [monthsFilter]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => item.title.toLowerCase().includes(keyword));
  }, [items, search]);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  const groupedItems = useMemo(() => {
    return pagedItems.reduce<Array<{ monthLabel: string; classes: YogaClass[] }>>((acc, item) => {
      const monthLabel = format(parseISO(item.class_date), 'yyyy년 M월');
      const last = acc[acc.length - 1];
      if (!last || last.monthLabel !== monthLabel) {
        acc.push({ monthLabel, classes: [item] });
        return acc;
      }
      last.classes.push(item);
      return acc;
    }, []);
  }, [pagedItems]);

  const handleFilterChange = (nextFilter: 'all' | 3 | 6) => {
    setMonthsFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary-800">수업 전체 내역</h1>
          <p className="text-warm-600">모든 수업 히스토리를 월별로 확인합니다.</p>
        </div>
        <Link to="/classes" className="btn-secondary">수업 관리로</Link>
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
          <div className="flex items-center gap-2">
            <input
              className="input-field md:w-72"
              placeholder="수업명 검색"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <p className="text-sm text-warm-600 whitespace-nowrap">
              총 {total}건 · {page}/{totalPages} 페이지
            </p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="card">
          <p className="text-warm-600 py-8 text-center">수업 내역 불러오는 중...</p>
        </div>
      ) : error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      ) : filteredItems.length === 0 ? (
        <div className="card">
          <p className="text-warm-600 py-8 text-center">표시할 수업이 없습니다.</p>
        </div>
      ) : (
        <section className="card">
          <div className="space-y-6">
            {groupedItems.map((group) => (
              <div key={group.monthLabel} className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-primary-800">{group.monthLabel}</h2>
                {group.classes.map((item) => {
                  const status = getClassStatusBadge(item);
                  return (
                    <div key={item.id} className="rounded-lg border border-warm-200 bg-warm-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-primary-800 font-medium">{item.title}</p>
                          <p className="text-sm text-warm-700 mt-1">
                            {formatKoreanDateTime(item.class_date, item.start_time)} ~ {formatKoreanTime(item.end_time)}
                          </p>
                          <p className="text-sm text-warm-700 mt-1">
                            신청 {item.current_enrollment ?? 0}명 · 잔여 {item.remaining_seats ?? item.max_capacity}자리
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${status.className}`}>
                            {status.label}
                          </span>
                          <Link to={`/classes/${item.id}`} className="btn-secondary text-sm">
                            상세
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

export default ClassHistory;
