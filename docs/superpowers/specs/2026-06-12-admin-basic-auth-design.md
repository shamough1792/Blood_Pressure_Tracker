# 管理後台 Basic Auth 認證設計

## 目標

為管理後台加入簡單、無資料庫改動的 HTTP Basic Authentication，避免未授權使用者管理家庭成員、匯入資料或下載完整備份。一般血壓記錄功能維持公開可用。

## 方案

新增獨立 middleware `middleware/adminAuth.js`，由 `server.js` 在掛載管理路由時套用。middleware 負責解析 Basic Auth header、驗證環境變數中的帳密，以及回傳標準 401 challenge；管理路由本身維持現有功能。

不採用資料庫帳密或 session，原因是本需求只需要保護家庭內網中的管理操作，Basic Auth 不需新增 schema、session store 或登入頁，部署及維護成本最低。

## 認證範圍

整個 `routes/admin.js` 以 `/admin` 前綴掛載並受 middleware 保護，因此以下端點均需認證：

- `GET /admin`
- `GET /admin/export/sql`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `POST /api/import-sql`

Portal、血壓輸入、記錄檢視、統計、Excel 匯出及其 API 不受此認證影響。

## 設定

新增環境變數：

- `ADMIN_USER`：管理員帳號，必填
- `ADMIN_PASSWORD`：管理員密碼，必填

啟動時若任一變數未設定或為空字串，應立即以清楚錯誤訊息終止啟動，避免服務意外以未設定認證的狀態運行。不得在程式碼中放置帳密預設值。

Docker compose 應保留空白的環境變數接點，並在 README 的環境變數表及啟動範例說明設定方式。實際密碼不提交至 Git。

## 驗證行為

1. 缺少或格式錯誤的 `Authorization` header：回傳 `401 Unauthorized`，並附上 `WWW-Authenticate: Basic realm="Admin"`。
2. 帳號或密碼錯誤：同樣回傳 `401 Unauthorized` 及 challenge，不透露哪一項錯誤。
3. 帳密正確：交由後續路由處理。
4. 比較帳密時使用固定時間比較，並避免因長度不同造成例外。
5. API 錯誤回應維持 HTTP 狀態碼，不將管理頁 HTML 登入內容混入 JSON API。

Basic Auth 本身必須搭配 HTTPS 使用於不可信網路；本專案 Docker 預設為家庭內網部署，文件需明確提醒不要直接將 3000 port 暴露到公網。

## 實作邊界

- 新增 `middleware/adminAuth.js`。
- 修改 `server.js`，將 admin router 以 `/admin` 掛載並套用 middleware；由於 admin router 內已有 `/api/*` 路徑，middleware 需能同時涵蓋管理頁與管理 API，而不改變既有 URL。
- 修改 `docker-compose.yml`、README 的設定說明。
- 不新增資料表、不修改既有資料、不引入第三方認證套件。
- 不重構與認證無關的資料庫或路由錯誤處理。

## 測試與驗收

新增針對 middleware 的測試，覆蓋：

- 正確帳密放行。
- 缺少 header 拒絕。
- 錯誤帳號拒絕。
- 錯誤密碼拒絕。
- malformed Base64 / 非 Basic scheme 拒絕。
- 缺少必要環境變數時的設定錯誤。

驗收時確認管理頁與管理 API 的 URL 不變，認證只套用於 admin router，並執行專案可用的 lint/test 或至少進行 Node.js 語法檢查。由於目前 `npm test` 尚未建立測試，需同步將測試腳本改為可執行的測試命令，或明確記錄測試執行限制。
