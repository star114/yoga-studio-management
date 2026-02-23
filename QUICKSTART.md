# 빠른 시작 가이드 (Quick Start)

5분 안에 요가원 관리 시스템을 시작하세요!

## 필수 요구사항

- Docker 및 Docker Compose 설치
- 3000, 3001, 5432 포트 사용 가능

## 설치 단계

### 1️⃣ 다운로드 및 압축 해제

```bash
tar -xzf yoga-studio-management.tar.gz
cd yoga-studio-management
```

### 2️⃣ 환경 설정

```bash
# .env 파일 생성
cp .env.example .env

# 강력한 비밀번호 생성
openssl rand -base64 32  # 이 결과를 JWT_SECRET에 사용
openssl rand -base64 24  # 이 결과를 DB_PASSWORD에 사용
```

`.env` 파일 수정 (필수!):
```env
DB_PASSWORD=여기에_생성한_비밀번호_입력
JWT_SECRET=여기에_생성한_JWT_시크릿_입력
```

### 3️⃣ 시작!

```bash
./start.sh
```

또는 수동으로:
```bash
docker-compose up -d --build
```

`start.sh`는 DB 준비 완료 후 마이그레이션(`npm run migrate`)을 자동 적용합니다.

### 4️⃣ 접속

브라우저에서 http://localhost:3000 열기

**초기 로그인 정보:**
- ID: `admin`
- Password: `admin123`

⚠️ **첫 로그인 후 즉시 비밀번호를 변경하세요!**

## 주요 명령어

```bash
# 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f

# 중지
docker-compose down

# 재시작
docker-compose restart

# 백업
./backup.sh

# 수동 마이그레이션 (필요 시)
docker-compose exec -T backend npm run migrate

# 완전 삭제 (데이터 포함)
docker-compose down -v
```

## 다음 단계

1. **관리자 비밀번호 변경** (보안 필수!)
2. 회원권 관리 항목 추가 (1개월 무제한, 10회권 등)
3. 회원 등록 시작
4. 출석 체크 시작

## 문제 발생 시

- 로그 확인: `docker-compose logs -f`
- 상세 트러블슈팅: `TROUBLESHOOTING.md` 참고
- 전체 재시작: `docker-compose down && docker-compose up -d`

## 데이터 백업 (중요!)

```bash
# 정기 백업 설정 (cron)
# 매일 새벽 3시 백업
0 3 * * * cd /path/to/yoga-studio-management && ./backup.sh
```

## 성공! 🎉

이제 요가원 회원관리를 시작할 수 있습니다.
차분하고 평온한 관리 경험을 누리세요! 🧘‍♀️
