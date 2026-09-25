const crypto = require('node:crypto');

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 小時
const COOKIE_NAME = 'admin_session';

function extractToken(cookieHeader) {
    const cookie = cookieHeader || '';
    const match = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookie);
    return match ? match[1] : null;
}

// 建立認證實例：驗證必填設定，回傳一組關閉式函式
function createAdminAuth({ username, password, sessionSecret, now = Date.now } = {}) {
    if (!username) throw new Error('ADMIN_USER must be configured');
    if (!password) throw new Error('ADMIN_PASSWORD must be configured');
    if (!sessionSecret) throw new Error('SESSION_SECRET must be configured');

    const expectedUser = Buffer.from(username, 'utf8');
    const expectedPassword = Buffer.from(password, 'utf8');

    function sign(payload) {
        const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
        const signature = crypto.createHmac('sha256', sessionSecret).update(b64).digest('base64url');
        return `${b64}.${signature}`;
    }

    function credentialsMatch(suppliedUser, suppliedPassword) {
        if (typeof suppliedUser !== 'string' || typeof suppliedPassword !== 'string') return false;
        const a = Buffer.from(suppliedUser, 'utf8');
        const b = Buffer.from(suppliedPassword, 'utf8');
        return a.length === expectedUser.length && crypto.timingSafeEqual(a, expectedUser)
            && b.length === expectedPassword.length && crypto.timingSafeEqual(b, expectedPassword);
    }

    function issueToken(issuedAt = now()) {
        return sign({ authenticated: true, issuedAt });
    }

    function verifyToken(token, currentTime = now()) {
        if (typeof token !== 'string' || token === '') return null;
        const separator = token.lastIndexOf('.');
        if (separator < 0) return null;

        const payloadB64 = token.slice(0, separator);
        const signature = token.slice(separator + 1);

        const expectedSignature = crypto.createHmac('sha256', sessionSecret)
            .update(payloadB64)
            .digest('base64url');
        const a = Buffer.from(signature, 'utf8');
        const b = Buffer.from(expectedSignature, 'utf8');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        } catch (_) {
            return null;
        }
        if (payload.authenticated !== true) return null;
        if (typeof payload.issuedAt !== 'number' || !Number.isFinite(payload.issuedAt)) return null;
        if (currentTime - payload.issuedAt > SESSION_MAX_AGE_MS) return null;

        return { authenticated: true, issuedAt: payload.issuedAt };
    }

    function isAuthenticated(req) {
        return verifyToken(extractToken(req.headers.cookie)) !== null;
    }

    function createCsrfToken(sessionToken) {
        return crypto.createHmac('sha256', sessionSecret)
            .update(`csrf:${sessionToken}`)
            .digest('base64url');
    }

    function verifyCsrfToken(sessionToken, csrfToken) {
        if (typeof sessionToken !== 'string' || typeof csrfToken !== 'string' || !sessionToken || !csrfToken) return false;
        const expected = createCsrfToken(sessionToken);
        const suppliedBuffer = Buffer.from(csrfToken, 'utf8');
        const expectedBuffer = Buffer.from(expected, 'utf8');
        return suppliedBuffer.length === expectedBuffer.length
            && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
    }

    return {
        credentialsMatch,
        issueToken,
        verifyToken,
        isAuthenticated,
        createCsrfToken,
        verifyCsrfToken
    };
}

// 頂層薄包裝：測試直接呼叫這兩個函式，secret 不外露
function createSessionToken(auth, issuedAt) {
    return auth.issueToken(issuedAt);
}

function verifySessionToken(auth, token, currentTime) {
    return auth.verifyToken(token, currentTime);
}

function createCsrfToken(auth, sessionToken) {
    return auth.createCsrfToken(sessionToken);
}

function verifyCsrfToken(auth, sessionToken, csrfToken) {
    return auth.verifyCsrfToken(sessionToken, csrfToken);
}

module.exports = { createAdminAuth, createSessionToken, verifySessionToken, createCsrfToken, verifyCsrfToken, extractToken, COOKIE_NAME, SESSION_MAX_AGE_MS };
