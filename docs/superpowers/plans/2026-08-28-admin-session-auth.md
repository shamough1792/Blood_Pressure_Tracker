# 管理後台 Session 認證實作計畫

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 逐任務實作此計畫。步驟使用複選框（`- [ ]`）語法來追蹤進度。

**目標：** 為管理後台加上環境變數驅動的帳密登入頁與 HMAC 簽名 session cookie 認證，保護使用者管理、SQL 匯入與備份功能；一般血壓記錄功能維持公開。

**架構：** 新增 `middleware/adminAuth.js`，提供純函式（`createAdminAuth`、`createSessionToken`、`verifySessionToken`）與 `isAuthenticated(req)` 登入狀態檢查。`routes/admin.js` 在最前方新增登入/登出路由，接著以 `router.use(requireAdmin)` 保護其餘所有管理頁與 `/api/*` 管理 API，URL 全部維持不變。啟動時（`server.js`）驗證 `ADMIN_USER`、`ADMIN_PASSWORD`、`SESSION_SECRET` 三項必填環境變數，任一缺失即明確失敗。

**技術棧：** Node.js CommonJS、Express 4、Node 內建 `node:crypto`（HMAC-SHA256、`timingSafeEqual`）、`node:test` 與 `node:assert/strict`、EJS、Docker Compose。

**設計規格：** `docs/superpowers/specs/2026-08-28-admin-session-auth-design.md`

---

## 檔案結構與責任

- 建立：`middleware/adminAuth.js` — session token 的簽發/驗證純函式、設定檢查、`isAuthenticated(req)` 登入狀態檢查。
- 建立：`views/admin-login.ejs` — 帳號密碼登入頁，錯誤訊息固定「帳號或密碼不正確」。
- 建立：`test/adminAuth.test.js` — 純函式與 middleware 的 4 個測試案例（承接 `worktree-admin-session-auth` 分支既有測試，逐字採用）。
- 修改：`routes/admin.js` — 改為導出接收 adminAuth 的工廠函式；在檔案最前方新增 `GET/POST /admin/login`、`POST /admin/logout`，其餘所有路由以 `router.use(requireAdmin)` 保護。
- 修改：`views/admin.ejs` — 頂部導航加入「登出」按鈕；前端 fetch 收到 `401` 時導向 `/admin/login`。
- 修改：`server.js` — 建立 admin auth 並傳入環境變數；啟動時驗證三項必填設定。
- 修改：`package.json` — `npm test` 改為 `node --test`。
- 修改：`docker-compose.yml`、`README.md` — 加入三個認證環境變數接點與產生 `SESSION_SECRET` 的指令範例。

---

## 任務 1：建立 adminAuth 的失敗測試

**檔案：**
- 建立：`test/adminAuth.test.js`

- [ ] **步驟 1：寫入測試檔案**

在 `test/adminAuth.test.js` 寫入以下內容（逐字採用既有 TDD 測試，測試 `createAdminAuth`、`createSessionToken`、`verifySessionToken` 三個導出函式）：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
    const malformedPayload = Buffer.from('{bad json}', 'utf8').toString('base64url');
    const malformedSignature = crypto.createHmac('sha256', CONFIG.sessionSecret)
        .update(malformedPayload)
        .digest('base64url');
    const malformedToken = `${malformedPayload}.${malformedSignature}`;

    assert.equal(verifySessionToken(auth, oldToken, NOW), null);
    assert.equal(verifySessionToken(auth, malformedToken, NOW), null);
    assert.doesNotThrow(() => verifySessionToken(auth, 'abc.x', NOW));
});
```

- [ ] **步驟 2：執行測試確認目前失敗**

執行：`node --test test/adminAuth.test.js`

預期：FAIL，因為 `../middleware/adminAuth` 尚不存在（`Cannot find module`）。

- [ ] **步驟 3：Commit 測試**

```bash
git add test/adminAuth.test.js
git commit -m "test(認證): 建立 session 認證失敗測試"
```

---

## 任務 2：實作 adminAuth middleware

**檔案：**
- 建立：`middleware/adminAuth.js`
- 測試：`test/adminAuth.test.js`

- [ ] **步驟 1：實作純函式與登入狀態檢查**

在 `middleware/adminAuth.js` 寫入以下內容。介面設計必須與測試完全吻合；secret 只存在於閉包內，不暴露到回傳物件：

```js
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
        const cookie = req.headers.cookie || '';
        const match = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookie);
        const token = match ? match[1] : null;
        return token !== null && verifyToken(token) !== null;
    }

    return {
        credentialsMatch,
        issueToken,
        verifyToken,
        isAuthenticated
    };
}

