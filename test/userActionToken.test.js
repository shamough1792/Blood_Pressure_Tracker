const test = require('node:test');
const assert = require('node:assert/strict');
const { createUserActionToken, verifyUserActionToken } = require('../lib/user-action-token');

test('使用者操作 token 與使用者編號綁定', () => {
    const token = createUserActionToken('test-secret', 3);

    assert.equal(verifyUserActionToken('test-secret', 3, token), true);
    assert.equal(verifyUserActionToken('test-secret', 4, token), false);
    assert.equal(verifyUserActionToken('other-secret', 3, token), false);
});

test('缺少設定或無效使用者編號時拒絕建立及驗證 token', () => {
    assert.throws(() => createUserActionToken('', 3), /SESSION_SECRET/);
    assert.throws(() => createUserActionToken('test-secret', 0), /使用者編號/);
    assert.equal(verifyUserActionToken('test-secret', 3, ''), false);
    assert.equal(verifyUserActionToken('test-secret', 'abc', 'token'), false);
});
