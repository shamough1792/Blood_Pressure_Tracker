const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecordedAt } = require('../lib/record-time');

test('今天新增記錄保留實際時分秒', () => {
    const now = new Date(2026, 8, 20, 14, 37, 42, 123);
    const recordedAt = buildRecordedAt('2026-09-20', undefined, now);

    assert.equal(recordedAt.getFullYear(), 2026);
    assert.equal(recordedAt.getMonth(), 8);
    assert.equal(recordedAt.getDate(), 20);
    assert.equal(recordedAt.getHours(), 14);
    assert.equal(recordedAt.getMinutes(), 37);
    assert.equal(recordedAt.getSeconds(), 42);
});

test('補錄過去日期時依上午或下午分類但不使用 08:00／20:00', () => {
    const now = new Date(2026, 8, 20, 14, 37, 42, 123);
    const recordedAt = buildRecordedAt('2026-08-19', 'PM', now);

    assert.equal(recordedAt.getFullYear(), 2026);
    assert.equal(recordedAt.getMonth(), 7);
    assert.equal(recordedAt.getDate(), 19);
    assert.equal(recordedAt.getHours(), 23);
    assert.equal(recordedAt.getMinutes(), 59);
    assert.notEqual(recordedAt.getHours(), 20);
});
