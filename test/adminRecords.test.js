const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRecordFilters, validateRecordEdit } = require('../lib/admin-records');

test('篩選拒絕不存在日期、相反日期與不安全頁數', () => {
    assert.throws(() => parseRecordFilters({ from: '2026-02-30' }), /日期/);
    assert.throws(() => parseRecordFilters({ from: '2026-10-16', to: '2026-10-01' }), /日期/);
    assert.equal(parseRecordFilters({ page: '1e30' }).page, 1);
});

test('偏低篩選與偏高分類互斥，日期快捷採用傳入的伺服器日期', () => {
    const result = parseRecordFilters({ status: 'low', range: '7d' }, new Date(2026, 9, 16, 12));
    assert.equal(result.from, '2026-10-10');
    assert.equal(result.to, '2026-10-16');
    assert.match(result.where, /high_pressure < 140/);
});

test('編輯記錄要求整數、合理數值、明確時區與修改原因', () => {
    const body = { high_pressure: 120, low_pressure: 80, heartbeat: 70, recorded_at: '2026-10-16T08:00:00.000Z', reason: '修正輸入錯誤' };
    assert.equal(validateRecordEdit(body).reason, body.reason);
    assert.throws(() => validateRecordEdit({ ...body, high_pressure: '120abc' }), /血壓/);
    assert.throws(() => validateRecordEdit({ ...body, low_pressure: 130 }), /血壓/);
    assert.throws(() => validateRecordEdit({ ...body, recorded_at: '2026-10-16T08:00' }), /時間/);
    assert.throws(() => validateRecordEdit({ ...body, reason: '' }), /原因/);
});
