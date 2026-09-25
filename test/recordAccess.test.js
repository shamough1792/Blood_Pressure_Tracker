const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePositiveId, recordOwnerWhere } = require('../lib/record-access');

test('只接受正整數使用者與記錄編號', () => {
    assert.equal(parsePositiveId('12'), 12);
    assert.equal(parsePositiveId('0'), null);
    assert.equal(parsePositiveId('-1'), null);
    assert.equal(parsePositiveId('1abc'), null);
});

test('修改與刪除條件同時限制記錄和使用者', () => {
    assert.deepEqual(recordOwnerWhere('8', '3'), {
        clause: 'id = ? AND user_id = ?',
        params: [8, 3]
    });
    assert.equal(recordOwnerWhere('8', ''), null);
});
