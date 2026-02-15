#!/bin/bash

# 요가원 관리 시스템 빠른 시작 스크립트

echo "🧘 요가원 관리 시스템 설치 시작..."

# 환경 변수 파일 확인
if [ ! -f .env ]; then
    echo "📝 .env 파일이 없습니다. .env.example을 복사합니다..."
    cp .env.example .env
    echo ""
    echo "⚠️  중요: .env 파일을 열어서 비밀번호를 변경해주세요!"
    echo ""
    echo "   필수 변경 항목:"
    echo "   - DB_PASSWORD (데이터베이스 비밀번호)"
    echo "   - JWT_SECRET (인증 토큰 비밀키)"
    echo ""
    echo "   강력한 비밀번호 생성 방법:"
    echo "   $ openssl rand -base64 32"
    echo ""
    echo "   .env 파일을 수정한 후 다시 실행하세요:"
    echo "   $ ./start.sh"
    echo ""
    exit 1
fi

echo "✅ .env 파일 확인 완료"

# Docker Compose 버전 확인
if ! command -v docker-compose &> /dev/null; then
    if ! docker compose version &> /dev/null; then
        echo "❌ docker-compose 또는 docker compose가 설치되어 있지 않습니다."
        exit 1
    fi
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo "🐳 Docker 이미지 빌드 중..."
$DOCKER_COMPOSE build
build_exit_code=$?
if [ "$build_exit_code" -ne 0 ]; then
    echo "❌ Docker 이미지 빌드에 실패했습니다. 위의 Docker 오류 메시지를 확인하세요."
    echo "   - Docker Desktop이 실행 중인지 확인하세요."
    echo "   - 'docker compose build' 명령을 직접 실행해 자세한 오류를 확인할 수 있습니다."
    exit "$build_exit_code"
fi

echo "📦 컨테이너 시작 중..."
$DOCKER_COMPOSE up -d
up_exit_code=$?
if [ "$up_exit_code" -ne 0 ]; then
    echo "❌ 컨테이너 시작에 실패했습니다. 위의 Docker 오류 메시지를 확인하세요."
    echo "   - 'docker compose up -d' 명령을 직접 실행해 자세한 오류를 확인할 수 있습니다."
    echo "   - 특히 이미지 Pull 관련 'error getting credentials' 메시지가 보이면 Docker Desktop 로그인/자격 증명 설정을 확인하세요."
    exit "$up_exit_code"
fi

echo ""
echo "⏳ 데이터베이스 초기화 대기 중..."

# .env에서 DB_USER 읽기 (없으면 기본값 yoga_admin)
DB_USER=$(grep "^DB_USER=" .env | cut -d '=' -f2 | awk '{print $1}' | tr -d '\r\n"')
DB_USER=${DB_USER:-yoga_admin}

# 최대 30초 대기
MAX_RETRIES=30
COUNT=0

while [ $COUNT -lt $MAX_RETRIES ]; do
    if $DOCKER_COMPOSE exec -T db pg_isready -U "$DB_USER" > /dev/null 2>&1; then
        echo "✅ 데이터베이스 준비 완료"
        break
    fi
    echo -n "."
    sleep 1
    COUNT=$((COUNT+1))
done

if [ $COUNT -eq $MAX_RETRIES ]; then
    echo ""
    echo "❌ 데이터베이스 연결 실패. 로그를 확인하세요."
    echo "   $DOCKER_COMPOSE logs db"
    exit 1
fi

echo ""
echo "✨ 설치 완료!"
echo ""
echo "📌 접속 정보:"
echo "   웹 인터페이스: http://localhost:3000"
echo "   백엔드 API: http://localhost:3001"
echo ""
echo "👤 초기 관리자 계정:"
echo "   Email: admin@yoga.com"
echo "   Password: admin123"
echo "   (⚠️  첫 로그인 후 반드시 비밀번호를 변경하세요!)"
echo ""
echo "🔍 유용한 명령어:"
echo "   로그 확인: $DOCKER_COMPOSE logs -f"
echo "   상태 확인: $DOCKER_COMPOSE ps"
echo "   중지: $DOCKER_COMPOSE down"
echo "   재시작: $DOCKER_COMPOSE restart"
echo ""
echo "💾 데이터베이스 백업:"
echo "   ./backup.sh"
echo ""
