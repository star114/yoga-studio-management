import React, { useEffect, useMemo, useState } from 'react';
import { classAPI, customerAPI } from '../services/api';
import { parseApiError } from '../utils/apiError';

interface YogaClass {
  id: number;
  title: string;
  instructor_name?: string | null;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  is_open: boolean;
  is_excluded?: boolean;
  excluded_reason?: string | null;
  recurring_series_id?: number | null;
  notes?: string | null;
  current_enrollment?: number;
  remaining_seats?: number;
}

interface ClassForm {
  title: string;
  instructor_name: string;
  class_date: string;
  start_time: string;
  end_time: string;
  max_capacity: string;
  is_open: boolean;
  notes: string;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
}

interface ClassRegistration {
  id: number;
  class_id: number;
  customer_id: number;
  registered_at: string;
  customer_name: string;
  customer_phone: string;
}

const INITIAL_FORM: ClassForm = {
  title: '',
  instructor_name: '',
  class_date: new Date().toISOString().slice(0, 10),
  start_time: '09:00',
  end_time: '10:00',
  max_capacity: '10',
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

const ClassManagement: React.FC = () => {
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [registrations, setRegistrations] = useState<ClassRegistration[]>([]);
  const [form, setForm] = useState<ClassForm>(INITIAL_FORM);
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRegistrations, setIsLoadingRegistrations] = useState(false);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  const [registrationNotice, setRegistrationNotice] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [isRecurringCreate, setIsRecurringCreate] = useState(false);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(INITIAL_FORM.class_date);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);

  const isEditMode = editingClassId !== null;
  const selectedClass = classes.find((item) => item.id === selectedClassId) || null;
  const unregisteredCustomers = useMemo(() => {
    const registeredIds = new Set(registrations.map((item) => item.customer_id));
    return customers.filter((item) => !registeredIds.has(item.id));
  }, [customers, registrations]);

  const filteredClasses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return classes.filter((item) => {
      if (showOpenOnly && !item.is_open) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.title.toLowerCase().includes(keyword)
        || (item.instructor_name || '').toLowerCase().includes(keyword)
      );
    });
  }, [classes, search, showOpenOnly]);

  useEffect(() => {
    void initializeData();
  }, []);

  useEffect(() => {
    if (selectedClassId !== null) {
      void loadRegistrations(selectedClassId);
    } else {
      setRegistrations([]);
    }
  }, [selectedClassId]);

  const initializeData = async () => {
    try {
      setError('');
      setIsLoading(true);
      const [classRes, customerRes] = await Promise.all([
        classAPI.getAll(),
        customerAPI.getAll(),
      ]);
      setClasses(classRes.data);
      setCustomers(customerRes.data);
      if (classRes.data.length > 0) {
        setSelectedClassId(classRes.data[0].id);
      }
    } catch (loadError) {
      console.error('Failed to initialize class page:', loadError);
      setError('기초 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadClasses = async () => {
    try {
      setError('');
      const response = await classAPI.getAll();
      setClasses(response.data);
      if (selectedClassId !== null && !response.data.some((item: YogaClass) => item.id === selectedClassId)) {
        setSelectedClassId(response.data.length > 0 ? response.data[0].id : null);
      }
    } catch (loadError) {
      console.error('Failed to load classes:', loadError);
      setError('수업 목록을 불러오지 못했습니다.');
    }
  };

  const loadRegistrations = async (classId: number) => {
    try {
      setRegistrationError('');
      setIsLoadingRegistrations(true);
      const response = await classAPI.getRegistrations(classId);
      setRegistrations(response.data);
    } catch (loadError) {
      console.error('Failed to load registrations:', loadError);
      setRegistrationError('신청자 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingRegistrations(false);
    }
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFormError('');
    setFormNotice('');
    setEditingClassId(null);
    setIsRecurringCreate(false);
    setRecurrenceEndDate(INITIAL_FORM.class_date);
    setRecurrenceWeekdays([]);
  };

  const startEdit = (item: YogaClass) => {
    setEditingClassId(item.id);
    setFormError('');
    setFormNotice('');
    setIsRecurringCreate(false);
    setForm({
      title: item.title,
      instructor_name: item.instructor_name || '',
      class_date: item.class_date.slice(0, 10),
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5),
      max_capacity: String(item.max_capacity),
      is_open: item.is_open,
      notes: item.notes || '',
    });
  };

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

    if (!isEditMode && isRecurringCreate) {
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
        instructor_name: form.instructor_name.trim() || null,
        class_date: form.class_date,
        start_time: form.start_time,
        end_time: form.end_time,
        max_capacity: Number(form.max_capacity),
        is_open: form.is_open,
        notes: form.notes.trim() || null,
      };

      if (isEditMode && editingClassId) {
        await classAPI.update(editingClassId, payload);
        setFormNotice('수업 정보가 수정되었습니다.');
      } else if (isRecurringCreate) {
        const recurringRes = await classAPI.createRecurring({
          ...payload,
          recurrence_start_date: form.class_date,
          recurrence_end_date: recurrenceEndDate,
          weekdays: recurrenceWeekdays,
        });
        setFormNotice(`반복 수업이 ${recurringRes.data.created_count || 0}건 생성되었습니다.`);
      } else {
        await classAPI.create(payload);
        setFormNotice('수업이 추가되었습니다.');
      }

      await loadClasses();
      if (!isEditMode) {
        setForm(INITIAL_FORM);
        setIsRecurringCreate(false);
        setRecurrenceEndDate(INITIAL_FORM.class_date);
        setRecurrenceWeekdays([]);
      }
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
      if (editingClassId === item.id) {
        resetForm();
      }
    } catch (deleteError: unknown) {
      console.error('Failed to delete class:', deleteError);
      setError(parseApiError(deleteError));
    }
  };

  const handleExcludeRecurringOccurrence = async (item: YogaClass) => {
    if (!item.recurring_series_id) return;

    const targetDate = item.class_date.slice(0, 10);
    const ok = window.confirm(`${targetDate} 회차를 반복 일정에서 제외할까요?`);
    if (!ok) return;

    const reasonInput = window.prompt('제외 사유를 입력하세요. (선택)', '');

    try {
      await classAPI.excludeRecurringOccurrence(
        item.recurring_series_id,
        targetDate,
        item.id,
        reasonInput?.trim() || undefined
      );
      await loadClasses();
      setFormNotice(`${targetDate} 회차가 제외되었습니다.`);
    } catch (excludeError: unknown) {
      console.error('Failed to exclude recurring occurrence:', excludeError);
      setError(parseApiError(excludeError));
    }
  };

  const handleManualRegister = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedClassId) {
      setRegistrationError('수업을 먼저 선택하세요.');
      return;
    }
    if (!selectedCustomerId) {
      setRegistrationError('신청할 고객을 선택하세요.');
      return;
    }

    try {
      setRegistrationError('');
      setRegistrationNotice('');
      setIsRegisterSubmitting(true);
      await classAPI.register(selectedClassId, { customer_id: Number(selectedCustomerId) });
      setSelectedCustomerId('');
      await Promise.all([loadRegistrations(selectedClassId), loadClasses()]);
      setRegistrationNotice('수동 신청이 등록되었습니다.');
    } catch (registerError: unknown) {
      console.error('Failed to register customer manually:', registerError);
      setRegistrationError(parseApiError(registerError));
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  const handleCancelRegistration = async (customerId: number) => {
    if (!selectedClassId) return;

    const ok = window.confirm('해당 고객의 수업 신청을 취소할까요?');
    if (!ok) return;

    try {
      setRegistrationError('');
      setRegistrationNotice('');
      await classAPI.cancelRegistration(selectedClassId, customerId);
      await Promise.all([loadRegistrations(selectedClassId), loadClasses()]);
      setRegistrationNotice('신청이 취소되었습니다.');
    } catch (cancelError: unknown) {
      console.error('Failed to cancel registration:', cancelError);
      setRegistrationError(parseApiError(cancelError));
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-primary-800">수업 관리</h1>
        <p className="text-warm-600">전체 수업을 확인하고 오픈 상태 표기와 함께 추가/수정/삭제 및 제한 인원을 관리합니다.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="card xl:col-span-2">
          <h2 className="text-xl font-display font-semibold text-primary-800 mb-4">
            {isEditMode ? '수업 수정' : '수업 추가'}
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
              <label className="label" htmlFor="class-instructor">강사명</label>
              <input
                id="class-instructor"
                className="input-field"
                value={form.instructor_name}
                onChange={(e) => handleFormChange('instructor_name', e.target.value)}
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

            {!isEditMode && (
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
            )}

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
                {isSubmitting ? '저장 중...' : isEditMode ? '수업 저장' : '수업 추가'}
              </button>
              {isEditMode && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  취소
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card xl:col-span-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl font-display font-semibold text-primary-800">전체 수업 목록</h2>
            <div className="flex gap-2">
              <input
                className="input-field md:max-w-xs"
                placeholder="수업명/강사명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                onClick={() => setShowOpenOnly((prev) => !prev)}
              >
                {showOpenOnly ? '전체 보기' : '오픈만 보기'}
              </button>
            </div>
          </div>

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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 text-left text-warm-600">
                    <th className="py-2 pr-4">수업명</th>
                    <th className="py-2 pr-4">강사</th>
                    <th className="py-2 pr-4">일정</th>
                    <th className="py-2 pr-4">제한 인원</th>
                    <th className="py-2 pr-4">신청 인원</th>
                    <th className="py-2 pr-4">잔여 자리</th>
                    <th className="py-2 pr-4">상태</th>
                    <th className="py-2 pr-0 text-right">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map((item) => (
                    <tr key={item.id} className="border-b border-warm-100">
                      <td className="py-3 pr-4 font-medium text-primary-800">{item.title}</td>
                      <td className="py-3 pr-4">{item.instructor_name || '-'}</td>
                      <td className="py-3 pr-4">{item.class_date.slice(0, 10)} {item.start_time.slice(0, 5)}-{item.end_time.slice(0, 5)}</td>
                      <td className="py-3 pr-4">{item.max_capacity}명</td>
                      <td className="py-3 pr-4">{item.current_enrollment ?? 0}명</td>
                      <td className="py-3 pr-4">
                        <span className={`${(item.remaining_seats ?? item.max_capacity) === 0 ? 'text-red-700 font-semibold' : ''}`}>
                          {item.remaining_seats ?? item.max_capacity}자리
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          item.is_excluded
                            ? 'bg-red-100 text-red-700'
                            : item.is_open
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-700'
                        }`}>
                          {item.is_excluded ? '제외' : item.is_open ? '오픈' : '닫힘'}
                        </span>
                      </td>
                      <td className="py-3 pr-0">
                        <div className="flex justify-end gap-2">
                          {item.recurring_series_id && !item.is_excluded && (
                            <button
                              type="button"
                              onClick={() => void handleExcludeRecurringOccurrence(item)}
                              className="px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200"
                            >
                              회차 제외
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="px-3 py-1.5 rounded-md bg-warm-100 text-primary-800 hover:bg-warm-200"
                          >
                            수정
                          </button>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-800">수업별 신청자 관리</h2>
            <p className="text-sm text-warm-600 mt-1">신청자 목록 확인, 수동 신청 등록, 신청 취소를 처리합니다.</p>
          </div>
          <select
            className="input-field md:max-w-sm"
            value={selectedClassId ?? ''}
            onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">수업 선택</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.class_date.slice(0, 10)} {item.start_time.slice(0, 5)} {item.title}
              </option>
            ))}
          </select>
        </div>

        {registrationError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {registrationError}
          </p>
        )}
        {registrationNotice && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
            {registrationNotice}
          </p>
        )}

        {selectedClass ? (
          <div className="space-y-4">
            <div className="bg-warm-50 border border-warm-200 rounded-lg px-4 py-3 text-sm text-warm-700">
              <span className="font-medium text-primary-800">{selectedClass.title}</span>
              <span> / {selectedClass.class_date.slice(0, 10)} {selectedClass.start_time.slice(0, 5)}-{selectedClass.end_time.slice(0, 5)}</span>
              <span> / 신청 {selectedClass.current_enrollment ?? 0}명 / 잔여 {selectedClass.remaining_seats ?? selectedClass.max_capacity}자리</span>
            </div>

            <form className="flex flex-col md:flex-row gap-3" onSubmit={handleManualRegister}>
              <select
                className="input-field md:max-w-sm"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">신청할 고객 선택</option>
                {unregisteredCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.phone})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isRegisterSubmitting || !selectedClass.is_open || !!selectedClass.is_excluded}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegisterSubmitting ? '등록 중...' : '수동 신청 등록'}
              </button>
            </form>

            {isLoadingRegistrations ? (
              <p className="text-warm-600 py-4">신청자 목록 불러오는 중...</p>
            ) : registrations.length === 0 ? (
              <p className="text-warm-600 py-4">신청자가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200 text-left text-warm-600">
                      <th className="py-2 pr-4">이름</th>
                      <th className="py-2 pr-4">전화번호</th>
                      <th className="py-2 pr-4">신청 시각</th>
                      <th className="py-2 pr-0 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((registration) => (
                      <tr key={registration.id} className="border-b border-warm-100">
                        <td className="py-3 pr-4 font-medium text-primary-800">{registration.customer_name}</td>
                        <td className="py-3 pr-4">{registration.customer_phone}</td>
                        <td className="py-3 pr-4">{new Date(registration.registered_at).toLocaleString('ko-KR')}</td>
                        <td className="py-3 pr-0">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => void handleCancelRegistration(registration.customer_id)}
                              className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200"
                            >
                              신청 취소
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-warm-600 py-4">신청자 관리를 위해 수업을 선택하세요.</p>
        )}
      </section>
    </div>
  );
};

export default ClassManagement;
