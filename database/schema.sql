-- Yoga Studio Management System Schema
-- 기존 TeslaMate DB에 추가할 테이블들

-- 사용자 테이블 (관리자 및 고객)
CREATE TABLE IF NOT EXISTS yoga_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'customer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 고객 정보 테이블
CREATE TABLE IF NOT EXISTS yoga_customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES yoga_users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    birth_date DATE,
    gender VARCHAR(10),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 회원권 종류 테이블
CREATE TABLE IF NOT EXISTS yoga_membership_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    duration_days INTEGER,  -- 기간제의 경우 일수
    total_sessions INTEGER,  -- 횟수제의 경우 총 횟수
    price INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 회원권 테이블
CREATE TABLE IF NOT EXISTS yoga_memberships (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES yoga_customers(id) ON DELETE CASCADE,
    membership_type_id INTEGER REFERENCES yoga_membership_types(id),
    start_date DATE NOT NULL,
    end_date DATE,
    remaining_sessions INTEGER,  -- 잔여 횟수
    is_active BOOLEAN DEFAULT TRUE,
    purchase_price INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 출석 기록 테이블
CREATE TABLE IF NOT EXISTS yoga_attendances (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES yoga_customers(id) ON DELETE CASCADE,
    membership_id INTEGER REFERENCES yoga_memberships(id) ON DELETE CASCADE,
    attendance_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    instructor_comment TEXT,
    instructor_id INTEGER REFERENCES yoga_users(id),
    class_type VARCHAR(100),  -- 수업 종류
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 오픈 수업 테이블
CREATE TABLE IF NOT EXISTS yoga_classes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    instructor_name VARCHAR(100),
    class_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
    is_open BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 반복 수업 시리즈 테이블
CREATE TABLE IF NOT EXISTS yoga_class_series (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    instructor_name VARCHAR(100),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
    is_open BOOLEAN DEFAULT TRUE,
    notes TEXT,
    recurrence_start_date DATE NOT NULL,
    recurrence_end_date DATE NOT NULL,
    weekdays INTEGER[] NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE yoga_classes
    ADD COLUMN IF NOT EXISTS recurring_series_id INTEGER REFERENCES yoga_class_series(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

ALTER TABLE yoga_attendances
    ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES yoga_classes(id) ON DELETE SET NULL;

ALTER TABLE yoga_attendances
    ALTER COLUMN class_id SET NOT NULL;

-- 수업 신청 테이블
CREATE TABLE IF NOT EXISTS yoga_class_registrations (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES yoga_classes(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES yoga_customers(id) ON DELETE CASCADE,
    registration_comment TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, customer_id)
);

ALTER TABLE yoga_class_registrations
    ADD COLUMN IF NOT EXISTS registration_comment TEXT;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON yoga_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON yoga_customers(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_customer_id ON yoga_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON yoga_memberships(is_active);
CREATE INDEX IF NOT EXISTS idx_attendances_customer_id ON yoga_attendances(customer_id);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON yoga_attendances(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendances_class_id ON yoga_attendances(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_date ON yoga_classes(class_date);
CREATE INDEX IF NOT EXISTS idx_classes_open ON yoga_classes(is_open);
CREATE INDEX IF NOT EXISTS idx_classes_recurring_series_id ON yoga_classes(recurring_series_id);
CREATE INDEX IF NOT EXISTS idx_classes_is_excluded ON yoga_classes(is_excluded);
CREATE INDEX IF NOT EXISTS idx_class_registrations_class_id ON yoga_class_registrations(class_id);
CREATE INDEX IF NOT EXISTS idx_class_registrations_customer_id ON yoga_class_registrations(customer_id);

-- 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_yoga_users_updated_at BEFORE UPDATE ON yoga_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_yoga_customers_updated_at BEFORE UPDATE ON yoga_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_yoga_memberships_updated_at BEFORE UPDATE ON yoga_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_yoga_classes_updated_at BEFORE UPDATE ON yoga_classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 초기 관리자 계정은 백엔드 시작 시 .env의 ADMIN_EMAIL / ADMIN_PASSWORD 값으로 생성/갱신됨
