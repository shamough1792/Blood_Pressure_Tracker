# 管理後台 Session 認證實作計畫

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 逐任務實作此計畫。步驟使用複選框（`- [ ]`）語法來追蹤進度。

**目標：** 為管理後台提供帳密登入頁、瀏覽器關閉即失效的簽名 session cookie，並保護管理操作與管理 API。

**架構：** `middleware/adminAuth.js` 匯出純函式，驗證環境設定、帳密、HMAC 簽名 cookie 和 cookie 的 24 小時上限。`routes/admin.js` 處理登入、登出並以 middleware 保護原有後台與 `/api/*` 路由；因 API 與頁面位於同一 router，middleware 根據請求路徑分別回傳登入導向或 `401` JSON。登入 cookie 使用 Node.js `crypto` 產生與驗證，不使用資料庫或第三方 session 套件。

**技術棧：** Node.js CommonJS、Express 4、Node `crypto`、Node 內建 `node:test` 與 `assert`、EJS、Docker Compose、Markdown。

---

## 檔案結構與責任

- 建立：`middleware/adminAuth.js`，驗證設定、簽發與驗證 session cookie，以及產生 Express middleware。
- 建立：`test/adminAuth.test.js`，覆蓋純認證邏輯的成功與失敗分支。
- 建立：`views/admin-login.ejs`，提供長者家人可理解的管理員登入頁。
- 修改：`routes/admin.js:1-156`，增加登入、登出路由並以認證 middleware 保護原有 admin router。
- 修改：`views/admin.ejs:36-41` 及 JavaScript fetch 呼叫，提供登出按鈕並處理管理 API 的 `401`。
- 修改：`server.js:1-24`，從環境變數建立 admin auth services，傳入 admin router。
- 修改：`package.json:5-8`，把測試腳本改為 `node --test`。
- 修改：`docker-compose.yml:6-11`，加入管理員與 session secret 環境變數接點。
- 修改：`README.md:40-53`、`README.md:115-131`，文件化必要設定與 HTTPS/內網限制。

### 任務 1：建立 session 認證的失敗測試

**檔案：**
- 建立：`test/adminAuth.test.js`
- 參考：`middleware/adminAuth.js`（本任務完成前尚不存在）

- [ ] **步驟 1：建立 test 資料夾與認證測試檔**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
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
    const malformedPayload = Buffer.from('{bad json}', 'utf8').toString('base64url') + '.x';

    assert.equal(verifySessionToken(auth, oldToken, NOW), null);
    assert.equal(verifySessionToken(auth, malformedPayload, NOW), null);
    assert.doesNotThrow(() => verifySessionToken(auth, 'abc.x', NOW));
});
```

- [ ] **步驟 2：執行測試確認失敗**

執行：`node --test test/adminAuth.test.js`

預期：FAIL，顯示找不到 `../middleware/adminAuth`。

### 任務 2：實作可測試的 session 與認證邏輯

**檔案：**
- 建立：`middleware/adminAuth.js`
- 測試：`test/adminAuth.test.js`

- [ ] **步驟 1：實作驗證設定及固定時間比較**

在 `middleware/adminAuth.js` 建立設定函式與長度安全的比較函式：

```js
const crypto = require('crypto');

const COOKIE_NAME = 'admin_session';
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000;

function createAdminAuth({ username, password, sessionSecret, now = Date.now }) {
    if (!username) throw new Error('ADMIN_USER must be configured');
    if (!password) throw new Error('ADMIN_PASSWORD must be configured');
    if (!sessionSecret) throw new Error('SESSION_SECRET must be configured');

    const expectedUser = Buffer.from(username, 'utf8');
    const expectedPassword = Buffer.from(password, 'utf8');

    return {
        sessionSecret,
        now,
        credentialsMatch(suppliedUser, suppliedPassword) {
            return safeEqual(Buffer.from(suppliedUser || '', 'utf8'), expectedUser) &&
                safeEqual(Buffer.from(suppliedPassword || '', 'utf8'), expectedPassword);
        }
    };
}

