const test = require('node:test');
const assert = require('node:assert/strict');
const { planImport } = require('../lib/admin-import');

const record = { high_pressure: 120, low_pressure: 80, heartbeat: 70, recorded_at: '2026-10-16T00:00:00.000Z', user_id: 3 };
const backup = { users: [{ id: 3, name: '甲', color: '#4CAF50' }], records: [record, record] };
const connection = {
    async query(sql, params) {
        if (sql.startsWith('SELECT id, name')) return [[{ id: 77, name: '甲' }]];
        if (sql.startsWith('SELECT high_pressure')) return [[{ ...record, user_id: 77 }]];
        throw new Error('不應執行寫入');
    }
};

test('完整還原依名稱映射而非來源 ID，並略過既有及檔案內重複記錄', async () => {
    const plan = await planImport(connection, backup, 'full', null);
    assert.equal(plan.users[0].targetId, 77);
    assert.equal(plan.rows.length, 0);
    assert.equal(plan.duplicates, 2);
});

test('指定使用者匯入清楚重設歸屬並拒絕不存在對象', async () => {
    const plan = await planImport(connection, backup, 'single', 77);
    assert.equal(plan.users.length, 1);
    assert.equal(plan.users[0].targetId, 77);
    await assert.rejects(() => planImport(connection, backup, 'single', 999), /使用者/);
});

test('完整還原拒絕重複使用者 ID 與無效模式', async () => {
    await assert.rejects(() => planImport(connection, { ...backup, users: [...backup.users, ...backup.users] }, 'full'), /使用者/);
    await assert.rejects(() => planImport(connection, backup, 'replace'), /模式/);
});
