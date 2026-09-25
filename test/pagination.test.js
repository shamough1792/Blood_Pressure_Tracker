const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPaginationItems } = require('../lib/pagination');

test('頁數少時顯示全部頁碼', () => {
    assert.deepEqual(buildPaginationItems(4, 2), [1, 2, 3, 4]);
});

test('頁數多時只顯示首尾與目前頁附近頁碼', () => {
    assert.deepEqual(buildPaginationItems(41, 20), [1, 'ellipsis', 18, 19, 20, 21, 22, 'ellipsis', 41]);
});

test('靠近首頁時不產生重複省略號', () => {
    assert.deepEqual(buildPaginationItems(41, 1), [1, 2, 3, 'ellipsis', 41]);
});