function safeEqual(actual, expected) {
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
```

- [ ] **步驟 2：實作 session token 簽發與驗證**

在同一檔案加入：

```js
function createSessionToken(auth, issuedAt = auth.now()) {
    const payload = Buffer.from(JSON.stringify({ authenticated: true, issuedAt }), 'utf8').toString('base64url');
    const signature = crypto.createHmac('sha256', auth.sessionSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function verifySessionToken(auth, token, now = auth.now()) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const expectedSignature = crypto.createHmac('sha256', auth.sessionSecret).update(parts[0]).digest('base64url');
    if (!safeEqual(Buffer.from(parts[1], 'utf8'), Buffer.from(expectedSignature, 'utf8'))) return null;

    try {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (payload.authenticated !== true || !Number.isFinite(payload.issuedAt)) return null;
        if (payload.issuedAt > now || now - payload.issuedAt > MAX_SESSION_AGE) return null;
        return payload;
    } catch (_) {
        return null;
    }
}
```

- [ ] **步驟 3：匯出並執行單元測試**

加上：

```js
module.exports = {
    COOKIE_NAME,
    createAdminAuth,
    createSessionToken,
    verifySessionToken
};
```

執行：`node --test test/adminAuth.test.js`

預期：4 個子測試全部 PASS。

- [ ] **步驟 4：提交純認證邏輯與測試**

```bash
git add middleware/adminAuth.js test/adminAuth.test.js
git commit -m "feat(認證): 新增簽名 session 驗證"
```

### 任務 3：增加 Express 認證 middleware 與登入路由

**檔案：**
- 修改：`middleware/adminAuth.js`
- 修改：`routes/admin.js:1-7`、`routes/admin.js:156`
- 測試：`test/adminAuth.test.js`

- [ ] **步驟 1：為 cookie 解析與未登入回應增加測試**

在 `test/adminAuth.test.js` 加入 helper 與測試：

```js
function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; return this; },
        json(body) { this.body = body; return this; },
        redirect(location) { this.redirectedTo = location; return this; }
    };
}

test('未登入管理頁導向登入頁，管理 API 回傳 401 JSON', () => {
    const { requireAdmin } = require('../middleware/adminAuth');
    const auth = createAdminAuth(CONFIG);
    const middleware = requireAdmin(auth);

    const pageResponse = createResponse();
    middleware({ path: '/admin', headers: {} }, pageResponse, () => assert.fail('不應放行'));
    assert.equal(pageResponse.redirectedTo, '/admin/login');

    const apiResponse = createResponse();
    middleware({ path: '/api/users', headers: {} }, apiResponse, () => assert.fail('不應放行'));
    assert.equal(apiResponse.statusCode, 401);
    assert.deepEqual(apiResponse.body, { error: '未登入或登入已失效' });
});
```

- [ ] **步驟 2：執行新增測試確認失敗**

執行：`node --test test/adminAuth.test.js`

預期：FAIL，因為尚未匯出 `requireAdmin`。

- [ ] **步驟 3：實作 cookie 解析、middleware 與 cookie header 建立器**

在 `middleware/adminAuth.js` 加入：

```js
function readCookie(header, name) {
    const pair = String(header || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function sessionCookie(token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function requireAdmin(auth) {
    return function adminGuard(req, res, next) {
        const token = readCookie(req.headers.cookie, COOKIE_NAME);
        if (verifySessionToken(auth, token)) return next();
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: '未登入或登入已失效' });
        }
        return res.redirect('/admin/login');
    };
}
```

同時將 `readCookie`、`sessionCookie`、`clearSessionCookie` 及 `requireAdmin` 加到 `module.exports`。

- [ ] **步驟 4：令 `routes/admin.js` 成為依賴注入 router**

將開頭改為：

```js
const express = require('express');
const db = require('../db');
const { formatDateForFilename } = require('../lib/util');
const { createSessionToken, sessionCookie, clearSessionCookie, requireAdmin } = require('../middleware/adminAuth');

module.exports = function createAdminRouter(auth) {
    const router = express.Router();
```

在既有 `GET /admin` 前新增登入與登出路由：

```js
router.get('/admin/login', (req, res) => {
    if (req.headers.cookie && requireAdmin(auth)) {
        const token = require('../middleware/adminAuth').readCookie(req.headers.cookie, 'admin_session');
        if (require('../middleware/adminAuth').verifySessionToken(auth, token)) return res.redirect('/admin');
    }
    res.render('admin-login', { errorMessage: '', titleSuffix: process.env.TITLE_SUFFIX || '' });
});

router.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (!auth.credentialsMatch(username, password)) {
        return res.status(401).render('admin-login', { errorMessage: '帳號或密碼不正確', titleSuffix: process.env.TITLE_SUFFIX || '' });
    }
    res.setHeader('Set-Cookie', sessionCookie(createSessionToken(auth)));
    res.redirect('/admin');
});

router.post('/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.redirect('/');
});

