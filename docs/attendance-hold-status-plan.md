# 수업 신청 Hold 상태 도입 플랜

## 목적
- 수업 신청 상태에 `hold`를 추가한다.
- `hold`는 회원권 차감 없이 신청을 보류하는 상태로 정의한다.
- `hold` 상태의 등록은 정원을 차지하지 않도록 한다.
- 출석 상태와 회원권 차감 여부가 운영 의미와 일치하도록 정리한다.

## 범위
- DB 스키마와 마이그레이션에 `attendance_status = 'hold'` 허용값 추가
- 수업 신청 상태 변경 API에 `hold` 상태 반영
- 정원 계산, 신청 가능 인원 계산, 자동 마감 로직에서 `hold` 제외
- 출석 처리 시 `hold` 등록을 실제 출석으로 전환할 수 있도록 로직 보강
- 관리자/고객 UI에 `hold` 상태 표시 추가
- 관련 backend/frontend 테스트 및 manual test 시나리오 갱신

## 비범위
- 별도 대기열(waitlist) 기능 도입
- 자동으로 `hold` 전환하는 정책 엔진 추가
- 출석 메시지 스레드/코멘트 기능 변경
- 운영 통계 화면에 `hold` 집계 추가
- 기존 `absent` 상태의 의미 변경

## 상태 의미
- `reserved`
  - 일반 신청 완료 상태
  - 정원을 차지한다
  - 아직 출석 확정 전이다
- `hold`
  - 관리자 합의로 신청을 보류한 상태
  - 정원을 차지하지 않는다
  - 회원권은 차감하지 않는다
- `attended`
  - 실제 출석 완료 상태
  - 회원권 차감 대상이다
- `absent`
  - 최종 결석 상태
  - 차감 여부는 이전 상태와 정책에 따라 결정되며, `hold -> absent`는 차감하지 않는다

## 상태 전이 원칙
- `reserved -> hold`
  - 허용
  - 정원에서 제외
  - 이미 차감된 회원권은 없어야 한다
- `hold -> reserved`
  - 허용
  - 다시 정원 점유 상태가 된다
  - 전환 시점에 정원이 꽉 찼으면 실패해야 한다
- `reserved -> attended`
  - 허용
  - 기존과 동일하게 출석 처리 및 차감 반영
- `hold -> attended`
  - 허용
  - 실제 출석 시점에만 차감 반영
- `reserved -> absent`
  - 기존 정책 유지
  - 현재 코드 기준으로 결석 처리 시 차감이 발생하는 흐름을 유지할지 검토 필요
- `hold -> absent`
  - 허용
  - 차감 없음
- `attended -> hold`
  - 허용
  - 관리자 보정 케이스로 취급한다
  - 이미 차감된 회원권은 자동 복구한다
  - 연결된 출석 기록이 있으면 회원권 차감 플래그와 함께 정합성을 맞춰야 한다
- `absent -> hold`
  - 기본 정책은 비허용
  - 허용하면 차감 환불과 출석 기록 정리가 함께 필요해 복잡도가 커진다

## 데이터/로직 원칙
- 등록 상태의 업무 의미는 `attendance_status`가 담당한다.
- 회원권 차감 여부는 계속 `session_consumed`와 `yoga_attendances.session_deducted`가 담당한다.
- `hold`는 상태를 설명하기 위한 값이며, 차감 여부를 직접 대체하지 않는다.
- 정원 계산은 `reserved`와 필요 시 `attended`만 포함하고 `hold`는 제외한다.
- 고객 화면에는 `hold`가 "신청 완료"로 오해되지 않도록 별도 문구가 필요하다.
- 관리자 상태 보정으로 `attended -> hold`가 발생하면 회원권 차감 복구와 출석 기록 정합성 보정을 함께 처리한다.

## 영향 파일
- DB
  - `database/schema.sql`
  - `backend/migrations/*hold-status*.sql`
- Backend
  - `backend/src/routes/classes.ts`
  - `backend/src/routes/attendances.ts`
  - `backend/src/worker/classAutoCloseWorker.ts`
- Frontend
  - `frontend/src/services/api.ts`
  - `frontend/src/pages/ClassManagement.tsx`
  - `frontend/src/pages/CustomerDashboard.tsx`
  - 상태 표시 또는 상태 변경 UI를 사용하는 관련 페이지
