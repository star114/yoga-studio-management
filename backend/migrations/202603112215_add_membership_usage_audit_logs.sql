CREATE TABLE IF NOT EXISTS yoga_membership_usage_audit_logs (
    id SERIAL PRIMARY KEY,
    membership_id INTEGER NOT NULL REFERENCES yoga_memberships(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES yoga_customers(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES yoga_classes(id) ON DELETE SET NULL,
    registration_id INTEGER REFERENCES yoga_class_registrations(id) ON DELETE SET NULL,
    attendance_id INTEGER REFERENCES yoga_attendances(id) ON DELETE SET NULL,
    actor_user_id INTEGER REFERENCES yoga_users(id) ON DELETE SET NULL,
    change_amount INTEGER NOT NULL,
    remaining_before INTEGER NOT NULL CHECK (remaining_before >= 0),
    remaining_after INTEGER NOT NULL CHECK (remaining_after >= 0),
    reason VARCHAR(100) NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_membership_usage_audit_membership_created
    ON yoga_membership_usage_audit_logs(membership_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_membership_usage_audit_customer_created
    ON yoga_membership_usage_audit_logs(customer_id, created_at DESC, id DESC);