// 頂層薄包裝：測試直接呼叫這兩個函式，secret 不外露
function createSessionToken(auth, issuedAt) {
    return auth.issueToken(issuedAt);
}

function verifySessionToken(auth, token, currentTime) {
    return auth.verifyToken(token, currentTime);
}

module.exports = { createAdminAuth, createSessionToken, verifySessionToken, COOKIE_NAME, SESSION_MAX_AGE_MS };
```

對外契約：`createAdminAuth(config)`、`createSessionToken(auth, issuedAt)`、`verifySessionToken(auth, token, currentTime)`、`auth.isAuthenticated(req)`。`routes/admin.js` 使用 `adminAuth.isAuthenticated(req)` 檢查登入狀態，`createSessionToken(adminAuth, Date.now())` 簽發、`adminAuth.credentialsMatch(...)` 驗證帳密。`extractToken` 只用於 `isAuthenticated` 內，不再提供 `middleware` Express middleware（路由保護統一由 `requireAdmin` 完成，避免 cookie 解析邏輯重複）。

- [ ] **步驟 2：執行測試確認通過**

執行：`node --test test/adminAuth.test.js`

預期：4 個測試案例全部 PASS。

- [ ] **步驟 3：Commit middleware 與測試**

```bash
git add middleware/adminAuth.js test/adminAuth.test.js
git commit -m "feat(認證): 實作 session token 簽發與驗證"
```

---

## 任務 3：新增登入頁

**檔案：**
- 建立：`views/admin-login.ejs`

- [ ] **步驟 1：建立登入頁**

在 `views/admin-login.ejs` 寫入以下內容（遵循現有 `admin.ejs` 的樣式語言與 `styles.css` 類別）：

```html
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>管理員登入<%= typeof titleSuffix !== 'undefined' && titleSuffix ? ' (' + titleSuffix + ')' : '' %></title>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#2d6a4f">
    <link rel="stylesheet" href="/styles.css">
    <style>
        .login-container{max-width:400px;margin:0 auto;padding:60px 16px;width:100%}
        .login-card{background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
        .login-card h1{font-size:24px;margin-bottom:24px;color:#1a1a2e;text-align:center}
        .login-error{margin-bottom:16px;padding:12px 16px;border-radius:8px;background:#ffebee;color:#c62828;font-size:16px;text-align:center}
        .login-card input[type=text],.login-card input[type=password]{width:100%;padding:14px 16px;font-size:20px;border:2px solid #d0d7de;border-radius:12px;margin-bottom:16px;box-sizing:border-box}
        .login-card .btn{width:100%;padding:14px 24px;font-size:18px;max-width:none}
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <h1>管理員登入</h1>
            <% if (typeof error !== 'undefined' && error) { %>
            <div class="login-error">帳號或密碼不正確</div>
            <% } %>
            <form method="POST" action="/admin/login">
                <input type="text" name="username" placeholder="帳號" required autofocus autocomplete="username">
                <input type="password" name="password" placeholder="密碼" required autocomplete="current-password">
                <button type="submit" class="btn btn-primary">登入</button>
            </form>
        </div>
    </div>
</body>
</html>
```

- [ ] **步驟 2：語法檢查**

執行：`node --check` 不適用於 EJS；改用 `node -e "require('ejs').compile(require('fs').readFileSync('views/admin-login.ejs','utf8'))"`

預期：無錯誤（EJS 可成功編譯）。

- [ ] **步驟 3：Commit 登入頁**

```bash
git add views/admin-login.ejs
git commit -m "feat(認證): 新增管理員登入頁"
```

---

## 任務 4：在 admin router 加入登入、登出與路由保護

**檔案：**
- 修改：`routes/admin.js`
- 參考：`middleware/adminAuth.js`（任務 2 已建立）

- [ ] **步驟 1：將 admin router 改為工廠函式並加入認證邏輯**

把 `routes/admin.js` 的 `const router = express.Router();`（現為第 4 行 `const router = express.Router();`）上方加入 `adminAuth` 參數，並把最後一行的 `module.exports = router;` 改為：

```js
module.exports = function createAdminRouter(adminAuth) {
    const router = express.Router();
    // ...（以下所有既有管理路由 + 新增的登入/登出/requireAdmin，全部維持在工廠內）
    return router;
};
```

在 `createAdminRouter(adminAuth)` 函式內、`router.get('/admin', ...)` 之前，加入以下登入/登出與保護邏輯（`adminAuth` 由 `server.js` 傳入，此處不需再 `createAdminAuth`；`createSessionToken`、`COOKIE_NAME` 從 `middleware/adminAuth` 匯入）：

```js
const { createSessionToken, COOKIE_NAME } = require('../middleware/adminAuth');

// 未登入：頁面導向登入頁；API 回傳 401 JSON
function requireAdmin(req, res, next) {
    if (adminAuth.isAuthenticated(req)) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: '未登入或登入已失效' });
    }
    res.redirect('/admin/login');
}

// 已登入者前往登入頁直接導向管理頁
router.get('/admin/login', (req, res) => {
    if (adminAuth.isAuthenticated(req)) return res.redirect('/admin');
    res.render('admin-login', { error: null, titleSuffix: process.env.TITLE_SUFFIX || '' });
});

// 驗證帳密：成功設定 session cookie 並導向管理頁；失敗重新顯示登入頁（訊息固定）
router.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (adminAuth.credentialsMatch(username || '', password || '')) {
        const token = createSessionToken(adminAuth, Date.now());
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production'
        });
        return res.redirect('/admin');
    }
    res.status(401).render('admin-login', { error: true, titleSuffix: process.env.TITLE_SUFFIX || '' });
});

