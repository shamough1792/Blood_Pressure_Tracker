# 全站介面初步優化實作計畫

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 逐任務實作此計畫。步驟使用複選框（`- [ ]`）語法來追蹤進度。

**目標：** 在不改變既有功能、URL、資料庫或 API 的前提下，改善首頁手機/PC 的操作提示與版面層次，並提高全站低對比文字的可讀性。

**架構：** 以現有 `views/portal.ejs` 的首頁結構與 `public/styles.css` 共用樣式為基礎，透過響應式 CSS 在手機維持單欄、在 PC 使用雙區塊布局。首頁只呈現目前後端已有的使用者資料，不新增虛構摘要數據；共用文字顏色集中調整至深黑藍、`#444`～`#555` 與 `#666` 三層。

**技術棧：** EJS、原生 CSS、Node.js 內建 `node:test`/`node:assert/strict`（靜態 UI 契約測試）、Git。

**規格：** `docs/superpowers/specs/2026-08-30-interface-optimization-design.md`

---

## 檔案結構與責任

- 建立：`test/interfaceOptimization.test.js` — 驗證首頁必要文案、日期文案移除、姓名對比度、響應式 class/規則與共用文字色彩契約。
- 修改：`views/portal.ejs` — 首頁標題、使用者選擇區、使用者卡片輔助文案、手機提示與 PC 響應式布局。
- 修改：`public/styles.css` — 全站一般文字/輔助文字的對比度，以及首頁 PC/手機布局需要的共用規則。
- 修改：`views/admin.ejs` — 將管理頁兩處說明文字及匯入進度文字由 `#666` 提高至 `#555`；不改動功能。
- 修改：`views/admin-login.ejs` — 若有低對比文字，維持登入錯誤訊息的既有高對比色；本計畫不新增不必要變更。
- 修改：`views/index.ejs`、`views/records.ejs`、`views/stats.ejs`、`views/modify.ejs` — 只在測試確認存在低對比一般/輔助文字時，精準套用共用 CSS，不重構模板。

> PC 首頁摘要（今日記錄/本週平均/最近狀態）本次**不加入**：現有首頁後端只傳送 `users`，沒有摘要資料；為避免顯示虛構數據，先不新增資料庫查詢或 API。

---

## 任務 1：建立介面優化失敗測試

**檔案：**
- 建立：`test/interfaceOptimization.test.js`

- [ ] **步驟 1：建立 Node 內建測試，先定義 UI 契約**

在 `test/interfaceOptimization.test.js` 寫入：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const portal = () => fs.readFileSync(path.join(root, 'views/portal.ejs'), 'utf8');
const styles = () => fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

test('首頁有清楚的使用者選擇與開始提示', () => {
    const html = portal();
    assert.match(html, /選擇使用者/); // 明確文案契約
    assert.match(html, /點擊開始/);
    assert.match(html, /每日早晚各量一次，記錄更完整/);
});

test('首頁不顯示今天日期文案', () => {
    assert.doesNotMatch(portal(), /今天\s*[^<\n]*月\s*[^<\n]*日/);
});

