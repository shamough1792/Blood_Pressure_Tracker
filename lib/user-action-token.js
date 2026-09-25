const crypto = require('node:crypto');
const { parsePositiveId } = require('./record-access');

function createUserActionToken(secret, userId) {
    if (!secret) throw new Error('SESSION_SECRET must be configured');
    const id = parsePositiveId(userId);
    if (!id) throw new Error('使用者編號無效');
    return crypto.createHmac('sha256', secret).update(`user-action:${id}`).digest('base64url');
}

function verifyUserActionToken(secret, userId, token) {
    if (!secret || typeof token !== 'string' || !token) return false;
    const id = parsePositiveId(userId);
    if (!id) return false;
    const expected = createUserActionToken(secret, id);
    const actualBuffer = Buffer.from(token, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = { createUserActionToken, verifyUserActionToken };
