# 회원권별 신청 가능 수업명 Set 도입 플랜

## 목적
- 회원권 표시 이름과 수업 매칭 기준을 분리한다.
- 회원권 종류마다 신청 가능한 수업명 집합을 명시적으로 관리한다.
- 추천 수업, 예약 검증, 출석 자동 선택, 자동 마감이 동일한 기준으로 동작하게 만든다.
- 기존의 관리자 승인 기반 교차 회원권 예약/출석 플로우는 유지한다.

## 범위
- DB에 회원권 종류별 신청 가능 수업명 set 저장 구조 추가
- 회원권 종류 CRUD API 확장
- 추천 수업 조회 기준을 회원권 이름 문자열에서 회원권 기준 set 조회로 전환
- 수업 예약 검증, 출석 등록 자동 회원권 선택, 자동 마감 워커를 새 기준으로 전환
- 관리자 회원권 종류 관리 UI에 set 입력/표시 추가
- 관련 backend/frontend 테스트 및 manual test 문서 갱신

## 비범위
- 수업 자체를 별도 수업 타입 엔티티로 정규화
- 고객용 화면 전반에 신청 가능 수업명 set 노출
- 기존 교차 회원권 승인 플로우 제거 또는 정책 변경

## 저장 구조
- 신규 테이블: `yoga_membership_type_class_titles`
- 컬럼:
  - `id SERIAL PRIMARY KEY`
  - `membership_type_id INTEGER NOT NULL REFERENCES yoga_membership_types(id) ON DELETE CASCADE`
  - `class_title VARCHAR(100) NOT NULL`
  - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
- 제약:
  - `(membership_type_id, class_title)` unique
- 백필:
  - 기존 각 회원권 종류에 대해 기본 수업명 1개를 `name` 값으로 생성

## API/계약 변경
- `GET /memberships/types`
  - 각 회원권 종류에 `reservable_class_titles: string[]` 포함
- `POST /memberships/types`
  - 입력 필드에 `reservable_class_titles` 추가
- `PUT /memberships/types/:id`
  - 입력 필드에 `reservable_class_titles` 추가
- `GET /customers/:id/recommended-classes`
  - `membership_name` 대신 `membership_id` 기준으로 추천 조회
  - 서버는 membership -> membership_type -> reservable class titles를 따라 추천 수업을 조회

## 매칭 원칙
- 수업 매칭은 membership type에 연결된 `reservable_class_titles`에 `class.title`이 exact match 되는지로 판단한다.
- exact match가 없으면 기존과 동일하게 관리자 승인 기반 교차 회원권 예약/출석 플로우를 유지한다.
- 추천 수업, 예약 검증, 출석 자동 선택, 자동 마감 워커는 모두 동일 기준을 사용한다.

## 작업 순서
1. DB 스키마/마이그레이션 추가 및 백필
2. 회원권 종류 CRUD API 확장
3. 공통 membership-class-title 매칭 쿼리/로직 정리
4. 추천 수업 API를 membership 기준 조회로 전환
5. 예약 검증, 출석 자동 선택, 자동 마감 워커를 새 기준으로 전환
6. 관리자 회원권 종류 관리 UI 확장
7. 고객 상세 추천 수업 호출 및 문구 전환
8. backend/frontend 테스트 갱신
9. manual test 문서 갱신
10. lint/build/test/coverage 검증

## 리스크
- 로직이 여러 지점에 분산되어 있어 한 군데라도 구 기준이 남으면 데이터 불일치가 생길 수 있다.
- 백필이 누락되면 기존 회원권이 즉시 미매칭 상태가 된다.
- 추천 API를 ID 기준으로 바꾸면 frontend 테스트 영향 범위가 넓다.
- 관리자 승인 기반 대체 회원권 플로우가 깨지면 운영 회귀가 크다.

## 완료조건
- 회원권 종류가 여러 수업명을 가질 수 있다.
- 기존 회원권 타입은 기본적으로 `name` 값이 신청 가능 수업명에 포함되어 배포 직후 기존 동작을 유지한다.
- 추천 수업, 예약 검증, 출석 자동 선택, 자동 마감 워커가 모두 set 기준으로 동작한다.
- 미매칭 시 `CROSS_MEMBERSHIP_CONFIRM_REQUIRED` 플로우가 유지된다.
- backend/frontend lint/build/test/coverage 게이트가 통과한다.
