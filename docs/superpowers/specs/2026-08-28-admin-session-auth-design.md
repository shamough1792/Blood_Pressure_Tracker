# 管理後台 Session 認證設計

## 目標

為管理後台加入簡單的網站登入頁，避免未授權使用者管理家庭成員、匯入資料或下載完整備份。一般血壓記錄功能維持公開可用。

## 方案

採用環境變數驅動的帳密驗證，加上無狀態、具簽名的 session cookie。

登入成功時，伺服器以 Node.js 內建 `crypto` 簽發 session cookie；cookie 不設定 `Max-Age` 或 `Expires`，因此關閉瀏覽器後失效。不新增資料表、session store 或第三方認證套件。

## 認證範圍

以下管理頁與管理 API 必須登入後才可使用：

- `GET /admin`
- `GET /admin/export/sql`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `POST /api/import-sql`

以下端點維持公開：

- Portal 與使用者選擇
- 血壓輸入、修改、刪除及重覆記錄檢查
- 月曆記錄、統計頁及 Excel 匯出

## 路由與資料流

### 登入頁

- `GET /admin/login` 顯示帳號、密碼輸入頁。
- 已登入者前往此頁時，直接導向 `/admin`。
- `POST /admin/login` 驗證帳密；成功時設置 session cookie 並導向 `/admin`。
- 登入失敗時以 `401` 重新顯示登入頁，訊息固定為「帳號或密碼不正確」，不揭露錯誤欄位。
- `POST /admin/logout` 清除 session cookie 並導向 `/`。

### 管理頁與 API

- 新增 `middleware/adminAuth.js`，負責驗證 cookie 簽名、格式、有效時間與登入狀態。
- 未登入時，請求 `/admin` 頁面導向 `/admin/login`；請求管理 API 回傳 `401` JSON，例如 `{ "error": "未登入或登入已失效" }`。
- 管理後台前端收到 API `401` 時，導向 `/admin/login`，避免 API 操作只顯示含糊的錯誤提示。
- 後台頂部導航加入「登出」按鈕。

## Cookie 格式與安全性

Cookie payload 使用 JSON，至少包含：

- `authenticated: true`
- `issuedAt`: 發出時間（Unix milliseconds）

伺服器用 `SESSION_SECRET` 對 payload 計算 HMAC-SHA256，cookie 以 `base64url(payload).signature` 表示。驗證時必須：

1. 安全解析 cookie，格式或 JSON 無效即拒絕。
2. 以 `crypto.timingSafeEqual` 比較簽名，長度不同時直接判定不相符，避免例外。
3. 驗證 `authenticated === true` 與 `issuedAt` 為有效數字。
4. 設定固定有效上限為 24 小時；即使瀏覽器未關閉，超過上限也需重新登入。

Cookie 屬性：

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` 僅在 `NODE_ENV=production` 時加上，部署時必須由 HTTPS reverse proxy 提供 TLS。
- 不設定 `Max-Age` 或 `Expires`。

登入表單與後台所有變更 API 不在本次加入 CSRF token；部署前提為受信任家庭內網或 HTTPS。文件須提醒不得直接把 3000 port 暴露到公網。

## 設定

必填環境變數：

- `ADMIN_USER`：管理員帳號。
- `ADMIN_PASSWORD`：管理員密碼。
- `SESSION_SECRET`：高熵、隨機的 cookie 簽名密鑰。

任一設定遺漏或為空字串時，服務必須啟動失敗，且不提供預設值。實際秘密不能提交到 Git。

`docker-compose.yml` 及 README 僅提供三個變數的設定接點與產生 `SESSION_SECRET` 的指令範例。

## 實作邊界

- 新增 session 建立與驗證的純函式，以及 admin 認證 middleware。
- 新增登入頁 `views/admin-login.ejs`。
- 修改 `routes/admin.js`、`views/admin.ejs` 與 `server.js` 以處理登入、登出及存取保護。
- 修改 `docker-compose.yml`、README、`package.json` 與測試檔。
- 不新增資料表、不修改既有血壓記錄資料、不引入 session 或認證第三方套件。
- 不重構與認證無關的資料庫或路由錯誤處理。

## 測試與驗收

以 Node.js 內建 `node:test` 測試純認證邏輯，至少覆蓋：

- 缺少 `ADMIN_USER`、`ADMIN_PASSWORD` 或 `SESSION_SECRET` 時的設定錯誤。
- 正確帳密可建立並驗證 session cookie。
- 錯誤帳號或密碼遭拒絕。
- 偽造簽名、格式錯誤 payload、格式錯誤 cookie、缺少 cookie 均遭拒絕。
- 超過 24 小時的 cookie 遭拒絕。
- 簽名長度不符不會拋出例外。

整合驗收確認：

- 未登入瀏覽 `/admin` 會進入登入頁。
- 未登入呼叫管理 API 回傳 `401` JSON。
- 登入後管理頁、使用者管理、SQL 匯入與備份 URL 維持原有路徑並可使用。
- 登出後不能再存取管理頁或管理 API。
- `npm test`、Node.js 語法檢查及 `git diff --check` 成功。
