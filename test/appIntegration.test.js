const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { createAdminAuth } = require('../middleware/adminAuth');

function request(app, path, options = {}) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', async () => {
            try {
                const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual', ...options });
                resolve({ response, text: await response.text() });
            } catch (error) { reject(error); }
            finally { server.close(); }
        });
    });
}

function createMockDb() {
    return {
        query(sql, params, callback) {
            if (typeof params === 'function') callback = params;
            if (/SELECT 1 AS ready/.test(sql)) return callback(null, [{ ready: 1 }]);
            callback(null, []);
        },
        promise() { throw new Error('測試不應寫入資料庫'); }
    };
}

const adminAuth = createAdminAuth({ username: 'admin', password: 'secret', sessionSecret: 'integration-test-secret' });

test('健康檢查與 readiness 回傳可監控狀態', async () => {
    const app = createApp({ db: createMockDb(), adminAuth });
    const health = await request(app, '/health');
    const ready = await request(app, '/ready');
    assert.equal(health.response.status, 200);
    assert.deepEqual(JSON.parse(health.text), { status: 'ok' });
    assert.equal(ready.response.status, 200);
    assert.deepEqual(JSON.parse(ready.text), { status: 'ready' });
});

test('管理員登入設定 session cookie，缺少 CSRF 的寫入遭拒絕', async () => {
    const app = createApp({ db: createMockDb(), adminAuth });
    const login = await request(app, '/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'username=admin&password=secret'
    });
    const cookie = login.response.headers.get('set-cookie');
    assert.equal(login.response.status, 302);
    assert.match(cookie, /admin_session=/);

    const blocked = await request(app, '/api/users', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"name":"測試"}' });
    assert.equal(blocked.response.status, 403);
    assert.match(blocked.text, /安全驗證失效/);
});

test('公開記錄寫入缺少使用者操作 token 時遭拒絕', async () => {
    process.env.SESSION_SECRET = 'integration-test-secret';
    const app = createApp({ db: createMockDb(), adminAuth });
    const result = await request(app, '/delete/1', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'userId=2'
    });
    assert.equal(result.response.status, 403);
    assert.match(result.text, /安全驗證失效/);
});
