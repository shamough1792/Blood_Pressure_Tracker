const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { createAdminAuth } = require('../middleware/adminAuth');
const { createBackup } = require('../lib/backup');
const { createAdminFixture } = require('../test-support/admin-fixture.cjs');

async function setup(t) {
    const fixture = createAdminFixture();
    const auth = createAdminAuth({ username: 'admin', password: 'secret', sessionSecret: 'admin-management-test' });
    const token = auth.issueToken();
    const server = createApp({ db: fixture.db, adminAuth: auth }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, method = 'GET', body, headers = {}) {
        const response = await fetch(base + path, { method, redirect: 'manual', headers: { cookie: `admin_session=${token}`, 'x-csrf-token': auth.createCsrfToken(token), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
        const text = await response.text();
        return { status: response.status, text, json: () => JSON.parse(text) };
    }
    return { ...fixture, request };
}

test('後台頁面可渲染，無登入及缺少 CSRF 的管理操作遭拒絕', async t => {
    const { request } = await setup(t);
    for (const path of ['/admin', '/admin/users', '/admin/records', '/admin/backup', '/admin/activity']) assert.equal((await request(path)).status, 200, path);
    assert.equal((await request('/api/records/1', 'DELETE', { reason: '測試' }, { cookie: '' })).status, 401);
    assert.equal((await request('/api/records/1', 'DELETE', { reason: '測試' }, { 'x-csrf-token': '' })).status, 403);
});

test('編輯記錄保留歸屬並稽核修改前後內容，過期畫面回傳 409', async t => {
    const { state, request } = await setup(t);
    const edit = { high_pressure: 130, low_pressure: 80, heartbeat: 70, recorded_at: '2026-10-16T01:00:00.000Z', reason: '更正量測', expected_at: state.records[0].recorded_at, expected_high: 145, expected_low: 92, expected_heart: 80 };
    assert.equal((await request('/api/records/1', 'PUT', edit)).status, 200);
    assert.equal(state.records[0].user_id, 1);
    assert.equal(state.records[0].high_pressure, 130);
    assert.equal(JSON.parse(state.logs[0].details).before.high_pressure, 145);
    assert.equal((await request('/api/records/1', 'PUT', edit)).status, 409);
});

test('稽核寫入失敗時刪除交易回復，找不到任一記錄則整批拒絕', async t => {
    const { state, request } = await setup(t);
    state.failAudit = true;
    assert.equal((await request('/api/records/1', 'DELETE', { reason: '重複' })).status, 500);
    assert.equal(state.records.length, 1);
    assert.equal(state.rollbackCount, 1);
    state.failAudit = false;
    assert.equal((await request('/api/records/bulk-delete', 'POST', { ids: [1, 999], reason: '重複' })).status, 404);
    assert.equal(state.records.length, 1);
    const preview = await request('/api/records/delete-preview', 'POST', { ids: [1] });
    assert.equal((await request('/api/records/bulk-delete', 'POST', { ids: [1], reason: '重複', fingerprint: preview.json().fingerprint })).status, 200);
    assert.equal(state.records.length, 0);
});

test('批次刪除先預覽完整明細，資料異動或未預覽均拒絕刪除', async t => {
    const { state, request } = await setup(t);
    const preview = await request('/api/records/delete-preview', 'POST', { ids: [1] });
    assert.equal(preview.status, 200);
    assert.equal(preview.json().records[0].user_name, '王伯伯');
    assert.equal(preview.json().records[0].high_pressure, 145);
    assert.equal((await request('/api/records/bulk-delete', 'POST', { ids: [1], reason: '測試' })).status, 409);
    state.records[0].high_pressure = 150;
    assert.equal((await request('/api/records/bulk-delete', 'POST', { ids: [1], reason: '測試', fingerprint: preview.json().fingerprint })).status, 409);
    assert.equal(state.records.length, 1);
    assert.equal((await request('/api/records/delete-preview', 'POST', { ids: [1] }, { 'x-csrf-token': '' })).status, 403);
});

test('外部資料庫備份回報獨立保存及稽核，拒絕未來時間與缺少檔案識別', async t => {
    const { state, request } = await setup(t);
    const body = { source: 'NAS 排程', completed_at: new Date(Date.now() - 60000).toISOString(), status: 'success', reference: 'db-20261016.sql.gz', checksum: 'a'.repeat(64), note: '已檢查檔案' };
    assert.equal((await request('/api/database-backups', 'POST', body)).status, 201);
    assert.equal(state.databaseBackups.length, 1);
    assert.equal(state.backups.length, 0);
    assert.equal(state.logs[0].action, 'database-backup.report');
    const page = await request('/admin/activity');
    assert.match(page.text, /NAS 排程/);
    assert.match(page.text, /管理員回報/);
    assert.equal((await request('/api/database-backups', 'POST', { ...body, reference: '' })).status, 400);
    assert.equal((await request('/api/database-backups', 'POST', { ...body, completed_at: '2099-01-01T00:00:00.000Z' })).status, 400);
    state.failAudit = true;
    assert.equal((await request('/api/database-backups', 'POST', body)).status, 500);
    assert.equal(state.databaseBackups.length, 1);
});

test('批次刪除拒絕重複 ID、空原因及過多記錄', async t => {
    const { request } = await setup(t);
    for (const body of [{ ids: [1, 1], reason: '重複' }, { ids: [1], reason: '' }, { ids: Array.from({ length: 101 }, (_, i) => i + 1), reason: '重複' }]) assert.equal((await request('/api/records/bulk-delete', 'POST', body)).status, 400);
});

test('完整還原新增使用者、依名稱映射、重複確認不重複匯入', async t => {
    const { state, request } = await setup(t);
    const backup = createBackup({ users: [{ id: 90, name: '王伯伯', color: '#4CAF50' }, { id: 91, name: '李婆婆', color: '#223344' }], records: [{ ...state.records[0], user_id: 90 }, { ...state.records[0], user_id: 91 }], appVersion: '2.10.1', exportedAt: new Date().toISOString() });
    function form() { const body = new FormData(); body.append('mode', 'full'); body.append('backupFile', new Blob([JSON.stringify(backup)], { type: 'application/json' }), 'backup.json'); return body; }
    const preview = await request('/api/import-backup/preview', 'POST', form());
    assert.equal(preview.status, 200);
    assert.equal(preview.json().valid, 1);
    assert.equal(preview.json().duplicates, 1);
    assert.equal((await request('/api/import-backup/confirm', 'POST', form())).status, 200);
    assert.equal(state.users.length, 2);
    assert.equal(state.records.length, 2);
    assert.equal(state.records[1].user_id, 2);
    assert.equal((await request('/api/import-backup/confirm', 'POST', form())).json().imported, 0);
    assert.equal(state.records.length, 2);
});

test('使用者新增、修改及連同記錄刪除均寫入稽核', async t => {
    const { state, request } = await setup(t);
    assert.equal((await request('/api/users', 'POST', { name: '新使用者', color: '#223344' })).status, 200);
    assert.equal((await request('/api/users/2', 'PUT', { name: '更名', color: '#223344' })).status, 200);
    assert.equal((await request('/api/users/1', 'DELETE', {})).status, 200);
    assert.equal(state.records.length, 0);
    assert.deepEqual(state.logs.map(log => log.action), ['user.create', 'user.edit', 'user.delete']);
});

test('JSON 匯出留下持久備份與稽核紀錄', async t => {
    const { state, request } = await setup(t);
    const result = await request('/admin/export/backup.json');
    assert.equal(result.status, 200);
    assert.equal(state.backups.length, 1);
    assert.equal(state.backups[0].checksum, result.json().checksum);
    assert.equal(state.logs[0].action, 'backup.export');
});

test('舊 SQL 匯入亦在交易內寫入稽核，稽核失敗不新增資料', async t => {
    const { state, request } = await setup(t);
    function form() { const body = new FormData(); body.append('user_id', '1'); body.append('sqlFile', new Blob(["INSERT INTO records VALUES (120,80,70,'2026-10-16 08:00:00');"]), 'legacy.sql'); return body; }
    assert.equal((await request('/api/import-sql', 'POST', form())).status, 200);
    assert.equal(state.records.length, 2);
    assert.equal(JSON.parse(state.logs[0].details).format, 'legacy-sql');
    state.failAudit = true;
    assert.equal((await request('/api/import-sql', 'POST', form())).status, 400);
    assert.equal(state.records.length, 2);
    assert.equal(state.logs.at(-1).status, 'failure');
});