router.use(requireAdmin(auth));
```

改檔案最後一行為：

```js
    return router;
};
```

修正登入頁已登入檢查，避免重複 `require`：在檔案的 destructuring import 同時引入 `readCookie`、`verifySessionToken` 及 `COOKIE_NAME`，然後將登入頁路由改為：

```js
router.get('/admin/login', (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    if (verifySessionToken(auth, token)) return res.redirect('/admin');
    res.render('admin-login', { errorMessage: '', titleSuffix: process.env.TITLE_SUFFIX || '' });
});
```

- [ ] **步驟 5：執行認證測試確認通過**

執行：`node --test test/adminAuth.test.js`

預期：5 個子測試全部 PASS。

- [ ] **步驟 6：提交登入路由與 Express middleware**

```bash
git add middleware/adminAuth.js routes/admin.js test/adminAuth.test.js
git commit -m "feat(認證): 保護管理後台路由"
```

### 任務 4：新增網站登入頁及後台登出與 API 失效處理

**檔案：**
- 建立：`views/admin-login.ejs`
- 修改：`views/admin.ejs:36-41`、`views/admin.ejs:122-207`

- [ ] **步驟 1：建立登入頁 EJS**

建立 `views/admin-login.ejs`，沿用 `/styles.css`、PWA manifest、現有 `top-nav` 與 SVG 返回箭頭。主內容使用一個最大寬度 400px 的表單，包含：

```ejs
<form action="/admin/login" method="POST" class="login-form">
    <label for="username">帳號</label>
    <input id="username" name="username" type="text" autocomplete="username" required autofocus>
    <label for="password">密碼</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <% if (errorMessage) { %>
    <p class="login-error" role="alert"><%= errorMessage %></p>
    <% } %>
    <button type="submit" class="btn btn-primary">登入</button>