// 登出：清除 cookie 並導向首頁
router.post('/admin/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.redirect('/');
});

// 其餘所有管理路由（含 /api/*）需登入
router.use(requireAdmin);
```

> 注意：登入/登出路由必須在 `router.use(requireAdmin)` **之前**註冊，否則會被攔截。`GET /admin/login`、`POST /admin/login`、`POST /admin/logout` 均不需登入即可存取；登出後清除 cookie 即失效。

- [ ] **步驟 2：驗證保護範圍**

靜態確認 `routes/admin.js` 中 `router.use(requireAdmin)` 之後的路由清單包含：
- `GET /admin`
- `GET /admin/export/sql`
- `GET /api/users`、`POST /api/users`、`PUT /api/users/:id`、`DELETE /api/users/:id`
- `POST /api/import-sql`

這些是規格「認證範圍」列的端點，全部在保護之後。

- [ ] **步驟 3：語法檢查**

執行：`node --check routes/admin.js`

預期：無錯誤。

- [ ] **步驟 4：Commit 路由保護**

```bash
git add routes/admin.js
git commit -m "feat(認證): 新增登入登出路由並保護管理後台"
```

---

## 任務 5：管理頁加入登出按鈕與 401 導向

**檔案：**
- 修改：`views/admin.ejs`

- [ ] **步驟 1：頂部導航加入登出按鈕**

將 `views/admin.ejs` 的 `.top-nav`（目前含「返回」連結與標題 `<h1>管理使用者</h1>`）改為在右側加入登出按鈕。找現有行：

```html
            <a href="/" class="nav-btn"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 返回</a>
            <h1>管理使用者</h1>
            <span style="width:60px;"></span>
