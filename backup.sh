#!/bin/bash

# 데이터베이스 백업 스크립트

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/yoga_db_backup_${TIMESTAMP}.sql"

# Docker Compose 명령어 확인
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"

echo "🗄️  데이터베이스 백업 시작..."

# 환경 변수 로드
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env 파일을 찾을 수 없습니다."
    exit 1
fi

# PostgreSQL 컨테이너에서 백업 생성
$DOCKER_COMPOSE exec -T db pg_dump -U ${DB_USER:-yoga_admin} ${DB_NAME:-yoga_studio} > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    # 파일 크기 확인
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo ""
    echo "✅ 백업 완료!"
    echo "   파일: $BACKUP_FILE"
    echo "   크기: $SIZE"
    echo ""
    echo "📌 백업 복원 방법:"
    echo "   cat $BACKUP_FILE | $DOCKER_COMPOSE exec -T db psql -U ${DB_USER:-yoga_admin} ${DB_NAME:-yoga_studio}"
else
    echo "❌ 백업 실패"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# 오래된 백업 정리 (30일 이상)
echo "🧹 30일 이상된 백업 파일 정리 중..."
find "$BACKUP_DIR" -name "yoga_db_backup_*.sql" -mtime +30 -delete
echo "완료!"
