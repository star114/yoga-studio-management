import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { classAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';
import { formatKoreanDateTime, formatKoreanTime } from '../utils/dateFormat';

interface YogaClass {
  id: number;
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  is_open: boolean;
  notes?: string | null;
  current_enrollment?: number;
  remaining_seats?: number;
  class_status?: 'open' | 'closed' | 'in_progress' | 'completed';
}

interface ClassForm {
  title: string;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity: string;
  is_open: boolean;
  notes: string;
}

const INITIAL_FORM: ClassForm = {
  title: '',
  class_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '09:00',
  end_time: '10:00',
  max_capacity: '6',
  is_open: true,
  notes: '',
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];
const PAGE_SIZE = 10;

export const buildRecurringDates = (startDate: string, endDate: string, weekdays: number[]): string[] => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const weekdaySet = new Set(weekdays);
  const cursor = new Date(start);
  const dates: string[] = [];

  while (cursor <= end) {
    if (weekdaySet.has(cursor.getDay())) {
      dates.push(format(cursor, 'yyyy-MM-dd'));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const getClassStatusIndicator = (item: YogaClass) => {
  switch (item.class_status) {
    case 'completed':
      return { label: '완료', dotClassName: 'bg-slate-500' };
    case 'in_progress':
      return { label: '진행중', dotClassName: 'bg-blue-500' };
    case 'closed':
      return { label: '닫힘', dotClassName: 'bg-gray-500' };
    default:
      return { label: '오픈', dotClassName: 'bg-green-500' };
  }
};

const STATUS_LEGEND = [
  { key: 'open', label: '오픈', dotClassName: 'bg-green-500' },
  { key: 'in_progress', label: '진행중', dotClassName: 'bg-blue-500' },
  { key: 'completed', label: '완료', dotClassName: 'bg-slate-500' },
  { key: 'closed', label: '닫힘', dotClassName: 'bg-gray-500' },
] as const;

const ClassManagement: React.FC = () => {
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [form, setForm] = useState<ClassForm>(INITIAL_FORM);
  const [search, setSearch] = useState('');
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftShowOpenOnly, setDraftShowOpenOnly] = useState(false);
  const [draftDateFromFilter, setDraftDateFromFilter] = useState('');
  const [draftDateToFilter, setDraftDateToFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [isRecurringCreate, setIsRecurringCreate] = useState(false);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(INITIAL_FORM.class_date);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
  const filteredClasses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return classes.filter((item) => {
      if (showOpenOnly && item.class_status !== 'open') {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.title.toLowerCase().includes(keyword)
      );
    });
  }, [classes, search, showOpenOnly]);

  const totalClasses = filteredClasses.length;
  const totalPages = Math.max(1, Math.ceil(totalClasses / PAGE_SIZE));
  const pagedClasses = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredClasses.slice(start, start + PAGE_SIZE);
  }, [filteredClasses, page]);

  const pageItems = useMemo(() => {
    const pages: Array<number | 'ellipsis'> = [];
    if (totalPages <= 7) {
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        pages.push(pageNumber);
      }
      return pages;
    }

    pages.push(1);
    if (page > 4) {
      pages.push('ellipsis');
    }
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.push(pageNumber);
    }
    if (page < totalPages - 3) {
      pages.push('ellipsis');
    }
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  const loadClasses = useCallback(async (showLoading = false) => {
    try {
      setError('');
      if (showLoading) {
        setIsLoading(true);
      }

      if (dateFromFilter && dateToFilter && dateFromFilter > dateToFilter) {
        setError('기간 필터를 확인하세요. 시작일은 종료일보다 늦을 수 없습니다.');
        setClasses([]);
        return;
      }

      const params: Record<string, string> = {};
      if (dateFromFilter) {
        params.date_from = dateFromFilter;
      }
      if (dateToFilter) {
        params.date_to = dateToFilter;
      }

      const response = await classAPI.getAll(Object.keys(params).length > 0 ? params : undefined);
      setClasses(response.data);
    } catch (loadError) {
      console.error('Failed to load classes:', loadError);
      setError('수업 목록을 불러오지 못했습니다.');
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [dateFromFilter, dateToFilter]);

  useEffect(() => {
    void loadClasses(true);
  }, [loadClasses]);

  useEffect(() => {
    setPage(1);
  }, [search, showOpenOnly]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleFormChange = (key: keyof ClassForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value } as ClassForm));
  };

  const toggleWeekday = (weekday: number) => {
    setRecurrenceWeekdays((prev) => (
      prev.includes(weekday)
        ? prev.filter((item) => item !== weekday)
        : [...prev, weekday].sort((a, b) => a - b)
    ));
  };

  const validateForm = (): string | null => {
    if (!form.title.trim()) return '수업명은 필수입니다.';
    if (!form.class_date) return '수업 날짜를 입력하세요.';
    if (!form.start_time || !form.end_time) return '시작/종료 시간을 입력하세요.';
    if (form.start_time >= form.end_time) return '종료 시간은 시작 시간보다 늦어야 합니다.';
    const cap = Number(form.max_capacity);
    if (!Number.isInteger(cap) || cap < 1) return '제한 인원은 1명 이상 정수여야 합니다.';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormNotice('');

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (isRecurringCreate) {
      if (!recurrenceEndDate) {
        setFormError('반복 종료 날짜를 입력하세요.');
        return;
      }
      if (recurrenceEndDate < form.class_date) {
        setFormError('반복 종료 날짜는 시작 날짜보다 같거나 늦어야 합니다.');
        return;
      }
      if (recurrenceWeekdays.length === 0) {
        setFormError('반복 요일을 1개 이상 선택하세요.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        class_date: form.class_date,
        start_time: form.start_time,
        end_time: form.end_time,
        max_capacity: Number(form.max_capacity),
        is_open: form.is_open,
        notes: form.notes.trim() || null,
      };

      if (isRecurringCreate) {
        const recurringDates = buildRecurringDates(form.class_date, recurrenceEndDate, recurrenceWeekdays);
        if (recurringDates.length === 0) {
          setFormError('선택한 조건에 맞는 반복 수업 날짜가 없습니다.');
          return;
        }

        const recurringRes = await classAPI.createRecurring({
          ...payload,
          recurrence_start_date: form.class_date,
          recurrence_end_date: recurrenceEndDate,
          weekdays: recurrenceWeekdays,
        });
        const createdCount = Number(recurringRes.data?.created_count ?? 0);
        setFormNotice(`반복 수업이 ${createdCount}건 생성되었습니다.`);
      } else {
        await classAPI.create(payload);
        setFormNotice('수업이 추가되었습니다.');
      }

      await loadClasses();
      setForm(INITIAL_FORM);
      setIsRecurringCreate(false);
      setRecurrenceEndDate(INITIAL_FORM.class_date);
      setRecurrenceWeekdays([]);
    } catch (submitError: unknown) {
      console.error('Failed to save class:', submitError);
      setFormError(parseApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: YogaClass) => {
    const ok = window.confirm(`"${item.title}" 수업을 삭제할까요?`);
    if (!ok) return;

    try {
      await classAPI.delete(item.id);
      await loadClasses();
    } catch (deleteError: unknown) {
      console.error('Failed to delete class:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  const openFilterModal = () => {
    setDraftShowOpenOnly(showOpenOnly);
    setDraftDateFromFilter(dateFromFilter);
    setDraftDateToFilter(dateToFilter);
    setIsFilterModalOpen(true);
  };

  const applyFilterModal = () => {
    setShowOpenOnly(draftShowOpenOnly);
    setDateFromFilter(draftDateFromFilter);
    setDateToFilter(draftDateToFilter);
    setIsFilterModalOpen(false);
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">수업 관리</h1>
        <p className="text-warm-600">수업 생성/삭제와 전체 목록 필터링을 관리합니다.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="card xl:col-span-2">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            수업 추가
          </h2>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label" htmlFor="class-title">수업명</label>
              <input
                id="class-title"
                className="input-field"
                value={form.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="class-date">수업 날짜</label>
              <input
                id="class-date"
                type="date"
                className="input-field"
                value={form.class_date}
                onChange={(e) => {
                  handleFormChange('class_date', e.target.value);
                  if (isRecurringCreate && recurrenceEndDate < e.target.value) {
                    setRecurrenceEndDate(e.target.value);
                  }
                }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="class-start">시작 시간</label>
                <input
                  id="class-start"
                  type="time"
                  className="input-field"
                  value={form.start_time}
                  onChange={(e) => handleFormChange('start_time', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="class-end">종료 시간</label>
                <input
                  id="class-end"
                  type="time"
                  className="input-field"
                  value={form.end_time}
                  onChange={(e) => handleFormChange('end_time', e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="class-capacity">제한 인원</label>
              <input
                id="class-capacity"
                type="number"
                min={1}
                className="input-field"
                value={form.max_capacity}
                onChange={(e) => handleFormChange('max_capacity', e.target.value)}
                required
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-warm-700">
              <input
                type="checkbox"
                checked={form.is_open}
                onChange={(e) => handleFormChange('is_open', e.target.checked)}
              />
              오픈 상태
            </label>

            <div className="space-y-3 rounded-lg border border-warm-200 bg-warm-50 p-3">
              <label className="inline-flex items-center gap-2 text-sm text-warm-700">
                <input
                  type="checkbox"
                  checked={isRecurringCreate}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsRecurringCreate(checked);
                    if (checked) {
                      setRecurrenceEndDate(form.class_date);
                      setRecurrenceWeekdays([new Date(`${form.class_date}T00:00:00`).getDay()]);
                    } else {
                      setRecurrenceWeekdays([]);
                    }
                  }}
                />
                반복 일정으로 생성
              </label>

              {isRecurringCreate && (
                <div className="space-y-3">
                  <div>
                    <label className="label" htmlFor="recurrence-end-date">반복 종료 날짜</label>
                    <input
                      id="recurrence-end-date"
                      type="date"
                      className="input-field"
                      min={form.class_date}
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <p className="label mb-1">반복 요일</p>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_OPTIONS.map((option) => (
                        <label key={option.value} className="inline-flex items-center gap-1 text-sm text-warm-700">
                          <input
                            type="checkbox"
                            checked={recurrenceWeekdays.includes(option.value)}
                            onChange={() => toggleWeekday(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="class-notes">메모</label>
              <textarea
                id="class-notes"
                className="input-field min-h-[84px]"
                value={form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}
            {formNotice && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {formNotice}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '저장 중...' : '수업 추가'}
              </button>
            </div>
          </form>
        </section>

        <section className="card xl:col-span-3">
          <div className="space-y-3 mb-4">
            <div className="space-y-1">
              <h2 className="text-xl font-display font-semibold text-primary-800">전체 수업 목록</h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-warm-700">
                {STATUS_LEGEND.map((status) => (
                  <span key={status.key} className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${status.dotClassName}`}
                      aria-hidden="true"
                    />
                    {status.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap"
                  onClick={openFilterModal}
                >
                  필터
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <input
                  className="input-field w-full sm:w-64 md:w-72"
                  placeholder="수업명 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <p className="text-sm text-warm-600 whitespace-nowrap">
                  총 {totalClasses}건 · {page}/{totalPages} 페이지
                </p>
              </div>
            </div>
          </div>

          {isFilterModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl border border-warm-200 bg-white p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-display font-semibold text-primary-800">필터 설정</h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsFilterModalOpen(false)}
                  >
                    닫기
                  </button>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-warm-700">
                  <input
                    type="checkbox"
                    checked={draftShowOpenOnly}
                    onChange={(e) => setDraftShowOpenOnly(e.target.checked)}
                  />
                  오픈 수업만 보기
                </label>

                <div className="space-y-3">
                  <div>
                    <label className="label" htmlFor="filter-date-from">시작일</label>
                    <input
                      id="filter-date-from"
                      type="date"
                      className="input-field"
                      value={draftDateFromFilter}
                      onChange={(e) => setDraftDateFromFilter(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="filter-date-to">종료일</label>
                    <input
                      id="filter-date-to"
                      type="date"
                      className="input-field"
                      value={draftDateToFilter}
                      onChange={(e) => setDraftDateToFilter(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap"
                    onClick={() => {
                      setDraftShowOpenOnly(false);
                      setDraftDateFromFilter('');
                      setDraftDateToFilter('');
                    }}
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap"
                    onClick={() => setIsFilterModalOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="btn-primary whitespace-nowrap"
                    onClick={applyFilterModal}
                  >
                    적용
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          {isLoading ? (
            <p className="text-warm-600 py-8 text-center">수업 목록 불러오는 중...</p>
          ) : filteredClasses.length === 0 ? (
            <p className="text-warm-600 py-8 text-center">표시할 수업이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200 text-left text-warm-600">
                      <th className="py-2 pr-4">수업명</th>
                      <th className="py-2 pr-4">일정</th>
                      <th className="py-2 pr-4">제한 인원</th>
                      <th className="py-2 pr-4">신청 인원</th>
                      <th className="py-2 pr-4">잔여 자리</th>
                      <th className="py-2 pr-4">상태</th>
                      <th className="py-2 pr-0 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedClasses.map((item) => {
                      const status = getClassStatusIndicator(item);
                      return (
                        <tr key={item.id} className="border-b border-warm-100">
                          <td className="py-3 pr-4 font-medium text-primary-800">{item.title}</td>
                          <td className="py-3 pr-4">{formatKoreanDateTime(item.class_date, item.start_time)} ~ {formatKoreanTime(item.end_time)}</td>
                          <td className="py-3 pr-4">{item.max_capacity}명</td>
                          <td className="py-3 pr-4">{item.current_enrollment ?? 0}명</td>
                          <td className="py-3 pr-4">
                            <span className={`${(item.remaining_seats ?? item.max_capacity) === 0 ? 'text-red-700 font-semibold' : ''}`}>
                              {item.remaining_seats ?? item.max_capacity}자리
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block h-3 w-3 rounded-full ${status.dotClassName}`}
                              role="img"
                              aria-label={`상태: ${status.label}`}
                              title={status.label}
                            />
                          </td>
                          <td className="py-3 pr-0">
                            <div className="flex justify-end gap-2">
                              <Link
                                to={`/classes/${item.id}`}
                                className="px-3 py-1.5 rounded-md bg-primary-100 text-primary-800 hover:bg-primary-200"
                              >
                                상세
                              </Link>
                              <button
                                type="button"
                                onClick={() => void handleDelete(item)}
                                className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1">
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  이전
                </button>
                {pageItems.map((item, index) => (
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-warm-500">...</span>
                  ) : (
                    <button
                      key={`page-${item}`}
                      type="button"
                      className={item === page ? 'btn-primary min-w-[36px]' : 'btn-secondary min-w-[36px]'}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  )
                ))}
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ClassManagement;
