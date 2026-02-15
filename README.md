# 요가원 회원관리 시스템

요가원 운영을 위한 웹 기반 관리 시스템입니다.

## 주요 기능

### 관리자
- 대시보드: 회원/출석 현황 확인
- 회원 관리: 등록, 수정, 삭제
- 회원권 관리: 종류 생성, 발급, 수정, 비활성화
- 출석 관리: 체크인, 강사 코멘트 기록
- 수업 관리:
  - 단일 수업 생성/수정/삭제
  - 반복 수업 생성 (요일/기간 기반)
  - 반복 수업 특정 회차 제외 (공휴일 등)
  - 수업별 신청자 관리

### 고객
- 내 회원권 조회
- 최근 출석 기록 조회

## 기술 스택

- Backend: Node.js, Express, TypeScript
- Frontend: React, TypeScript, Tailwind CSS
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

### 2. 실행
```bash
./start.sh
```

또는 수동 실행:
```bash
docker-compose up -d --build
```

### 3. 접속
- 웹: `http://localhost:3000`
- API: `http://localhost:3001`
- 초기 관리자: `admin@yoga.com` / `admin123`

## 개발 모드 실행 (핫리로드)

로컬 개발은 DB만 Docker로 띄우고 앱은 로컬 npm 프로세스로 실행합니다.

```bash
./start-local.sh
```

- 웹: `http://localhost:3000`
- API: `http://localhost:3001`

## 운영 배포 방식

현재 프로젝트는 `docker-compose.prod.yml` + Docker Hub 이미지를 기준으로 배포합니다.

### 1. GitHub Actions로 이미지 퍼블리시
- 워크플로우: `.github/workflows/docker-publish.yml`
- 트리거:
  - `main` 브랜치 push
  - `v*` 태그 push
- 생성 이미지:
  - `${DOCKERHUB_USERNAME}/studio-mgmt-api:<tag>`
  - `${DOCKERHUB_USERNAME}/studio-mgmt-web:<tag>`

필수 GitHub Secrets:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

### 2. 서버 배포
서버 `.env`에 아래 값 설정:
- `DOCKERHUB_USERNAME`
- `APP_TAG` (예: `latest`, `v1.0.0`, `sha-xxxxxxx`)
- DB/JWT/Admin 관련 값

배포 실행:
```bash
./deploy.sh
```

`deploy.sh`는 아래를 수행합니다.
1. 이미지 pull
2. 컨테이너 기동
3. DB readiness 확인

## 데이터베이스

### 스키마
- 기본 스키마: `database/schema.sql`
- 마이그레이션: `database/migrations/*.sql`

### 반복 수업 관련 테이블/컬럼
- `yoga_class_series`
- `yoga_classes.recurring_series_id`
- `yoga_classes.is_excluded`
- `yoga_classes.excluded_reason`

### 마이그레이션 적용 예시
```bash
docker-compose exec -T db psql -U ${DB_USER:-yoga_admin} -d ${DB_NAME:-yoga_studio} < database/migrations/20260214_add_class_recurring.sql
```

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
- 로컬 Docker 구성: `docker-compose.yml`
- 운영 Docker 구성: `docker-compose.prod.yml`
- 트러블슈팅: `TROUBLESHOOTING.md`
- 빠른 가이드: `QUICKSTART.md`

## 보안 주의사항

1. `.env`는 GitHub에 업로드하지 마세요.
2. 운영 환경에서는 `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`를 강한 값으로 설정하세요.
3. 초기 관리자 비밀번호는 로그인 후 즉시 변경하세요.

## 라이선스

MIT
