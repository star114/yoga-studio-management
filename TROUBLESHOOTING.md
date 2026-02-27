# 트러블슈팅 가이드

## 자주 발생하는 문제와 해결 방법

### 1. DB 연결 오류: "Connection refused" 또는 "ECONNREFUSED"

**증상**: 백엔드가 PostgreSQL에 연결하지 못함

**해결 방법**:

```bash
# 1. DB 컨테이너가 실행 중인지 확인
docker-compose ps

# 2. DB 헬스체크 확인
docker-compose logs db

# 3. DB가 준비될 때까지 백엔드가 기다리는지 확인
# docker-compose.yml의 depends_on 섹션에 condition: service_healthy 설정 확인

# 4. 수동으로 DB 연결 테스트
docker-compose exec db psql -U yoga_admin -d yoga_studio

# 5. .env 파일 확인
# DB_PASSWORD가 올바른지 확인

# 6. 컨테이너 재시작
docker-compose restart backend
```

### 2. "npm ci can only install with an existing package-lock.json"

**증상**: Docker 빌드 시 npm 오류

**해결**: 이미 수정되어 있습니다. 만약 여전히 발생한다면:
```bash
# 로컬에서 package-lock.json 생성
cd backend
npm install
cd ../frontend
npm install

# 다시 빌드
docker-compose build
```

### 3. 데이터베이스 스키마가 적용되지 않음

**증상**: 테이블이 존재하지 않는다는 오류

**해결**:
```bash
# 1. 테이블 확인
docker-compose exec db psql -U yoga_admin -d yoga_studio -c "\dt"

# 2. 마이그레이션 상태 확인/적용
docker-compose exec -T backend npm run migrate

# 3. 신규 DB 초기화가 필요하면 재생성
docker-compose down -v  # ⚠️ 주의: 데이터가 삭제됩니다!
docker-compose up -d
```

참고:
- 신규 볼륨(빈 DB)은 `database/schema.sql`이 자동 적용됩니다.
- `npm run migrate`는 `backend/migrations` 경로가 누락되면 실패하도록 동작합니다.
- migration 파일이 누락된 배포 아티팩트인지 먼저 확인하세요.

### 4. "Permission denied" - 스크립트 실행 오류

**증상**: `start.sh` 또는 `start-local.sh` 실행 불가

**해결**:
```bash
chmod +x start.sh start-local.sh deploy.sh backup.sh restore.sh
./start.sh
```

### 5. 프론트엔드가 백엔드에 연결 안 됨 (CORS 오류)

**증상**: 브라우저 콘솔에 CORS 오류

**해결**:
```bash
# backend/.env 확인
CORS_ORIGIN=http://localhost:3000

# nginx.conf 확인 (proxy_pass가 올바른지)
# 컨테이너 재시작
docker-compose restart
```

### 6. "Unknown authentication method"

**증상**: PostgreSQL 인증 오류

**해결**:
```bash
# pg_hba.conf 확인
docker exec -it <postgres-container> cat /var/lib/postgresql/data/pg_hba.conf

# md5 또는 scram-sha-256 인증이 설정되어 있는지 확인
# 필요시 PostgreSQL 컨테이너 재시작
```

### 7. 컨테이너가 계속 재시작됨

**증상**: `docker ps`에서 컨테이너가 Restarting 상태

**해결**:
```bash
# 로그 확인
docker-compose logs backend
docker-compose logs frontend

# 일반적인 원인:
# - 환경 변수 누락 (.env 파일 확인)
# - DB 연결 실패
# - 포트 충돌 (3000, 3001 포트가 이미 사용 중인지 확인)

# 포트 충돌 확인
lsof -i :3000
lsof -i :3001
```

### 8. 관리자 로그인 실패

**증상**: admin으로 로그인 안 됨

**해결**:
```bash
# 백엔드 환경 변수 확인 (.env)
# ADMIN_ID, ADMIN_PASSWORD 값이 올바른지 확인

# 백엔드 재시작 (admin 계정은 시작 시 ensure/upsert 됩니다)
docker-compose restart backend

# 계정 존재 확인
docker-compose exec -T db psql -U yoga_admin -d yoga_studio -c \
"SELECT login_id, role, updated_at FROM yoga_users WHERE login_id = 'admin';"
```

### 9. 데이터가 보이지 않음

**증상**: 회원, 출석 등 데이터가 표시 안 됨

**해결**:
```bash
# 브라우저 개발자 도구 (F12) 확인
# - Console 탭: JavaScript 오류 확인
# - Network 탭: API 요청 확인

# 백엔드 로그 확인
docker-compose logs -f backend

# API 직접 테스트
curl http://localhost:3001/health
```

### 10. 빌드가 너무 느림

**해결**:
```bash
# Docker 캐시 정리
docker system prune -a

# node_modules 볼륨 사용 (docker-compose.yml에 추가)
# volumes:
#   - ./backend:/app
#   - /app/node_modules
```

## 도움이 더 필요하신가요?

1. 로그 전체 확인: `docker-compose logs > logs.txt`
2. 컨테이너 상태 확인: `docker ps -a`
3. 네트워크 상태 확인: `docker network inspect <network-name>`
4. DB 연결 테스트:
   ```bash
   docker run --rm -it --network <network-name> postgres:17-bookworm \
     psql -h <db-host> -U yoga_admin -d yoga_studio
   ```
