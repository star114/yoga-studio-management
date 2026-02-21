FROM node:22-alpine

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./

# 모든 의존성 설치
RUN npm install --legacy-peer-deps

# 소스 코드 복사
COPY . .

# TypeScript 컴파일
RUN npm run build

# 포트 노출
EXPOSE 3001

# 애플리케이션 실행
CMD ["sh", "-c", "npm run migrate && node dist/index.js"]
