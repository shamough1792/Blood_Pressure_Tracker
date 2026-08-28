# 管理後台 Basic Auth 實作計畫

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 逐任務實作此計畫。步驟使用複選框（`- [ ]`）語法來追蹤進度。

**目標：** 為管理後台及其管理 API 加入環境變數驅動的 HTTP Basic Authentication，並提供可重複執行的測試與部署文件。

**架構：** 新增 `middleware/adminAuth.js` 作為純 middleware，驗證 `Authorization: Basic ...`，以固定時間比較帳密並回傳 401 challenge。`server.js` 將 `routes/admin.js` 以 `/admin` 掛載並套用 middleware，使既有管理頁與 `/api/*` 管理端點 URL 不變；其他路由維持公開。帳密只從 `ADMIN_USER` 和 `ADMIN_PASSWORD` 讀取。

**技術棧：** Node.js CommonJS、Express 4、Node `crypto.timingSafeEqual`、Node 內建 `node:test` 與 `assert`、Docker Compose、Markdown 文件。

---

## 檔案結構與責任

- 建立：`middleware/adminAuth.js`，提供設定檢查與 Basic Auth middleware。
- 建立：`test/adminAuth.test.js`，測試 middleware 的設定錯誤、認證成功與所有拒絕分支。
- 修改：`server.js:16-19`，以 `/admin` 加 middleware 掛載管理 router。
- 修改：`docker-compose.yml:7-11`，加入 `ADMIN_USER` 與 `ADMIN_PASSWORD` 設定接點。
- 修改：`README.md:115-123`，文件化管理員帳號、密碼與 HTTPS/內網部署提醒。
- 修改：`package.json:5-8`，把 `npm test` 改成執行 `node --test`。

### 任務 1：建立 middleware 的失敗測試

**檔案：**
- 建立：`test/adminAuth.test.js`
- 參考：`middleware/adminAuth.js`（此任務完成前尚不存在）

- [ ] **步驟 1：撰寫測試案例**

使用 Node 內建測試 runner，測試 exported `createAdminAuth`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminAuth } = require('../middleware/adminAuth');

function request(authorization) {
    return { headers: authorization ? { authorization } : {} };
}

function response() {
    return {
        statusCode: 200,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        send(body) { this.body = body; return this; }
    };
}

test('missing credentials configuration throws', () => {
    assert.throws(() => createAdminAuth('', 'secret'), /ADMIN_USER/);
    assert.throws(() => createAdminAuth('admin', ''), /ADMIN_PASSWORD/);
});

