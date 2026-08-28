const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
    createAdminAuth,
    createSessionToken,
    verifySessionToken
} = require('../middleware/adminAuth');

const NOW = 1_700_000_000_000;
const CONFIG = {
    username: 'admin',
    password: 'secret',
    sessionSecret: 'a-test-session-secret',
    now: () => NOW
};

test('缺少管理員設定時拋出清楚錯誤', () => {
    assert.throws(() => createAdminAuth({ ...CONFIG, username: '' }), /ADMIN_USER/);
    assert.throws(() => createAdminAuth({ ...CONFIG, password: '' }), /ADMIN_PASSWORD/);
    assert.throws(() => createAdminAuth({ ...CONFIG, sessionSecret: '' }), /SESSION_SECRET/);
});

test('正確帳密簽發的 session token 可驗證', () => {
    const auth = createAdminAuth(CONFIG);
    const token = createSessionToken(auth, NOW);

    assert.deepEqual(verifySessionToken(auth, token, NOW + 1), {
        authenticated: true,
        issuedAt: NOW
    });
    assert.equal(auth.credentialsMatch('admin', 'secret'), true);
});

test('錯誤帳密、偽造或無效 token 均遭拒絕', () => {
    const auth = createAdminAuth(CONFIG);
    const token = createSessionToken(auth, NOW);

    assert.equal(auth.credentialsMatch('other', 'secret'), false);
    assert.equal(auth.credentialsMatch('admin', 'wrong'), false);
    assert.equal(verifySessionToken(auth, token + 'x', NOW + 1), null);
    assert.equal(verifySessionToken(auth, 'not.a.valid.token', NOW + 1), null);
    assert.equal(verifySessionToken(auth, '', NOW + 1), null);
});

test('過期、格式錯誤和簽名長度不符 token 不會通過或拋出例外', () => {
    const auth = createAdminAuth(CONFIG);
    const oldToken = createSessionToken(auth, NOW - 24 * 60 * 60 * 1000 - 1);
    const malformedPayload = Buffer.from('{bad json}', 'utf8').toString('base64url');
    const malformedSignature = crypto.createHmac('sha256', CONFIG.sessionSecret)
        .update(malformedPayload)
        .digest('base64url');
    const malformedToken = `${malformedPayload}.${malformedSignature}`;

    assert.equal(verifySessionToken(auth, oldToken, NOW), null);
    assert.equal(verifySessionToken(auth, malformedToken, NOW), null);
    assert.doesNotThrow(() => verifySessionToken(auth, 'abc.x', NOW));
});
