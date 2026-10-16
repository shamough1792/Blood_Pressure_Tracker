const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackup, parseBackup, previewBackup, previewFullBackup } = require('../lib/backup');

test('JSON 備份包含版本、checksum 並可驗證還原', () => {
    const backup = createBackup({
        users: [{ id: 1, name: '家人', color: '#4CAF50', created_at: '2026-09-25T01:00:00.000Z' }],
        records: [{ id: 2, high_pressure: 120, low_pressure: 80, heartbeat: 70, recorded_at: '2026-09-25T02:00:00.000Z', user_id: 1 }],
        exportedAt: '2026-09-25T03:00:00.000Z',
        appVersion: '2.8.7'
    });

    assert.equal(backup.format, 'blood-pressure-tracker-backup');
    assert.equal(backup.schemaVersion, 1);
    assert.match(backup.checksum, /^[a-f0-9]{64}$/);
    assert.deepEqual(parseBackup(JSON.stringify(backup)).records, backup.records);
});

test('備份內容遭修改時拒絕匯入', () => {
    const backup = createBackup({ users: [], records: [], exportedAt: '2026-09-25T03:00:00.000Z', appVersion: '2.8.7' });
    backup.records.push({ id: 1 });
    assert.throws(() => parseBackup(JSON.stringify(backup)), /checksum/);
});

test('匯入預覽只接受合理血壓資料並回報略過筆數', () => {
    const backup = createBackup({
        users: [],
        records: [
            { high_pressure: 120, low_pressure: 80, heartbeat: 70, recorded_at: '2026-09-25T02:00:00.000Z', user_id: 1 },
            { high_pressure: 10, low_pressure: 80, heartbeat: 70, recorded_at: '2026-09-25T02:00:00.000Z', user_id: 1 }
        ],
        exportedAt: '2026-09-25T03:00:00.000Z',
        appVersion: '2.8.7'
    });
    const result = previewBackup(parseBackup(JSON.stringify(backup)), 9);
    assert.equal(result.validRows.length, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.validRows[0][4], 9);
});

test('完整備份預覽保留原使用者對應並略過未知使用者', () => {
    const backup = createBackup({
        users: [{ id: 3, name: '甲', color: '#4CAF50' }],
        records: [
            { high_pressure: 120, low_pressure: 80, heartbeat: 70, recorded_at: '2026-09-25T02:00:00.000Z', user_id: 3 },
            { high_pressure: 130, low_pressure: 85, heartbeat: 72, recorded_at: '2026-09-25T03:00:00.000Z', user_id: 9 }
        ],
        exportedAt: '2026-09-25T03:00:00.000Z', appVersion: '2.10.1'
    });
    const result = previewFullBackup(parseBackup(JSON.stringify(backup)));
    assert.equal(result.validRows.length, 1);
    assert.equal(result.validRows[0].sourceUser.name, '甲');
    assert.equal(result.skipped, 1);
});