test('valid credentials call next', () => {
    const middleware = createAdminAuth('admin', 'secret');
    const res = response();
    let nextCalled = false;
    middleware(request('Basic ' + Buffer.from('admin:secret').toString('base64')), res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
});

test('missing, malformed, wrong scheme, and wrong credentials return 401 challenge', () => {
    const middleware = createAdminAuth('admin', 'secret');
    for (const authorization of [undefined, 'not-basic', 'Basic !!!', 'Basic ' + Buffer.from('admin:wrong').toString('base64'), 'Basic ' + Buffer.from('other:secret').toString('base64')]) {
        const res = response();
        let nextCalled = false;
        middleware(request(authorization), res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 401);
        assert.equal(res.headers['WWW-Authenticate'], 'Basic realm="Admin"');
    }
});
```

- [ ] **步驟 2：執行測試確認目前失敗**

執行：`node --test test/adminAuth.test.js`

預期：FAIL，因為 `../middleware/adminAuth` 尚未建立。

### 任務 2：實作 middleware

**檔案：**
- 建立：`middleware/adminAuth.js`
- 測試：`test/adminAuth.test.js`

- [ ] **步驟 1：加入設定檢查、Basic Auth 解析及固定時間比較**

實作以下介面和行為：

```js
const crypto = require('crypto');

function createAdminAuth(username, password) {
    if (!username) throw new Error('ADMIN_USER must be configured');
    if (!password) throw new Error('ADMIN_PASSWORD must be configured');

    const expectedUser = Buffer.from(username, 'utf8');
    const expectedPassword = Buffer.from(password, 'utf8');

    return function adminAuth(req, res, next) {
        const header = req.headers.authorization || '';
        if (!header.startsWith('Basic ')) return reject(res);
        let decoded;
        try {
            decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        } catch (_) {
            return reject(res);
        }
        const separator = decoded.indexOf(':');
        if (separator < 0) return reject(res);
        const suppliedUser = Buffer.from(decoded.slice(0, separator), 'utf8');
        const suppliedPassword = Buffer.from(decoded.slice(separator + 1), 'utf8');
        const userMatches = safeEqual(suppliedUser, expectedUser);
        const passwordMatches = safeEqual(suppliedPassword, expectedPassword);
        if (!userMatches || !passwordMatches) return reject(res);
        next();
    };
}

function safeEqual(actual, expected) {
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function reject(res) {
    res.status(401).setHeader('WWW-Authenticate', 'Basic realm="Admin"').send('Authentication required');
}

module.exports = { createAdminAuth };
```

Use `process.env.ADMIN_USER` and `process.env.ADMIN_PASSWORD` only at the application composition point in `server.js`; do not read process globals inside the reusable factory.

- [ ] **步驟 2：執行測試確認通過**

執行：`node --test test/adminAuth.test.js`

預期：所有測試 PASS。

- [ ] **步驟 3：Commit middleware 與測試**

```bash
git add middleware/adminAuth.js test/adminAuth.test.js
git commit -m "feat: 新增管理後台 Basic Auth middleware"
```

### 任務 3：保護管理路由並更新測試命令

**檔案：**
- 修改：`server.js:16-19`
- 修改：`package.json:5-8`
- 測試：`test/adminAuth.test.js`

- [ ] **步驟 1：修改路由掛載**

將現有：

```js
app.use(require('./routes/admin'));
```

改成：

```js
const { createAdminAuth } = require('./middleware/adminAuth');
const adminAuth = createAdminAuth(process.env.ADMIN_USER, process.env.ADMIN_PASSWORD);
app.use(adminAuth);
app.use(require('./routes/admin'));
```

這裡不能以 `app.use('/admin', adminAuth, ...)` 掛載，因為同一 router 同時提供 `/admin` 頁面和 `/api/*` 管理 API；全 router middleware 才能覆蓋兩者。

- [ ] **步驟 2：更新 npm test**

將 `package.json` 的 test script 改為：

```json
"test": "node --test"
```

- [ ] **步驟 3：執行語法與測試驗證**

執行：`npm test`

預期：middleware 測試 PASS；若未設定 `ADMIN_USER` / `ADMIN_PASSWORD`，直接啟動 server 應以 `ADMIN_USER must be configured` 或 `ADMIN_PASSWORD must be configured` 失敗，這是預期的安全行為。

- [ ] **步驟 4：Commit 路由與測試命令**

```bash
git add server.js package.json
git commit -m "feat: 保護管理路由"
```

### 任務 4：更新 Docker 與使用文件

**檔案：**
- 修改：`docker-compose.yml:7-11`
- 修改：`README.md:115-131`

- [ ] **步驟 1：加入 Compose 環境變數**

在 `environment` 加入：

```yaml
      ADMIN_USER:
      ADMIN_PASSWORD:
```

不寫入任何真實帳密；使用者透過 shell、`.env` 或部署平台注入值。

- [ ] **步驟 2：補充 README 設定說明**

在環境變數表加入 `ADMIN_USER` 與 `ADMIN_PASSWORD`，並在啟動章節說明：管理後台位於 `/admin`；缺少設定時服務不會啟動；Basic Auth 密碼僅適合 HTTPS 或受信任家庭內網，不應直接暴露 3000 port 到公網。

- [ ] **步驟 3：檢查 Markdown 與 Compose 內容**

執行：`git diff --check`

預期：無 whitespace error。

- [ ] **步驟 4：Commit 部署與文件**

```bash
git add docker-compose.yml README.md
git commit -m "docs: 補充管理後台認證設定"
```

### 任務 5：整體驗收

**檔案：**
- 驗證：`middleware/adminAuth.js`、`server.js`、`package.json`、`docker-compose.yml`、`README.md`

- [ ] **步驟 1：執行完整測試**

執行：`npm test`

預期：所有測試 PASS。

- [ ] **步驟 2：執行語法檢查**

執行：`node --check middleware/adminAuth.js; node --check server.js; node --check routes/admin.js`

預期：所有命令成功。

- [ ] **步驟 3：檢查差異與工作樹**

執行：`git diff --check; git status --short`

預期：無 diff whitespace error；工作樹只包含本功能預期的提交後狀態。

- [ ] **步驟 4：確認認證邊界**

靜態確認 `server.js` 在 admin router 之前建立 `adminAuth` 並掛載，且 admin router 仍包含 `/admin`、`/api/users`、`/api/import-sql` 原始路徑；未改動 portal、records router 的掛載。
