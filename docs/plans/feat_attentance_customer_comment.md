# 출석 고객 코멘트 기능 E2E 실행 계획 (Planner→Implementer→Reviewer→Tester→Release)

## 요약
고객이 **출석 완료된 수업**에 대해 별도 코멘트(`customer_comment`)를 남기고, 강사(관리자)가 **수업 상세 + 고객 상세**에서 확인할 수 있도록 확장합니다.  
기존 `registration_comment`(수강 신청 전/직전 메모)는 유지하고, 출석 후 피드백은 `attendance.customer_comment`로 분리합니다.

## 1) Planner 산출물
### 범위
1. DB: `yoga_attendances.customer_comment` 컬럼 추가.
2. Backend:
   - 고객 본인 출석 코멘트 저장 API 추가.
   - 관리자 조회 API(수업 상세 등록자 목록, 고객 상세 최근 출석)에 고객 출석 코멘트 노출.
3. Frontend:
   - 고객 `수업 상세`에서 출석 코멘트 작성/수정 UI 추가.
   - 관리자 `수업 상세` 등록자 카드에 고객 출석 코멘트 표시.
   - 관리자 `고객 상세` 최근 출석 카드에 고객 출석 코멘트 표시.
4. 테스트:
   - Backend e2e(클래스 라우트 중심), schema/migration 영향 검증.
   - Frontend 단위 테스트(API 서비스 + 페이지 컴포넌트) 업데이트.

### 비범위
1. 대시보드에서 출석 코멘트 작성 기능 추가.
2. 관리자 대리 작성/수정 기능.
3. 수정 가능 시간 제한(24시간 등).
4. 전 출석 목록 화면 전체(`CustomerAttendances`)까지 노출 확대.

### 작업 순서
1. 스키마/마이그레이션 설계 확정.
2. Backend API/조회 쿼리 수정.
3. Frontend API/화면 수정.
4. 테스트 보강 후 전체 게이트 검증.
5. 기능 단위 커밋 및 PR 템플릿 정리.

### 리스크
1. `registration_comment`와 `customer_comment` 의미 혼선.
2. 기존 쿼리 응답 shape 변경으로 프론트 테스트 회귀.
3. 마이그레이션 미적용 환경에서 런타임 오류.

### 완료조건
1. 고객이 출석 완료 수업에서 코멘트 저장/수정 가능.
2. 강사(관리자)가 수업 상세/고객 상세에서 고객 출석 코멘트 확인 가능.
3. Backend/Frontend lint-test-build + coverage 100% 게이트 통과.

## 2) Implementer 상세 설계
### DB/마이그레이션
1. `database/schema.sql`
   - `yoga_attendances`에 `customer_comment TEXT` 추가.
2. `backend/migrations/` 신규 SQL
   - `ALTER TABLE yoga_attendances ADD COLUMN IF NOT EXISTS customer_comment TEXT;`

### Backend 변경
1. `backend/src/routes/classes.ts` 신규 엔드포인트 추가:
   - `PUT /classes/:id/me/attendance-comment`
   - 인증: `authenticate`, 고객 전용(`admin` 차단).
   - 바디: `customer_comment` optional string, max 500, trim 후 빈 문자열은 `NULL`.
   - 동작: 해당 고객+수업의 최신 출석(`attendance_date DESC, id DESC LIMIT 1`) 업데이트.
   - 실패: 고객 매핑 없음 `403`, 출석 기록 없음 `404`.
2. 기존 조회 확장:
   - `GET /classes/:id/me`에 `a.customer_comment AS customer_comment` 추가.
   - `GET /classes/:id/registrations`의 lateral select에 `customer_comment` 포함, 응답 alias `attendance_customer_comment`.
3. `backend/src/routes/customers.ts`
   - 최근 출석 블록은 `a.*` 사용 중이라 컬럼 자동 포함.
   - 필요 시 SELECT 명시 컬럼 사용 구간에 `a.customer_comment` 포함 여부 확인 후 통일.
4. 검증 일관성
   - 문자열 길이 제한(500) 및 trim 정책을 `registration_comment`와 동일하게 적용.

### Frontend 변경
1. `frontend/src/services/api.ts`
   - `classAPI.updateMyAttendanceComment(classId, customer_comment)` 추가.
