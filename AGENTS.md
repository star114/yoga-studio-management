# AGENTS.md

요가원 회원관리 시스템 저장소 전용 작업 가이드입니다.

## 1) 목표
- 변경을 작고 검증 가능하게 유지한다.
- 기능별 커밋으로 추적 가능성을 높인다.
- PR 게이트(특히 커버리지 100%)를 깨지 않도록 한다.

## 2) 저장소 구조
- `backend/`: Express + TypeScript API
- `frontend/`: React + Vite + TypeScript UI
- `database/schema.sql`: 신규 DB 기준 스키마
- `backend/migrations/`: 마이그레이션 파일(현재 비어있을 수 있음)

## 3) 기본 원칙
- 기능 변경 시 API/DB/UI 영향 범위를 먼저 확인한다.
- 기존 사용자 플로우(관리자/고객)와 데이터 정합성을 최우선으로 본다.
- 임시 우회보다 테스트 가능한 정식 수정으로 처리한다.
- 무관한 파일 포맷팅/리네이밍은 섞지 않는다.

## 4) 역할과 산출물
### Planner
- 작업을 기능 단위 티켓으로 분해한다.
- 산출물: `범위`, `비범위`, `작업 순서`, `리스크`, `완료조건`

### Implementer
- 한 번에 한 기능 티켓만 구현한다.
- 산출물: `수정 파일`, `동작 변화`, `호환성/데이터 영향`, `로컬 검증 결과`

### Reviewer
- 버그/회귀/데이터 불일치/권한 이슈 중심으로 리뷰한다.
- 산출물: `치명도 순 Findings`, `필수 수정 요청`, `잔여 리스크`

### Tester
- 변경 영역 중심으로 lint/test/build를 실행한다.
- 산출물: `실행 명령`, `성공/실패`, `재현 방법`, `재검증 결과`

### Release
- 기능별 커밋 묶음과 PR 본문을 정리한다.
- 산출물: `커밋 목록`, `PR 요약`, `운영 영향`, `롤백 포인트`

## 5) 필수 워크플로
1. Planner: 기능 분해 및 완료조건 정의
2. Implementer: 기능 1개 구현
3. Reviewer: 피드백 반영/승인
4. Tester: 게이트 검증
5. Release: 기능별 커밋/PR 정리

프로덕션 영향 변경은 단계 생략 금지.

## 6) 검증 명령 (프로젝트 기준)
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

## 7) 품질 게이트
- Backend unit coverage: lines/functions/branches/statements 100%
- Frontend all-src coverage: lines/functions/branches/statements 100%
- CI의 lint/test/build 전부 통과

## 8) 커밋/브랜치 규칙
- 브랜치: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`
- 커밋 접두사: `feat:`, `fix:`, `test:`, `chore:`
- 커밋 단위: 반드시 기능 단위(한 커밋에 여러 기능 혼합 금지)

## 9) 금지 사항
- 요청 없는 대규모 리팩터링
- 게이트 우회를 위한 커버리지 범위 축소
- 실패 테스트를 skip 처리만으로 통과시키기
- 관련 없는 파일 변경을 커밋에 포함하기
