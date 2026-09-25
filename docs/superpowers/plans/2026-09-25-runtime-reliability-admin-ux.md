# 執行可靠性與管理體驗實作計畫

**目標：** 完成資料庫連線、錯誤處理、健康檢查、備份、CI/CD、整合測試、管理總覽與互動回饋等 1–10 項優化。

**架構：** 將可獨立驗證的行為抽成小型 helper，Express 應用改為可注入與可測試的工廠；資料庫使用 pool；備份採版本化 JSON 與 SHA-256 checksum，匯入先預覽再確認。保留既有路由與 UI 結構，只替換不可靠的實作。

**技術棧：** Node.js 20、Express 4、mysql2、EJS、ExcelJS、Node test runner、Docker、GitHub Actions。

---

### 任務 1：執行階段可靠性

- [ ] 新增 pool 與 readiness helper 測試。
- [ ] 將單一資料庫連線改成 `mysql2.createPool()`。
- [ ] 建立 Express app factory、統一 404／error middleware。
- [ ] 新增 `/health`、`/ready` 與 Docker `HEALTHCHECK`。

### 任務 2：匯出與備份安全

- [ ] 新增 JSON backup schema、checksum、驗證與預覽測試。
- [ ] Excel 改用 response stream，不產生暫存檔。
- [ ] 新增 JSON 備份下載與預覽／確認匯入 API。
- [ ] 保留舊 SQL 匯入相容入口並清楚標示。

### 任務 3：管理後台資訊與互動

- [ ] 新增總覽統計 helper 測試。
- [ ] 顯示最近量測、7 日分布與最後備份時間。
- [ ] 將 `alert()`／`confirm()` 改成 toast／modal。

### 任務 4：整合測試與 CI/CD

- [ ] 新增登入、CSRF、使用者 API、記錄權限、備份 rollback 測試。
- [ ] 新增 PR／push CI 與 Docker build。
- [ ] 新增 tag Release 與 GHCR image workflow。
- [ ] 所有 Actions 固定完整 commit SHA 並限制權限。

### 任務 5：依賴與文件

- [ ] 驗證 ExcelJS 對安全版 `uuid` override 的相容性。
- [ ] 執行 audit、測試、語法檢查與 Docker build。
- [ ] 更新 README 的健康檢查、JSON 備份與 CI/CD 說明。
