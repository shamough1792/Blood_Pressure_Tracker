const test = require('node:test');
const assert = require('node:assert/strict');
const { createErrorHandler } = require('../middleware/errorHandler');

test('API 錯誤回傳統一 JSON 且不洩漏內部訊息', () => {
    const handler = createErrorHandler({ logger: { error() {} } });
    const req = { originalUrl: '/api/users' };
    const result = {};
    const res = {
        headersSent: false,
        status(code) { result.status = code; return this; },
        json(body) { result.body = body; }
    };
    handler(new Error('database password leaked'), req, res, () => {});
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: '伺服器暫時無法處理請求' });
});