- Tests
  - `backend/tests/e2e/classes.e2e.test.js`
  - `backend/tests/e2e/attendances.e2e.test.js`
  - 상태 유니온과 화면 라벨을 검증하는 frontend 테스트 파일

## 작업 순서
1. 상태 계약 확정
   - `hold = 정원 미점유 + 차감 없음`을 서버/클라이언트 공통 계약으로 고정
2. DB 스키마 및 마이그레이션 추가
   - `attendance_status` check constraint에 `hold` 추가
   - 기존 데이터 백필은 불필요
3. Backend 상태 검증 확장
   - 입력 validation과 타입 유니온에 `hold` 반영
4. 정원 계산 로직 수정
   - 등록 인원 집계, 잔여석 계산, 자동 마감 기준에서 `hold` 제외
5. 상태 전이 로직 수정
   - `hold` 관련 허용 전이 및 차감/환불 규칙 반영
   - `hold -> reserved` 복귀 시 정원 검증 추가
   - `attended -> hold` 보정 시 회원권 복구와 출석 기록 정리 반영
6. 출석 처리 로직 수정
   - `hold` 상태 등록에서 체크인 시 차감 및 출석 기록 생성 보장
7. Frontend 반영
   - 상태 선택 옵션, 상태 배지, 안내 문구 추가
8. 테스트 보강
   - 정원 계산 회귀, 상태 전이, 차감 여부, 체크인 동작 검증
9. manual test 문서 갱신
10. lint/build/test/coverage 게이트 검증

## 구현 티켓
### 티켓 1. DB/API 상태 확장
- `hold` 상태를 스키마와 validation에 추가
- API 응답 타입과 프론트 유니온 타입을 확장

### 티켓 2. 정원 계산 정책 변경
- `hold` 등록은 정원 계산에서 제외
- `hold -> reserved` 전환 시 잔여석 재검증
- 자동 마감 로직과 대시보드 집계가 같은 기준을 사용하도록 정리

### 티켓 3. 상태 전이와 차감 정합화
- `hold -> attended`는 차감
- `hold -> absent`는 미차감
- `attended -> hold`는 관리자 보정으로 허용하고 차감 회원권을 복구
- `absent -> hold`는 기본 비허용 처리

### 티켓 4. UI 반영
- 관리자 수업 등록 목록에서 `hold` 선택 가능
- 고객 화면에 `hold`를 "보류"로 분리 표시
- 정원 미점유 상태라는 설명이 필요한지 검토

### 티켓 5. 테스트 및 검증
- backend e2e 상태 전이 케이스 추가
- frontend 상태 라벨/요청 payload 테스트 추가
- coverage 100% 게이트 유지

## 리스크
- 현재 코드가 `attendance_status`와 `session_consumed`를 함께 사용하므로 한쪽만 수정하면 데이터 불일치가 생길 수 있다.
- 정원 계산 로직이 여러 쿼리와 화면 집계에 분산돼 있어 `hold` 제외 기준이 누락될 수 있다.
- `hold -> reserved` 전환 시 정원 부족을 처리하지 않으면 과예약이 생길 수 있다.
- `attended -> hold` 보정 시 기존 출석 기록, 감사 로그, 회원권 잔여 횟수를 함께 맞추지 않으면 데이터 불일치가 생긴다.
- 고객 화면에서 `hold`가 예약 완료처럼 보이면 운영 혼선이 생긴다.

## 완료조건
- DB와 API가 `hold`를 유효한 등록 상태로 처리한다.
- `hold` 등록은 정원 계산에 포함되지 않는다.
- `hold -> reserved` 전환은 정원 여유가 있을 때만 성공한다.
- `hold -> attended`는 체크인 시 차감된다.
- `hold -> absent`는 차감되지 않는다.
- `attended -> hold`는 관리자 변경 시 차감 회원권이 복구되고 관련 출석 데이터가 정합하게 정리된다.
- `absent -> hold`는 기본 비허용으로 막힌다.
- 관리자와 고객 화면에서 `hold`가 일관되게 표시된다.
- backend/frontend lint/build/test/coverage 게이트가 통과한다.
