const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deductMembershipSessions,
  refundMembershipSessions,
} = require('../../dist/utils/membershipUsageAudit');

const createClient = (...results) => {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push([sql, params]);
      return results.shift() ?? { rows: [], rowCount: 0 };
    },
  };
};

test('deductMembershipSessions returns null when membership update fails', async () => {
  const client = createClient({ rows: [], rowCount: 0 });

  const result = await deductMembershipSessions(client, {
    membershipId: 5,
    changeAmount: 1,
    reason: 'attendance_check_in',
  });

  assert.equal(result, null);
  assert.equal(client.calls.length, 1);
});

test('deductMembershipSessions updates membership and writes audit log', async () => {
  const client = createClient(
    {
      rows: [{
        id: 5,
        customer_id: 1,
        remaining_before: 4,
        remaining_after: 3,
      }],
      rowCount: 1,
    },
    { rows: [{ id: 1 }], rowCount: 1 }
  );

  const result = await deductMembershipSessions(client, {
    membershipId: 5,
    changeAmount: 1,
    classId: 10,
    registrationId: 20,
    attendanceId: 30,
    actorUserId: 99,
    reason: 'attendance_check_in',
    note: 'Checked in from admin UI',
  });

  assert.equal(result?.remaining_after, 3);
  assert.equal(client.calls.length, 2);
  assert.match(String(client.calls[1][0]), /INSERT INTO yoga_membership_usage_audit_logs/i);
  assert.deepEqual(client.calls[1][1], [5, 1, 10, 20, 30, 99, -1, 4, 3, 'attendance_check_in', 'Checked in from admin UI']);
});

test('refundMembershipSessions updates membership and writes audit log', async () => {
  const client = createClient(
    {
      rows: [{
        id: 5,
        customer_id: 1,
        remaining_before: 3,
        remaining_after: 5,
      }],
      rowCount: 1,
    },
    { rows: [{ id: 2 }], rowCount: 1 }
  );

  const result = await refundMembershipSessions(client, {
    membershipId: 5,
    changeAmount: 2,
    classId: 10,
    registrationId: 20,
    attendanceId: null,
    actorUserId: 99,
    reason: 'registration_cancel_refund',
    note: 'Refunded canceled reservations',
  });

  assert.equal(result?.remaining_after, 5);
  assert.equal(client.calls.length, 2);
  assert.match(String(client.calls[1][0]), /INSERT INTO yoga_membership_usage_audit_logs/i);
  assert.deepEqual(client.calls[1][1], [5, 1, 10, 20, null, 99, 2, 3, 5, 'registration_cancel_refund', 'Refunded canceled reservations']);
});

test('refundMembershipSessions returns null when membership update affects no rows', async () => {
  const client = createClient({ rows: [], rowCount: 0 });

  const result = await refundMembershipSessions(client, {
    membershipId: 5,
    changeAmount: 1,
    reason: 'attendance_delete_refund',
  });

  assert.equal(result, null);
  assert.equal(client.calls.length, 1);
});

test('deductMembershipSessions writes null audit context fields when omitted', async () => {
  const client = createClient(
    {
      rows: [{
        id: 7,
        customer_id: 2,
        remaining_before: 1,
        remaining_after: 0,
      }],
      rowCount: 1,
    },
    { rows: [{ id: 3 }], rowCount: 1 }
  );

  await deductMembershipSessions(client, {
    membershipId: 7,
    changeAmount: 1,
    reason: 'auto_close_attendance',
  });

  assert.deepEqual(client.calls[1][1], [7, 2, null, null, null, null, -1, 1, 0, 'auto_close_attendance', null]);
});
