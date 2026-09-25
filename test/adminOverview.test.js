const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminOverview, buildAdminOverviewQuery } = require('../lib/admin-overview');

test('管理總覽計算最近量測與七日狀態比例', () => {
    const overview = buildAdminOverview([
        { high_pressure: 120, low_pressure: 80, heartbeat: 70, recorded_at: '2026-09-24T10:00:00Z', user_name: '甲' },
        { high_pressure: 150, low_pressure: 95, heartbeat: 75, recorded_at: '2026-09-25T10:00:00Z', user_name: '乙' }
    ], '2026-09-25T12:00:00Z');

    assert.equal(overview.latest.userName, '乙');
    assert.equal(overview.sevenDay.total, 2);
    assert.equal(overview.sevenDay.highRate, 50);
    assert.equal(overview.sevenDay.normalRate, 50);
    assert.equal(overview.sevenDay.lowRate, 0);
});

test('沒有記錄時回傳可直接渲染的空狀態', () => {
    assert.deepEqual(buildAdminOverview([], '2026-09-25T12:00:00Z'), {
        latest: null,
        sevenDay: { total: 0, highRate: 0, normalRate: 0, lowRate: 0 }
    });
});

test('管理總覽查詢可限制指定使用者的七日記錄及最近量測', () => {
    const allUsers = buildAdminOverviewQuery('');
    const selectedUser = buildAdminOverviewQuery('12');

    assert.equal(allUsers.params.length, 0);
    assert.doesNotMatch(allUsers.sql, /r\.user_id = \?/);
    assert.deepEqual(selectedUser.params, [12, 12]);
    assert.match(selectedUser.sql, /r\.user_id = \?/);
    assert.match(selectedUser.sql, /WHERE user_id = \?/);
});
