-- Yoga Studio Management System Schema

-- 사용자 테이블 (관리자 및 고객)
CREATE TABLE IF NOT EXISTS yoga_users (
    id SERIAL PRIMARY KEY,
    login_id VARCHAR(255) UNIQUE NOT NULL,
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
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 회원권 종류 테이블
CREATE TABLE IF NOT EXISTS yoga_membership_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    total_sessions INTEGER,  -- 횟수제의 경우 총 횟수
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 회원권 테이블
CREATE TABLE IF NOT EXISTS yoga_memberships (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES yoga_customers(id) ON DELETE CASCADE,
    membership_type_id INTEGER REFERENCES yoga_membership_types(id),
    remaining_sessions INTEGER,  -- 잔여 횟수
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 오픈 수업 테이블
CREATE TABLE IF NOT EXISTS yoga_classes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    class_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
    is_open BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 출석 기록 테이블
CREATE TABLE IF NOT EXISTS yoga_attendances (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES yoga_customers(id) ON DELETE CASCADE,
    membership_id INTEGER REFERENCES yoga_memberships(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES yoga_classes(id) ON DELETE SET NULL,
    attendance_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    instructor_id INTEGER REFERENCES yoga_users(id),
    class_type VARCHAR(100),  -- 수업 종류
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 출석 코멘트 메시지 스레드 테이블
CREATE TABLE IF NOT EXISTS yoga_attendance_messages (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL REFERENCES yoga_attendances(id) ON DELETE CASCADE,
    author_role VARCHAR(20) NOT NULL CHECK (author_role IN ('admin', 'customer')),
    author_user_id INTEGER NOT NULL REFERENCES yoga_users(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 수업 신청 테이블
CREATE TABLE IF NOT EXISTS yoga_class_registrations (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES yoga_classes(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES yoga_customers(id) ON DELETE CASCADE,
    attendance_status VARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK (attendance_status IN ('reserved', 'attended', 'absent')),
    registration_comment TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, customer_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON yoga_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON yoga_customers(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_customer_id ON yoga_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON yoga_memberships(is_active);
CREATE INDEX IF NOT EXISTS idx_attendances_customer_id ON yoga_attendances(customer_id);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON yoga_attendances(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendances_class_id ON yoga_attendances(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_messages_attendance_created
    ON yoga_attendance_messages(attendance_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_classes_date ON yoga_classes(class_date);
CREATE INDEX IF NOT EXISTS idx_classes_open ON yoga_classes(is_open);
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

-- 횟수제 회원권은 잔여 횟수를 기준으로 활성/만료 상태 자동 동기화
CREATE OR REPLACE FUNCTION sync_membership_active_from_remaining()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.remaining_sessions IS NOT NULL THEN
        NEW.is_active = NEW.remaining_sessions > 0;
    END IF;
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

CREATE TRIGGER sync_yoga_memberships_active_from_remaining
    BEFORE INSERT OR UPDATE OF remaining_sessions ON yoga_memberships
    FOR EACH ROW EXECUTE FUNCTION sync_membership_active_from_remaining();

CREATE TRIGGER update_yoga_classes_updated_at BEFORE UPDATE ON yoga_classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 초기 관리자 계정은 백엔드 시작 시 .env의 ADMIN_ID / ADMIN_PASSWORD 값으로 생성/갱신됨
