const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSql, runMigrations } = require('../lib/migrations');

test('SQL 分割保留字串與註解內的分號，不接受 DELIMITER', () => {
    assert.deepEqual(splitSql("-- 註解;\nSELECT ';'; /* ; */ SELECT 'it''s;ok';"), ["-- 註解;\nSELECT ';'", "/* ; */ SELECT 'it''s;ok'"]);
    assert.throws(() => splitSql('DELIMITER $$\nSELECT 1$$'), /DELIMITER/);
    assert.deepEqual(splitSql('SELECT 1; /* 說明 */; -- 空段\n; SELECT 2;'), ['SELECT 1', 'SELECT 2']);
    assert.deepEqual(splitSql('/*!40101 SET @example = 1 */;'), ['/*!40101 SET @example = 1 */']);
});

test('取不到升級鎖時停止且釋放連線，不執行 SQL', async () => {
    let released = false;
    const connection = { async query(sql) { assert.match(sql, /GET_LOCK/); return [[{ acquired: 0 }]]; }, release() { released = true; } };
    await assert.rejects(() => runMigrations({ promise: () => ({ getConnection: async () => connection }) }), /升級鎖/);
    assert.equal(released, true);
});

test('已套用 SQL 內容被修改時停止並釋放升級鎖', async t => {
    const fs = require('node:fs/promises');
    const os = require('node:os');
    const path = require('node:path');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-migration-checksum-'));
    t.after(() => fs.rm(directory, { recursive: true }));
    await fs.writeFile(path.join(directory, 'migration-005-example.sql'), 'SELECT 1;');
    let unlocked = false, released = false;
    const connection = { async query(sql) {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.startsWith('CREATE TABLE')) return [{}];
        if (sql.startsWith('SELECT name')) return [[{ name: 'migration-005-example.sql', checksum: 'outdated' }]];
        if (sql.includes('RELEASE_LOCK')) { unlocked = true; return [[{}]]; }
        throw new Error('不應執行已變更 migration');
    }, release() { released = true; } };
    await assert.rejects(() => runMigrations({ promise: () => ({ getConnection: async () => connection }) }, { directory, logger: { info() {} } }), /內容已變更/);
    assert.equal(unlocked, true);
    assert.equal(released, true);
});