test('使用者姓名使用深黑藍', () => {
    assert.match(portal(), /\.user-name\{[^}]*color:#1a1a2e/);
    assert.match(styles(), /\.user-name\s*\{[^}]*color:\s*#1a1a2e/);
});

test('首頁具有手機與 PC 的響應式布局契約', () => {
    const html = portal();
    assert.match(html, /portal-main/);
    assert.match(html, /portal-welcome/);
    assert.match(html, /portal-users/);
    assert.match(styles(), /@media\s*\(min-width:\s*768px\)[\s\S]*portal-main/);
});

test('共用輔助文字目標色彩為 #666', () => {
    const css = styles();
    assert.match(css, /\.empty-state\s*\{[^}]*color:\s*#666/);
    assert.match(css, /\.stat-total\s*\{[^}]*color:\s*#666/);
});
```

> 實作者注意：`/>選擇使用者</u>` 是刻意要求模板輸出包含該文案；若採用不同但等價的 HTML 結構，必須同步把測試斷言改成更穩健、仍能驗證實際行為的選擇器/字串，而不是刪除需求。

- [ ] **步驟 2：執行測試確認目前失敗**

執行：`node --test test/interfaceOptimization.test.js`

預期：FAIL，因首頁目前沒有「點擊開始」及「每日早晚各量一次，記錄更完整」文案，且沒有 `portal-main`/`portal-welcome`/`portal-users` 布局契約。

- [ ] **步驟 3：Commit 失敗測試**

```bash
git add test/interfaceOptimization.test.js
git commit -m "test: 建立介面優化契約測試"
```

---

## 任務 2：實作首頁手機與 PC 初步優化

**檔案：**
- 修改：`views/portal.ejs`
- 修改：`public/styles.css`
- 測試：`test/interfaceOptimization.test.js`

- [ ] **步驟 1：更新首頁結構與文案**

將 `views/portal.ejs` 的首頁內容調整為以下結構；保留原有 EJS 使用者迴圈、連結 URL、`localStorage.setItem('bp_user', ...)`、管理連結與 service worker：

```html
<body>
    <div class="portal-wrap">
        <header class="portal-header">
            <h1><svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-5px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> 血壓記錄管理系統</h1>
            <p>選擇使用者開始記錄</p>
        </header>

        <main class="portal-main">
            <section class="portal-welcome" aria-labelledby="portal-welcome-title">
                <p class="portal-eyebrow">血壓記錄</p>
                <h2 id="portal-welcome-title">開始記錄血壓</h2>
                <p>選擇家人，開始今天的測量</p>
                <span class="portal-step-hint">每次只需 4 個步驟</span>
            </section>

            <section class="portal-users" aria-labelledby="portal-users-title">
                <h2 id="portal-users-title">選擇使用者</h2>
                <div class="user-grid">
                    <% if (users && users.length > 0) { %>
                    <% users.forEach(function(u) { %>
                    <a href="/bp/<%= u.id %>?name=<%= encodeURIComponent(u.name) %>" class="user-card" onclick="localStorage.setItem('bp_user', '<%= u.id %>')">
                        <div class="user-avatar" style="background:<%= u.color %>">
                            <%= u.name.charAt(0) %>
                        </div>
                        <span class="user-name"><%= u.name %></span>
                        <span class="user-card-hint">點擊開始</span>
                    </a>
                    <% }); %>
                    <% } else { %>
                    <p class="empty-state">尚未建立使用者，請點右下角管理按鈕新增</p>
                    <% } %>
                </div>
            </section>
        </main>

        <aside class="portal-tip" role="note">
            <span class="portal-tip-icon" aria-hidden="true">ⓘ</span>
            <span>每日早晚各量一次，記錄更完整</span>
        </aside>
    </div>

    <a href="/admin" class="admin-link" title="管理使用者" aria-label="管理使用者"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 1-1 1.51V21a2 2 0 0 1-2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></a>

    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
    </script>
</body>
```

> SVG 管理圖示沿用現有檔案即可；實作時不要把完整既有 SVG 路徑改成簡化或錯誤路徑。核心要求是新增 `portal-main`、`portal-welcome`、`portal-users`、`portal-tip` 結構，保留既有使用者 URL/迴圈。

- [ ] **步驟 2：加入響應式首頁樣式**

在 `views/portal.ejs` 的內嵌 `<style>` 中，替換只屬於 portal 的舊規則，加入以下規則（共用 `.user-name` 顏色同步在 `public/styles.css`）：

```css
body{background:linear-gradient(135deg,#f0f4f8 0,#e8f5e9 100%);min-height:100vh}
.portal-wrap{width:100%;max-width:1120px;margin:0 auto;padding:20px 16px;min-height:100vh;display:flex;flex-direction:column}
.portal-header{background:linear-gradient(135deg,#2d6a4f,#40916c);color:#fff;border-radius:24px;padding:28px;text-align:center;margin-bottom:24px;box-shadow:0 8px 24px rgba(45,106,79,0.25)}
.portal-header h1{font-size:30px;font-weight:700;margin-bottom:6px;color:#fff}
.portal-header p{font-size:17px;opacity:.9;margin:0}
.portal-main{display:flex;flex-direction:column;gap:18px;flex:1}
.portal-welcome{background:linear-gradient(135deg,#2d6a4f,#40916c);color:#fff;border-radius:20px;padding:24px;box-shadow:0 6px 18px rgba(45,106,79,.22)}
.portal-welcome h2{font-size:28px;margin:4px 0 8px;color:#fff}
.portal-welcome p{font-size:16px;margin:0;color:#fff;opacity:.92}
.portal-eyebrow{font-size:14px!important;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.portal-step-hint{display:block;margin-top:18px;font-size:14px;color:#fff;opacity:.85}
.portal-users{background:#fff;border-radius:20px;padding:20px;box-shadow:0 3px 12px rgba(0,0,0,.06)}
.portal-users h2{font-size:22px;color:#1a1a2e;margin-bottom:14px}
.portal-users .user-grid{padding:0;display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:14px}
.user-card{width:130px;padding:16px 12px 13px;border:2px solid transparent}
.user-card-hint{font-size:13px;color:#2d6a4f;font-weight:600;margin-top:5px}
.portal-tip{display:flex;align-items:center;gap:10px;background:#fff;border-radius:14px;padding:13px 14px;margin-top:18px;color:#555;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.portal-tip-icon{font-size:22px;color:#2d6a4f;line-height:1}
@media (min-width:768px){
    .portal-main{display:grid;grid-template-columns:minmax(300px,1fr) minmax(420px,1.2fr);align-items:stretch;gap:20px}
    .portal-welcome{display:flex;flex-direction:column;justify-content:center;min-height:300px;padding:32px}
    .portal-users{padding:24px}
    .portal-users .user-grid{justify-content:flex-start;gap:16px}
    .portal-tip{max-width:540px;align-self:center;width:100%}
}
@media(max-width:480px){
    .portal-wrap{padding:12px}
    .portal-header{padding:20px 16px;margin-bottom:18px}
    .portal-header h1{font-size:24px}
    .portal-header p{font-size:15px}
    .portal-welcome{padding:20px}
    .portal-welcome h2{font-size:24px}
    .portal-users{padding:16px}
    .portal-users h2{font-size:20px}
    .portal-users .user-grid{gap:10px}
    .user-card{width:calc(50% - 5px);max-width:150px;padding:14px 8px 12px}
    .user-name{font-size:20px;color:#1a1a2e}
    .portal-tip{font-size:14px;margin-top:14px}
}
```

- [ ] **步驟 3：執行測試確認首頁契約通過**

執行：`node --test test/interfaceOptimization.test.js`

預期：5/5 PASS。

- [ ] **步驟 4：Commit 首頁優化**

```bash
git add views/portal.ejs public/styles.css test/interfaceOptimization.test.js
git commit -m "feat(ui): 優化首頁手機與 PC 操作體驗"
```

---

## 任務 3：提高全站一般與輔助文字對比度

**檔案：**
- 修改：`public/styles.css`
- 修改：`views/admin.ejs`
- 測試：`test/interfaceOptimization.test.js`

- [ ] **步驟 1：調整共用 CSS 低對比文字**

在 `public/styles.css` 精準調整以下規則：

```css
/* 一般文字與欄位標籤：由 #666 提高至 #555 */
.progress-label { color: #555; }
.back-link { color: #555; }
.confirm-label { color: #555; }
.day-values { color: #444; }
.day-detail h3 { color: #1a1a2e; }
.card-header { color: #555; }

/* 輔助文字：由 #999 提高至 #666 */
.cal-wd { color: #666; }
.card-metric .metric-label { color: #666; }
.empty-state { color: #666; }
.stat-total { color: #666; }
.chart-close-hint { color: #666; }
```

> 只有實際存在的規則才調整；`chart-close-hint` 若專案不存在，不要新增無使用者的死 CSS。`.period-dot` 未選取狀態可保留 `#999`，因其代表「該時段沒有記錄」的 disabled 語意，不是一般說明文字。

在 `views/admin.ejs` 將三處說明/進度行內樣式的 `color:#666` 改為 `color:#555`：

```html
<p style="font-size:16px;color:#555;margin-bottom:12px;">下載完整資料庫備份（使用者 + 所有血壓記錄），可匯入任何 SQL 資料庫</p>
<p style="font-size:16px;color:#555;margin-bottom:12px;">上傳從其他 Docker container 匯出的 SQL 檔，將記錄匯入指定使用者</p>
<p style="font-size:16px;color:#555;margin-top:6px;">正在匯入中，請稍候...</p>
```

- [ ] **步驟 2：補上文字對比度契約測試**

在 `test/interfaceOptimization.test.js` 加入：

```js
const admin = () => fs.readFileSync(path.join(root, 'views/admin.ejs'), 'utf8');

test('管理頁說明文字使用較高對比色', () => {
    const html = admin();
    assert.equal((html.match(/color:#555/g) || []).length, 3);
});
```

- [ ] **步驟 3：執行測試與全套測試**

執行：

```bash
node --test test/interfaceOptimization.test.js
npm test
```

預期：介面契約測試 6/6 PASS；完整測試套件 PASS。若 `npm test` 因其他 worktree 的孤立測試被 Node 自動掃描而失敗，改用 `node --test test/*.test.js` 或逐一指定專案測試檔，並在報告中說明掃描範圍。

- [ ] **步驟 4：Commit 文字對比度調整**

```bash
git add public/styles.css views/admin.ejs test/interfaceOptimization.test.js
git commit -m "feat(ui): 提高全站文字對比度"
```

---

## 任務 4：整體驗收

**檔案：**
- 驗證：`views/portal.ejs`、`public/styles.css`、`views/admin.ejs`、`test/interfaceOptimization.test.js`

- [ ] **步驟 1：編譯所有 EJS 視圖**

執行：

```bash
node -e "const fs=require('fs'),ejs=require('ejs'); for(const f of fs.readdirSync('views').filter(f=>f.endsWith('.ejs'))){ejs.compile(fs.readFileSync('views/'+f,'utf8'));} console.log('EJS_COMPILE_OK')"
```

預期：輸出 `EJS_COMPILE_OK`。

- [ ] **步驟 2：執行內嵌 JavaScript 語法檢查**

執行：

```bash
node -e "const fs=require('fs'); for(const f of fs.readdirSync('views').filter(f=>f.endsWith('.ejs'))){const h=fs.readFileSync('views/'+f,'utf8'); for(const s of h.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)){new Function(s[1]);}} console.log('INLINE_JS_OK')"
```

預期：輸出 `INLINE_JS_OK`。

- [ ] **步驟 3：執行介面與完整測試**

執行：

```bash
node --test test/interfaceOptimization.test.js
node --test test/adminAuth.test.js
```

預期：介面測試 6/6 PASS；認證測試 6/6 PASS。

- [ ] **步驟 4：檢查差異與安全範圍**

執行：

```bash
git diff --check
git status --short
git diff -- routes/ db.js Schema.sql
```

預期：無 whitespace error；工作樹只含預期的介面檔案/測試；`routes/`、`db.js`、`Schema.sql` 沒有 diff。

- [ ] **步驟 5：手動驗收手機與 PC**

使用現有 `npm start`（提供必要 `.env` 與 DB 連線）或瀏覽器檢查：

1. 首頁上方顯示「血壓記錄管理系統」，不顯示「今天 X 月 XX 日」。
2. 手機寬度下，使用者卡片兩欄排列、姓名使用深黑藍、顯示「點擊開始」，點擊仍進入原有 `/bp/:userId`。
3. PC 寬度下，左側顯示開始記錄區，右側顯示使用者選擇區；不新增虛構統計數據。
4. 首頁提示顯示「每日早晚各量一次，記錄更完整」。
5. 管理入口仍連到 `/admin`；空使用者時提示仍可找到管理入口。
6. 記錄、統計、輸入、修改及管理頁的輔助文字較清楚；正常/高血壓/低血壓色彩仍保留。

- [ ] **步驟 6：Commit 驗收結果（如有文件異動則提交）**

若驗收只產生測試輸出，不需 commit；若測試需要調整，將調整與對應測試一起提交：

```bash
git diff --check
git status --short
git commit -m "test(ui): 完成介面優化驗收"  # 只有確有驗收檔案變更時執行
```
