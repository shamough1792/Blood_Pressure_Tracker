const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('production 缺少資料庫設定時拒絕啟動', () => {
    const env = { ...process.env, NODE_ENV: 'production' };
    ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].forEach(name => delete env[name]);
    const result = spawnSync(process.execPath, ['-e', "require('./db')"], { cwd: process.cwd(), env, encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /缺少必要資料庫環境變數/);
    assert.match(result.stderr, /DB_PASSWORD/);
});

test('資料庫設定不再包含硬編碼預設密碼或主機', () => {
    const source = require('node:fs').readFileSync('db.js', 'utf8');
    assert.doesNotMatch(source, /mypassword/);
    assert.doesNotMatch(source, /192\.168\.1\.222/);
});
