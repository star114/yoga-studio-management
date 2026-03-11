type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
};

type MembershipAuditContext = {
  membershipId: number;
  changeAmount: number;
  reason: string;
  actorUserId?: number | null;
  classId?: number | null;
  registrationId?: number | null;
  attendanceId?: number | null;
  note?: string | null;
};

type MembershipBalanceRow = {
  id: number;
  customer_id: number;
  remaining_before: number;
  remaining_after: number;
};

const insertMembershipUsageAuditLog = async (
  client: Queryable,
  balanceRow: MembershipBalanceRow,
  context: MembershipAuditContext
) => {
  await client.query(
    `INSERT INTO yoga_membership_usage_audit_logs (
       membership_id,
       customer_id,
       class_id,
       registration_id,
       attendance_id,
       actor_user_id,
       change_amount,
       remaining_before,
       remaining_after,
       reason,
       note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      balanceRow.id,
      balanceRow.customer_id,
      context.classId ?? null,
      context.registrationId ?? null,
      context.attendanceId ?? null,
      context.actorUserId ?? null,
      context.changeAmount,
      balanceRow.remaining_before,
      balanceRow.remaining_after,
      context.reason,
      context.note ?? null,
    ]
  );
};

export const deductMembershipSessions = async (
  client: Queryable,
  context: MembershipAuditContext
): Promise<MembershipBalanceRow | null> => {
  const result = await client.query(
    `UPDATE yoga_memberships
     SET remaining_sessions = remaining_sessions - $2,
         is_active = CASE
           WHEN (remaining_sessions - $2) <= 0 THEN FALSE
           ELSE TRUE
         END
     WHERE id = $1
       AND remaining_sessions >= $2
     RETURNING
       id,
       customer_id,
       remaining_sessions + $2 AS remaining_before,
       remaining_sessions AS remaining_after`,
    [context.membershipId, Math.abs(context.changeAmount)]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const balanceRow = result.rows[0] as MembershipBalanceRow;
  await insertMembershipUsageAuditLog(client, balanceRow, {
    ...context,
    changeAmount: -Math.abs(context.changeAmount),
  });
  return balanceRow;
};

export const refundMembershipSessions = async (
  client: Queryable,
  context: MembershipAuditContext
): Promise<MembershipBalanceRow | null> => {
  const result = await client.query(
    `UPDATE yoga_memberships
     SET remaining_sessions = remaining_sessions + $2,
         is_active = CASE
           WHEN (remaining_sessions + $2) > 0 THEN TRUE
           ELSE FALSE
         END
     WHERE id = $1
     RETURNING
       id,
       customer_id,
       remaining_sessions - $2 AS remaining_before,
       remaining_sessions AS remaining_after`,
    [context.membershipId, Math.abs(context.changeAmount)]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const balanceRow = result.rows[0] as MembershipBalanceRow;
  await insertMembershipUsageAuditLog(client, balanceRow, {
    ...context,
    changeAmount: Math.abs(context.changeAmount),
  });
  return balanceRow;
};
