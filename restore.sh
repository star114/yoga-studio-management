#!/bin/bash

# 데이터베이스 복원 스크립트

if [ -z "$1" ]; then
    echo "사용법: ./restore.sh <백업파일>"
    echo ""
    echo "예시: ./restore.sh backups/yoga_db_backup_20240101_120000.sql"
    echo ""
    echo "사용 가능한 백업 파일:"
    ls -lh backups/*.sql 2>/dev/null || echo "  (백업 파일이 없습니다)"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ 백업 파일을 찾을 수 없습니다: $BACKUP_FILE"
    exit 1
fi

# Docker Compose 명령어 확인
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# 환경 변수 로드
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env 파일을 찾을 수 없습니다."
    exit 1
fi

echo "⚠️  경고: 데이터베이스를 복원하면 현재 데이터가 삭제됩니다!"
echo "백업 파일: $BACKUP_FILE"
echo ""
read -p "계속하시겠습니까? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "복원 취소됨"
    exit 0
fi

echo ""
echo "🗄️  데이터베이스 복원 시작..."

# 기존 데이터베이스 삭제 및 재생성
$DOCKER_COMPOSE exec -T db psql -U ${DB_USER:-yoga_admin} postgres << EOF
DROP DATABASE IF EXISTS ${DB_NAME:-yoga_studio};
CREATE DATABASE ${DB_NAME:-yoga_studio};
EOF

# 백업 복원
cat "$BACKUP_FILE" | $DOCKER_COMPOSE exec -T db psql -U ${DB_USER:-yoga_admin} ${DB_NAME:-yoga_studio}

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 복원 완료!"
    echo ""
    echo "📌 애플리케이션 재시작 권장:"
    echo "   $DOCKER_COMPOSE restart backend"
else
    echo "❌ 복원 실패"
    exit 1
fi