2. `frontend/src/pages/CustomerClassDetail.tsx`
   - 데이터 타입에 `customer_comment` 추가.
   - `attendance_status === 'attended'`일 때만 편집 영역 노출.
   - textarea + 저장 버튼 + 저장 중 상태 + 에러 배너 처리.
   - 초기값: 서버의 `customer_comment`.
3. `frontend/src/pages/ClassDetail.tsx`
   - `ClassRegistration` 타입에 `attendance_customer_comment` 추가.
   - 등록자 카드에 `고객 출석 코멘트` read-only 영역 추가.
4. `frontend/src/pages/CustomerDetail.tsx`
   - 최근 출석 카드에 `고객 출석 코멘트` 라인 추가.

## 3) Public API / Interface 변경점
1. DB:
   - `yoga_attendances.customer_comment: TEXT | NULL` 신규.
2. Backend API 신규:
   - `PUT /classes/:id/me/attendance-comment`
   - Request: `{ customer_comment?: string }`
   - Response: `{ id, class_id, customer_id, customer_comment, attendance_date, ... }`
3. Backend 응답 필드 확장:
   - `GET /classes/:id/me`: `customer_comment` 포함.
   - `GET /classes/:id/registrations`: `attendance_customer_comment` 포함.
4. Frontend 타입 확장:
   - `CustomerClassDetailData.customer_comment`
   - `ClassRegistration.attendance_customer_comment`

## 4) Reviewer 체크포인트
1. 권한:
   - 고객은 본인 출석 코멘트만 수정 가능.
   - 관리자는 신규 고객 전용 endpoint 접근 불가.
2. 데이터 정합성:
   - 출석 없는 수업에 코멘트 저장 시 404.
   - 공백 입력 저장 시 `NULL` 처리.
3. 회귀:
   - 기존 강사 코멘트 저장 플로우 영향 없음.
   - 기존 `registration_comment` UX 영향 없음.
4. 보안:
   - 길이 제한(500) 검증 누락 여부.
   - SQL 파라미터 바인딩 유지 여부.

## 5) Tester 실행 계획
### Backend
1. `cd backend && npm run lint`
2. `cd backend && npm run build`
3. `cd backend && npm run test:unit`
4. `cd backend && npm run test:e2e`
5. `cd backend && npm run test:coverage`

### Frontend
1. `cd frontend && npm run lint`
2. `cd frontend && npm run test`
3. `cd frontend && npm run build`
4. `cd frontend && npm run test:coverage:all-src`

### 필수 테스트 시나리오 추가
1. 고객 출석 코멘트 저장 성공/빈값 null/출석없음404/권한오류.
2. 관리자 수업 상세에서 고객 출석 코멘트 노출 확인.
3. 고객 수업 상세에서 출석 상태별 UI(출석 시 편집 가능, 예약/결석 시 비노출).
4. API 서비스 호출 경로/페이로드 검증.
5. 기존 강사 코멘트 테스트 비회귀 확인.

## 6) Release 계획
### 커밋 묶음 (기능 단위)
1. `feat: add attendance customer comment schema and migration`
2. `feat: add customer attendance comment api and admin visibility`
3. `feat: add customer attendance comment ui for class detail`
4. `test: cover attendance customer comment backend frontend flows`

### PR 요약 구성
1. 문제: 출석 후 고객 피드백 채널 부재.
2. 해결: 출석 엔티티 고객 코멘트 추가 + 고객 작성/강사 조회 플로우.
3. 영향: DB 컬럼 추가(Nullable), API 응답 필드 확장.
4. 롤백 포인트:
   - 앱 롤백 시에도 nullable 컬럼은 호환.
   - 필요 시 API/UI만 되돌리고 컬럼은 유지 가능.

## 7) 가정 및 기본값
1. “강사”는 현재 시스템 권한상 `admin` 역할로 간주.
2. 고객 출석 코멘트는 **고객 수업 상세 페이지에서만** 작성/수정.
3. 수정은 **언제든 가능**(시간 제한 없음).
4. 강사 노출 범위는 **관리자 수업 상세 + 관리자 고객 상세**로 제한.
5. 문자열 최대 길이는 500자로 통일.
