# 완료 수업 코멘트 대화형(메시지 스레드) 기능 E2E 실행 계획 (Planner→Implementer→Reviewer→Tester→Release)

## 요약
완료 수업에서 강사(admin)와 수련생(customer)이 코멘트를 단건 필드가 아닌 **메시지 스레드 형태**로 주고받고,
양측 뷰(관리자 수업 상세/수련생 수업 상세)에서 동일한 대화 내역을 확인할 수 있도록 확장합니다.

---

## 1) Planner 산출물

### 범위
1. DB
- `yoga_attendance_messages` 신규 테이블 추가
- 출석(`attendance_id`) 기준 메시지 스레드 저장 구조 도입

2. Backend
- 수련생 본인 스레드 조회/작성 API 추가
- 관리자 대상(특정 수업/수련생) 스레드 조회/작성 API 추가
- 완료 수업 및 출석 레코드 존재 조건 검증

3. Frontend
- 수련생 `CustomerClassDetail`에 대화형 타임라인 + 입력 UI 추가
- 관리자 `ClassDetail` 등록자 카드에 대화형 타임라인 + 입력 UI 추가

4. 테스트
- Backend e2e: 권한/정합성/조회/작성/실패 경로 보강
- Frontend: API 서비스 + 컴포넌트 단위 테스트 보강

### 비범위
1. 파일 첨부/이미지/이모지 메시지
2. 실시간 소켓 동기화(폴링/수동 새로고침 제외)
3. 메시지 수정/삭제
4. 읽음 상태(unread) 계산

### 작업 순서
1. 스키마/마이그레이션 추가
2. Backend 스레드 API 구현
3. Frontend 스레드 UI 구현
4. 테스트 보강 및 coverage 100% 재검증
5. 기능 단위 커밋/PR 정리

### 리스크
1. 기존 단건 코멘트(`customer_comment`, `instructor_comment`)와 의미 중복
2. 권한 누락 시 타 수련생 스레드 접근 위험
3. 완료/출석 조건 누락 시 비정상 데이터 생성

### 완료조건
1. 완료 수업에서 강사/수련생 양측이 메시지 작성 가능
2. 양측 뷰에서 동일한 스레드 순서로 조회 가능
3. 권한/정합성/회귀 테스트 포함 게이트(coverage 100%) 통과

---

## 2) Implementer 상세 설계

### DB/마이그레이션
1. `database/schema.sql`
- `yoga_attendance_messages` 추가
  - `id SERIAL PRIMARY KEY`
  - `attendance_id INT NOT NULL REFERENCES yoga_attendances(id) ON DELETE CASCADE`
  - `author_role TEXT NOT NULL CHECK (author_role IN ('admin','customer'))`
  - `author_user_id INT NOT NULL REFERENCES yoga_users(id) ON DELETE RESTRICT`
  - `message TEXT NOT NULL`
  - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
- 인덱스: `(attendance_id, created_at, id)`

2. `backend/migrations/` 신규 SQL
- 테이블/인덱스 생성
- 향후 필요 시 기존 단건 코멘트 백필 스크립트 추가(옵션)

### Backend 변경
1. `backend/src/routes/classes.ts` (예정)
- `GET /classes/:id/me/comment-thread`
- `POST /classes/:id/me/comment-thread`
- `GET /classes/:id/registrations/:customerId/comment-thread`
- `POST /classes/:id/registrations/:customerId/comment-thread`

2. 공통 검증
- 메시지 `message` trim, empty 금지, max 1000
- 해당 클래스/수련생의 최신 출석 레코드 확보
- 수업 상태 completed 또는 출석 존재 조건 충족 확인

3. 권한
- 수련생: 본인만
- 관리자: 특정 수련생 대상 가능

### Frontend 변경
1. `frontend/src/services/api.ts`
- `classAPI.getMyCommentThread(classId)`
- `classAPI.postMyCommentThread(classId, message)`
- `classAPI.getRegistrationCommentThread(classId, customerId)`
- `classAPI.postRegistrationCommentThread(classId, customerId, message)`

2. `frontend/src/pages/CustomerClassDetail.tsx`
- 메시지 타임라인(수련생/강사 구분)
- 메시지 입력창/전송 버튼

3. `frontend/src/pages/ClassDetail.tsx`
- 각 등록자 카드에 메시지 타임라인/입력

---

## 3) Public API / Interface 변경점
1. DB
- `yoga_attendance_messages` 신규

2. Backend API 신규
- `GET /classes/:id/me/comment-thread`
- `POST /classes/:id/me/comment-thread`
- `GET /classes/:id/registrations/:customerId/comment-thread`
- `POST /classes/:id/registrations/:customerId/comment-thread`

3. Frontend 타입 신규
- `AttendanceCommentMessage`
  - `id`, `attendance_id`, `author_role`, `author_user_id`, `message`, `created_at`

---

## 4) Reviewer 체크포인트
1. 권한
- 수련생 타인 스레드 접근 차단
- 관리자/수련생 endpoint role 분리

2. 데이터 정합성
- 출석 레코드 없을 때 작성/조회 실패 처리
- 빈 메시지 저장 차단

3. 회귀
- 기존 단건 코멘트 화면 동작 깨짐 여부
- 클래스 상세 성능 회귀(과도한 N+1) 확인

4. 보안
- SQL 파라미터 바인딩
- XSS 관점에서 메시지 렌더링 이스케이프 보장(React 기본 렌더 사용)

---

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

### 필수 테스트 시나리오
1. 수련생 스레드 조회/작성 성공
2. 관리자 스레드 조회/작성 성공
3. 권한 오류(타인 접근/역할 불일치)
4. 빈 메시지/길이 제한 검증
5. 라우트 전환 중 stale 응답 오염 방지 회귀

---

## 6) Release 계획

### 커밋 묶음 (기능 단위)
1. `feat: add attendance comment-thread schema and migration`
2. `feat: add attendance comment-thread api for customer and admin`
3. `feat: add comment-thread timeline ui for class detail pages`
4. `test: cover attendance comment-thread backend frontend flows`

### PR 요약 구성
1. 문제: 완료 수업 코멘트가 단건이라 상호 대화 기록 부재
2. 해결: 출석 단위 메시지 스레드 + 양측 작성/조회 UI
3. 영향: DB 테이블 추가, API 신규 엔드포인트 추가
4. 롤백: API/UI 롤백 가능, 테이블은 유지해도 하위 호환

---

## 7) 가정 및 기본값
1. 강사는 시스템 role `admin`으로 간주
2. 메시지 작성은 완료 수업 기준으로 허용
3. 수정/삭제 없이 append-only 메시지 모델 채택
4. 시간순 오름차순(오래된 메시지 -> 최신 메시지) 표시
5. 메시지 최대 길이 1000자