</form>
```

頁面文字為「管理員登入」和「請輸入管理帳號及密碼」；不顯示任何帳密範例或秘密資訊。

- [ ] **步驟 2：在 `public/styles.css` 加入登入頁局部樣式**

在檔尾加入：

```css
.login-container { max-width: 400px; margin: 0 auto; padding: 20px 16px; }
.login-form { background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
.login-form label { display: block; margin: 18px 0 8px; font-size: 18px; font-weight: 600; }
.login-form input { box-sizing: border-box; width: 100%; padding: 14px 16px; border: 2px solid #d0d7de; border-radius: 8px; font-size: 18px; }
.login-form .btn { margin-top: 24px; }
.login-error { margin: 16px 0 0; padding: 12px 16px; border-radius: 8px; background: #ffebee; color: #c62828; font-size: 16px; }
```

- [ ] **步驟 3：在後台頂部導航加入登出表單**

以此取代 `views/admin.ejs:37-41`：

```ejs
<div class="top-nav" style="max-width:720px;">
    <a href="/" class="nav-btn"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 返回</a>
    <h1>管理使用者</h1>
    <form action="/admin/logout" method="POST" class="logout-form">
        <button type="submit" class="nav-btn">登出</button>
    </form>
</div>
```

在 `views/admin.ejs` 的局部 style 加入：

```css
.logout-form { margin: 0; }
.logout-form .nav-btn { font: inherit; cursor: pointer; }
```

- [ ] **步驟 4：集中處理 fetch 的未登入回應**

在 `views/admin.ejs` 第一個 `<script>` 的最前方加入：

```js
function handleAdminResponse(response) {
    if (response.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('登入已失效');
    }
    return response;
}
```

將全部 fetch response chain 的第一個 `.then(r => ...)` 修改為先經過 `handleAdminResponse`：

```js
.then(handleAdminResponse).then(r => r.json())
```

SQL 匯入的文字回應則改成：

```js
.then(handleAdminResponse).then(r => r.text())
```

- [ ] **步驟 5：執行 EJS 與 JavaScript 語法檢查**

執行：`node --check middleware/adminAuth.js && node --check routes/admin.js`

預期：成功，無輸出。

- [ ] **步驟 6：提交登入與登出 UI**

```bash
git add views/admin-login.ejs views/admin.ejs public/styles.css
git commit -m "feat(認證): 新增管理員登入頁"
```

### 任務 5：在應用組裝點注入設定並啟用測試命令

**檔案：**
- 修改：`server.js:1-24`
- 修改：`package.json:5-8`

- [ ] **步驟 1：將 admin auth 建立於 `server.js`**

在路由掛載前加入：

```js
const { createAdminAuth } = require('./middleware/adminAuth');
const createAdminRouter = require('./routes/admin');
const adminAuth = createAdminAuth({
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET
});
```

將：

```js
app.use(require('./routes/admin'));
```

改為：

```js
app.use(createAdminRouter(adminAuth));
```

保留 `portal` 與 `records` router 原有掛載順序，使它們維持公開。

- [ ] **步驟 2：啟用 Node 內建測試 runner**

將 `package.json` 的 scripts 改為：

```json
"scripts": {
  "start": "node server.js",
  "test": "node --test"
}
```

- [ ] **步驟 3：驗證缺少設定時拒絕啟動**

執行：`node server.js`

預期：失敗並顯示 `ADMIN_USER must be configured`。此命令不應啟動 Web server。

- [ ] **步驟 4：以測試設定啟動並驗證未登入導向**

執行：`ADMIN_USER=admin ADMIN_PASSWORD=secret SESSION_SECRET=a-test-session-secret PORT=3100 node server.js`

以另一個終端執行：`curl -i http://localhost:3100/admin`

預期：HTTP `302 Found` 且 `Location: /admin/login`。完成後停止測試 server。

- [ ] **步驟 5：提交應用整合**

```bash
git add server.js package.json
git commit -m "feat(認證): 啟用管理員 session 設定"
```

### 任務 6：更新 Docker Compose 與 README

**檔案：**
- 修改：`docker-compose.yml:6-11`
- 修改：`README.md:40-53`
- 修改：`README.md:115-131`

- [ ] **步驟 1：加入 Compose 環境變數接點**

在 `docker-compose.yml` 的 `environment` 補上：

```yaml
      ADMIN_USER:
      ADMIN_PASSWORD: ''
      SESSION_SECRET: ''
```

不寫入實際帳密或 secret。

- [ ] **步驟 2：在 Docker 範例加入同名設定接點**

在 README 所有 Docker `environment` 範例的 `DB_NAME` 後增加：

```yaml
      ADMIN_USER: admin
      ADMIN_PASSWORD: 'replace-with-a-strong-password'
      SESSION_SECRET: 'replace-with-a-long-random-secret'
```

在範例前後明確說明 `ADMIN_PASSWORD` 與 `SESSION_SECRET` 必須自行替換，範例值不能用於實際部署。

- [ ] **步驟 3：補充環境變數表與安全提醒**

在 README 環境變數表加入：

```markdown
| `ADMIN_USER` | 管理後台登入帳號 | 必填 |
| `ADMIN_PASSWORD` | 管理後台登入密碼 | 必填 |
| `SESSION_SECRET` | 管理登入 cookie 簽名密鑰 | 必填 |
```

在啟動章節後增加：

```markdown
管理後台位於 `/admin`。必須設定 `ADMIN_USER`、`ADMIN_PASSWORD` 和 `SESSION_SECRET`，缺少任何一項時服務會拒絕啟動。

可用以下指令產生 session secret：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

登入狀態會在關閉瀏覽器後失效，且最多維持 24 小時。此認證只適合 HTTPS 或受信任家庭內網；切勿直接把 3000 port 暴露到公網。
```

- [ ] **步驟 4：檢查文件及 Compose 格式**

執行：`git diff --check`

預期：無 whitespace error。

- [ ] **步驟 5：提交部署與使用文件**

```bash
git add docker-compose.yml README.md
git commit -m "docs(認證): 補充管理後台登入設定"
```

### 任務 7：完整驗收

**檔案：**
- 驗證：`middleware/adminAuth.js`、`test/adminAuth.test.js`、`routes/admin.js`、`views/admin-login.ejs`、`views/admin.ejs`、`server.js`、`package.json`、`docker-compose.yml`、`README.md`

- [ ] **步驟 1：執行完整單元測試**

執行：`npm test`

預期：所有 `adminAuth` 子測試 PASS。

- [ ] **步驟 2：執行 Node.js 語法檢查**

執行：

```bash
node --check middleware/adminAuth.js
node --check routes/admin.js
node --check server.js
```

預期：三項均成功且無輸出。

- [ ] **步驟 3：以環境變數啟動 smoke test**

執行：

```bash
ADMIN_USER=admin ADMIN_PASSWORD=secret SESSION_SECRET=a-test-session-secret PORT=3100 node server.js
```

確認：

```bash
curl -i http://localhost:3100/admin
curl -i http://localhost:3100/api/users
curl -i http://localhost:3100/admin/login
curl -i -X POST -d "username=admin&password=secret" http://localhost:3100/admin/login
```

預期：依序為 `/admin/login` 的 302、JSON 401、登入頁 200、帶有 `Set-Cookie: admin_session=...; Path=/; HttpOnly; SameSite=Lax` 的 `/admin` 302。完成後停止 server。

- [ ] **步驟 4：驗證登出與持 cookie 的管理頁**

在同一測試 server 使用 cookie jar：

```bash
curl -c test-cookie.txt -i -X POST -d "username=admin&password=secret" http://localhost:3100/admin/login
curl -b test-cookie.txt -i http://localhost:3100/admin
curl -b test-cookie.txt -i -X POST http://localhost:3100/admin/logout
curl -b test-cookie.txt -i http://localhost:3100/api/users
```

預期：登入後的 `/admin` 為 200；登出回傳到 `/` 的 302 並清除 `admin_session`；最後 `/api/users` 是 JSON 401。刪除本機 `test-cookie.txt`。

- [ ] **步驟 5：檢查最終差異與工作樹**

執行：

```bash
git diff --check
git status --short
```

預期：無 whitespace error；沒有暫存秘密、測試 cookie 或 `.superpowers/` 原型資料。
