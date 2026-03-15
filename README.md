# 요가원 회원관리 시스템

요가원 운영을 위한 웹 기반 관리 시스템입니다.

## 주요 기능

### 관리자
- 대시보드: 오늘 수업/출석/고객 현황 확인
- 고객 관리: 등록/수정/삭제, 비밀번호 초기화(기본값 `12345`)
- 회원권 관리:
  - 회원권 종류 생성/수정/비활성화
  - 고객별 회원권 발급/수정/삭제
  - 회원권 시작일/예상 종료일 조회
- 수업 관리:
  - 단일 수업 생성/수정/삭제
  - 반복 수업 생성(프론트에서 여러 `yoga_classes` 레코드 생성)
  - 수업 상세에서 수련생 등록/취소/출석 상태 관리
  - 수업 완료 후 강사/수련생 코멘트 대화 조회 및 작성
  - 수업 전체 내역(월별 그룹, 기간 필터, 페이지네이션)
- 출석 관리:
  - 체크인 API 기반 출석 처리
  - 출석 기록 조회/수정/삭제
  - 고객별 출석 전체 내역(기간 필터, 페이지네이션)

### 고객
- 수련기록: 다음 수업 확인, 수업 전 코멘트 작성, 최근 출석 수업 페이지네이션, 수업 후 코멘트 대화 확인
- 회원권 탭: 활성 회원권, 잔여 횟수, 시작일, 예상 종료일, 수업 캘린더(월/주/일) 조회
- 고객 수업 상세: 예약/출석/결석 상태, 연결된 회원권, 수업 전/후 코멘트 확인
- 내 정보 탭: 프로필/비밀번호 관리

## 로그인 정책
- 로그인 필드: `identifier` (아이디)
- 관리자: `ADMIN_ID` (기본 `admin`)로 로그인
- 고객: 고객 전화번호가 `login_id`로 저장되며 아이디로 로그인

## 회원권/출석 규칙
- 횟수제 회원권(`remaining_sessions`가 숫자)은 잔여 횟수로 활성 상태 동기화
  - `remaining_sessions <= 0` 이면 자동 비활성(`is_active = false`)
  - 출석 삭제 등으로 횟수 복원 시 자동 재활성화 가능
- 출석 체크 시 회원권 미지정이면 수업명과 회원권명 일치 항목을 우선 선택
- 관리자 수업 상세에서 고객 등록 시 `membership_id`를 지정하면 해당 지급 회원권으로 예약/출석을 연결할 수 있음
- 고객 수업 상세의 연결 회원권 표시는 등록 레코드 또는 출석 레코드 기준으로 노출됨

## 기술 스택
- Backend: Node.js 22, Express, TypeScript
- Frontend: React, TypeScript, Tailwind CSS, Vite
- Database: PostgreSQL 17
- Infra: Docker, Docker Compose

## 빠른 시작 (로컬 Docker 전체 실행)

### 1. 환경 변수 준비
```bash
cp .env.example .env
```

`.env`에서 최소 아래 값은 반드시 변경하세요.
- `DB_PASSWORD`
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `BUSINESS_TIMEZONE` (예: `Asia/Seoul`)

### 2. 실행
```bash
./start.sh
```

또는 수동 실행:
```bash
docker compose up -d --build
```

### 3. 접속
- 웹: `http://localhost:3000`
- API: `http://localhost:3001`
- 초기 관리자: `admin` / `admin123`

`start.sh`는 DB 준비 후 `npm run migrate`를 자동 실행합니다.

## 개발 모드 실행 (핫리로드)

로컬 개발은 DB만 Docker로 띄우고 앱은 로컬 npm 프로세스로 실행합니다.

```bash
./start-local.sh
```

- 웹: `http://localhost:3000`
- API: `http://localhost:3001`
- 요구사항: Node.js 22+

`start-local.sh`도 백엔드 실행 전 `npm run migrate`를 자동 실행합니다.

## 데이터베이스

### 스키마
- 기본 스키마: `database/schema.sql`

### 주요 테이블
- `yoga_users`
- `yoga_customers`
- `yoga_membership_types`
- `yoga_memberships`
- `yoga_classes`
- `yoga_class_registrations`
- `yoga_attendances`
- `yoga_attendance_messages`

### 마이그레이션
```bash
docker compose exec -T backend npm run migrate
```

- migration 파일 위치: `backend/migrations/`
- 신규 DB 기준 스키마: `database/schema.sql`

## 테스트/린트

### Backend
```bash
cd backend
npm run lint
npm run build
npm run test:unit
npm run test:e2e
npm run test:coverage
```

### Frontend
```bash
cd frontend
npm run lint
npm run test
npm run build
npm run test:coverage:all-src
```

## 운영 배포 방식

현재 프로젝트는 `docker-compose.prod.yml` + Docker Hub 이미지를 기준으로 배포합니다.

### 릴리즈/이미지 퍼블리시
- Release PR 자동화: `.github/workflows/release-please.yml`
- 이미지 빌드/푸시: `.github/workflows/docker-publish.yml`
- Release bootstrap marker: initial major release trigger commit included.

필수 GitHub Secrets:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `RELEASE_PLEASE_TOKEN` (PAT, `repo` + `workflow` 권한)

### 서버 배포
서버 `.env`에 아래 값 설정:
- `DOCKERHUB_USERNAME`
- `APP_TAG` (예: `latest`, `v1.0.0`, `sha-xxxxxxx`)
- DB/JWT/Admin 관련 값

배포 실행:
```bash
./deploy.sh
```

`deploy.sh` 동작:
- `docker-compose`가 있으면 우선 사용하고, 없으면 `docker compose`를 사용합니다.
- `docker-compose.prod.yml` 기준으로 이미지 pull 후 `up -d`를 실행합니다.
- DB readiness 확인까지만 수행하며, 운영 마이그레이션은 별도 실행이 필요할 수 있습니다.

cron용 자동 업데이트 실행:
```bash
./auto-update.sh
```

예시 cron:
```bash
*/10 * * * * cd /opt/yoga-studio-management && /bin/bash ./auto-update.sh >> /var/log/yoga-auto-update.log 2>&1
```

- 중복 실행 방지를 위해 lock 디렉토리를 사용합니다.
- 실제 이미지 pull / container restart는 `deploy.sh`를 그대로 재사용합니다.
- 실패/성공 로그는 stdout으로 남기므로 cron에서 파일 리다이렉션해 두는 것을 권장합니다.

## 운영 유틸리티

### 백업
```bash
./backup.sh
```

### 복원
```bash
./restore.sh backups/<backup_file>.sql
```

## 주요 파일
- 개발/로컬 Docker 실행: `start.sh`
- 개발 핫리로드 실행: `start-local.sh`
- 운영 배포 실행: `deploy.sh`
- cron용 운영 자동 업데이트: `auto-update.sh`
- 로컬 Docker 구성: `docker-compose.yml`
- 운영 Docker 구성: `docker-compose.prod.yml`
- 트러블슈팅: `TROUBLESHOOTING.md`
- 빠른 가이드: `QUICKSTART.md`
- 마이그레이션 러너: `backend/src/scripts/migrate.ts`

## 보안 주의사항
1. `.env`는 GitHub에 업로드하지 마세요.
2. 운영 환경에서는 `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`를 강한 값으로 설정하세요.
3. 초기 관리자 비밀번호는 로그인 후 즉시 변경하세요.

## 라이선스
MIT