```

改為：

```html
            <a href="/" class="nav-btn"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 返回</a>
            <h1>管理使用者</h1>
            <form method="POST" action="/admin/logout" style="margin:0;">
                <button type="submit" class="btn-sm" style="background:#ffebee;color:#c62828;border:none;cursor:pointer;font-size:15px;padding:10px 16px;border-radius:10px;">登出</button>
            </form>
```

- [ ] **步驟 2：前端 fetch 收到 401 時導向登入頁**

在 `views/admin.ejs` 的 `<script>` 區塊中，`addUser`、`deleteUser`、`saveEdit` 三個函式的 `.then(r => r.json()).then(data => ...)` 處理前加入 401 檢查。以 `addUser` 為例，把：

```js
        }).then(r => r.json()).then(data => {
```

改為：

```js
        }).then(r => {
            if (r.status === 401) { window.location.href = '/admin/login'; return; }
            return r.json();
        }).then(data => {
            if (!data) return;
```

`deleteUser` 與 `saveEdit` 的對應片段用相同方式修改（兩處 `.then(r => r.json()).then(data => {` 各加 401 檢查）。`importSql` 使用 `r.text()`，改為先檢查狀態碼：

```js
            .then(r => {
                if (r.status === 401) { window.location.href = '/admin/login'; return null; }
                return r.text();
            }).then(msg => {
                if (msg === null) return;
```

- [ ] **步驟 3：語法檢查（含內嵌 JS）**

執行：`node --check` 不適用於 EJS；改用 `node -e "const html=require('fs').readFileSync('views/admin.ejs','utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/g); m.forEach((s,i)=>{const js=s.replace(/<script>/,'').replace(/<\/script>/,''); new Function(js);}); console.log('inline JS OK', m.length)"`

預期：輸出 `inline JS OK`，無語法錯誤。

- [ ] **步驟 4：Commit 管理頁更新**

```bash
git add views/admin.ejs
git commit -m "feat(認證): 管理後台加入登出按鈕與 401 自動導向"
```

---

## 任務 6：啟動時設定驗證與 npm test

**檔案：**
- 修改：`server.js`
- 修改：`package.json`

- [ ] **步驟 1：建立 adminAuth 並在掛載前做設定檢查**

將 `server.js` 開頭的 middleware 區塊（`app.use(require('./routes/portal'))` 等三行路由掛載之前）改為先建立 adminAuth 實例，再以建立好的實例掛載 admin router。範例（改動位置為 `require('./db')` 之後、`app.use(require('./routes/portal'))` 之前）：

```js
const { createAdminAuth } = require('./middleware/adminAuth');

// 啟動時驗證管理後台認證設定，任一缺失即拒絕啟動
const adminAuth = createAdminAuth({
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET
});
```

- [ ] **步驟 2：傳入 adminAuth 給 admin router**

將現有：

```js
app.use(require('./routes/admin'));
```

改為：

```js
app.use(require('./routes/admin')(adminAuth));
```

同時把 `routes/admin.js` 頂部的 `createAdminAuth({ ... })` 改為導出一個工廠函式，接收 `server.js` 建立的 adminAuth：

```js
module.exports = function createAdminRouter(adminAuth) {
    const router = express.Router();
    // ...（登入、登出、requireAdmin、既有管理路由全部維持在工廠內）
    return router;
};
```

> 說明：管理路由共用 `server.js` 建立的單一 adminAuth 實例（secret、帳密一致）；啟動時的設定檢查由 `server.js` 的 `createAdminAuth` 完成，`routes/admin.js` 不再重複呼叫。

- [ ] **步驟 3：更新 npm test**

將 `package.json` 的 test script 改為：

```json
"test": "node --test"
```

- [ ] **步驟 4：執行測試與語法驗證**

執行：`npm test`

預期：`test/adminAuth.test.js` 的 4 個測試案例 PASS（`node --test` 會自動掃描 `test/` 目錄）。

再執行：`node --check server.js && node --check middleware/adminAuth.js && node --check routes/admin.js`

預期：無錯誤。

> 驗證設定檢查：在**不設定** `ADMIN_USER` 等變數的環境下直接 `node server.js`，預期以 `ADMIN_USER must be configured` 或類似訊息終止——這是預期的安全行為；實際啟動仍需要 DB 連線，此步驟只在確認錯誤訊息，不必真正啟動成功。

- [ ] **步驟 5：Commit 設定檢查、admin router 工廠與測試命令**

```bash
git add server.js package.json routes/admin.js
git commit -m "feat(認證): 啟動時驗證管理認證設定並啟用 npm test"
```

---

## 任務 7：更新 Docker 與文件

**檔案：**
- 修改：`docker-compose.yml`
- 修改：`README.md`

- [ ] **步驟 1：Compose 加入認證環境變數接點**

在 `docker-compose.yml` 的 `environment` 區塊加入：

```yaml
      ADMIN_USER:
      ADMIN_PASSWORD:
      SESSION_SECRET:
```

不寫入任何真實帳密；使用者透過 `.env` 或部署平台注入值。

- [ ] **步驟 2：README 環境變數表與啟動說明**

在 `README.md` 的「環境變數」表格加入三行：

| `ADMIN_USER` | 管理後台帳號 | |
| `ADMIN_PASSWORD` | 管理後台密碼 | |
| `SESSION_SECRET` | Session cookie 簽名密鑰（高熵隨機） | |

並在「啟動」章節之後加入一段「管理後台認證」說明：

### 管理後台認證

管理後台位於 `/admin`，需登入才能管理使用者、匯入 SQL 或下載 SQL 備份；一般血壓記錄功能維持公開。

設定三個環境變數後，使用以下指令產生高熵的 `SESSION_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

任一個認證變數未設定時，服務不會啟動。Session cookie 具 `HttpOnly` 與 `SameSite=Lax` 屬性，於 production 加上 `Secure`；部署需透過 HTTPS reverse proxy（如 Synology 的 reverse proxy）提供 TLS，請勿直接將 3000 port 暴露到公網。

- [ ] **步驟 3：檢查 Markdown 與 Compose 內容**

執行：`git diff --check`

預期：無 whitespace error。

- [ ] **步驟 4：Commit 部署與文件**

```bash
git add docker-compose.yml README.md
git commit -m "docs(認證): 補充管理後台認證設定與文件"
```

---

## 任務 8：整體驗收

**檔案：**
- 驗證：`middleware/adminAuth.js`、`routes/admin.js`、`views/admin-login.ejs`、`views/admin.ejs`、`server.js`、`package.json`、`docker-compose.yml`、`README.md`

- [ ] **步驟 1：執行完整測試**

執行：`npm test`

預期：`test/adminAuth.test.js` 4 個測試案例全部 PASS。

- [ ] **步驟 2：執行語法檢查**

執行：`node --check middleware/adminAuth.js; node --check routes/admin.js; node --check server.js`

預期：所有命令成功。

- [ ] **步驟 3：檢查差異與工作樹**

執行：`git diff --check; git status --short`

預期：無 diff whitespace error；工作樹只包含本功能預期的提交後狀態。

- [ ] **步驟 4：確認認證邊界（靜態）**

確認：
- `routes/admin.js` 中登入/登出路由在 `router.use(requireAdmin)` 之前；`/admin`、`/api/users*`、`/api/import-sql` 全部在保護之後。
- `server.js` 在建立 app 前呼叫 `createAdminAuth` 做設定檢查。
- portal、records router 的掛載未更動（`server.js` 的 `app.use(require('./routes/portal'))`、`app.use(require('./routes/records'))` 原樣保留）。

**整合驗收（可選，需 DB 連線）：**
- 未登入瀏覽 `/admin` → 導向 `/admin/login`。
- 未登入呼叫 `/api/users` → `401` JSON。
- 以正確帳密登入 → 導向 `/admin`，管理功能可用。
- 登出後再存取 `/admin` → 導向登入頁。
