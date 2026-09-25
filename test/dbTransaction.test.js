const test = require('node:test');
const assert = require('node:assert/strict');
const { withTransaction } = require('../lib/db-transaction');

test('交易中任何寫入失敗時 rollback 並釋放 connection', async () => {
    const calls = [];
    const connection = {
        async beginTransaction() { calls.push('begin'); },
        async rollback() { calls.push('rollback'); },
        async commit() { calls.push('commit'); },
        release() { calls.push('release'); }
    };
    const pool = { promise: () => ({ getConnection: async () => connection }) };

    await assert.rejects(withTransaction(pool, async () => { throw new Error('insert failed'); }), /insert failed/);
    assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});
