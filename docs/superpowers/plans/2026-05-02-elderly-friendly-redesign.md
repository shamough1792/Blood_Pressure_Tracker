# 長者友善介面改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將血壓記錄系統改為 4 步驟引導輸入 + 卡片式記錄列表，讓長輩更容易操作

**Architecture:** 所有改動集中在前端 view 層（EJS + CSS），後端 server.js 僅微調自動填入邏輯。API 路由完全不動，資料庫不變。

**Tech Stack:** Express + EJS + MySQL2 + vanilla CSS（無框架）

---

### Task 1: server.js — 加入自動日期/時段邏輯

**Files:**
- Modify: `server.js:35-55`
- Modify: `server.js:104-125`

**Context:** 新表單不再讓使用者選日期和時段，改由前端自動偵測。但後端仍需處理：
1. 當前端沒有送 `time_of_day` 時，根據當前時間自動判斷 AM/PM
2. 當前端沒有送 `record_date` 時，自動填入今天日期
3. 保持向後相容（舊表單仍可運作）

- [ ] **Step 1: 修改 POST /add 路由的自動填入邏輯**

將 `server.js:35-55` 從：
```javascript
app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

    let recordedAt;

    // Set time for AM or PM
    if (time_of_day === 'PM') {
        recordedAt = new Date(`${record_date}T20:00:00`); // PM set to 8 PM
    } else {
        recordedAt = new Date(`${record_date}T08:00:00`); // AM set to 8 AM
    }
```
改為：
```javascript
app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

    // Auto-detect date and time if not provided (elderly-friendly mode)
    const now = new Date();
    const date = record_date || now.toISOString().split('T')[0];
    const hour = now.getHours();
    const isPM = time_of_day === 'PM' || (time_of_day !== 'AM' && hour >= 12);
    const recordedAt = isPM
        ? new Date(`${date}T20:00:00`)
        : new Date(`${date}T08:00:00`);
```
說明：當 `time_of_day` 未提供時（新表單情境），根據當前小時判斷；當有提供時（修改頁或舊表單），沿用既有邏輯。

- [ ] **Step 2: 修改 POST /update 路由同樣邏輯**

將 `server.js:104-125` 中相同的 `recordedAt` 計算區塊做同樣修改：
```javascript
app.post('/update/:id', (req, res) => {
    const recordId = req.params.id;
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

    // Auto-detect date and time if not provided
    const now = new Date();
    const date = record_date || now.toISOString().split('T')[0];
    const hour = now.getHours();
    const isPM = time_of_day === 'PM' || (time_of_day !== 'AM' && hour >= 12);
    const recordedAt = isPM
        ? new Date(`${date}T20:00:00`)
        : new Date(`${date}T08:00:00`);
```
（其餘程式碼不變）

- [ ] **Step 3: 啟動伺服器測試**

Run:
```bash
cd "c:\Users\shamough1792\Documents\GitHub\Blood_Pressure_Tracker"
node server.js
```
Expected: Server starts on port 3000 without errors.

- [ ] **Step 4: 提交**

```bash
git add server.js
git commit -m "feat: add auto date/time detection for elderly-friendly mode"
```

---

### Task 2: CSS 全面重寫 — 長者友善設計系統

**Files:**
- Modify: `public/styles.css`

**Context:** 完全取代原有 CSS，建立一套大字體、大觸控區域、高對比、卡片風格的設計系統。涵蓋所有頁面的共用樣式。

- [ ] **Step 1: 撰寫完整 CSS**

檔案 `public/styles.css` 完整內容：

```css
/* ========================================
   血壓記錄系統 - 長者友善設計系統
   ======================================== */

/* --- 全域設定 --- */
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: 'Segoe UI', 'Noto Sans TC', Arial, sans-serif;
    background-color: #f0f4f8;
    color: #1a1a2e;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.container {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    padding: 20px 16px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* --- 頂部導航 --- */
.top-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    margin-bottom: 16px;
}

.top-nav h1 {
    font-size: 26px;
    color: #1a1a2e;
    font-weight: 700;
}

.top-nav .nav-btn {
    background: none;
    border: none;
    font-size: 16px;
    color: #2d6a4f;
    cursor: pointer;
    padding: 10px 14px;
    font-weight: 600;
    border-radius: 8px;
    transition: background 0.2s;
}

.top-nav .nav-btn:hover {
    background: #e8f5e9;
}

/* --- 進度條 --- */
.progress-container {
    text-align: center;
    margin-bottom: 24px;
}

.progress-steps {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-bottom: 8px;
}

.progress-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #d0d7de;
    transition: background 0.3s;
}

.progress-dot.active {
    background: #2d6a4f;
}

.progress-label {
    font-size: 18px;
    color: #666;
}

/* --- 步驟內容 (輸入頁) --- */
.step {
    display: none;
    flex-direction: column;
    align-items: center;
    flex: 1;
    justify-content: center;
    padding: 20px 0;
}

.step.active {
    display: flex;
}

.step-title {
    font-size: 32px;
    font-weight: 700;
    color: #1a1a2e;
    margin-bottom: 32px;
    text-align: center;
}

.step-input {
    width: 100%;
    max-width: 280px;
    padding: 20px 24px;
    font-size: 36px;
    font-weight: 700;
    text-align: center;
    border: 3px solid #d0d7de;
    border-radius: 16px;
    outline: none;
    transition: border-color 0.3s;
    background: #fff;
}

.step-input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.15);
}

/* 隱藏 number input 的上下箭頭 */
.step-input::-webkit-outer-spin-button,
.step-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}
.step-input[type=number] {
    -moz-appearance: textfield;
}

/* --- 按鈕 --- */
.btn {
    width: 100%;
    max-width: 280px;
    padding: 18px 24px;
    font-size: 22px;
    font-weight: 700;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    transition: transform 0.1s, opacity 0.2s;
    text-align: center;
    text-decoration: none;
    display: inline-block;
}

.btn:active {
    transform: scale(0.97);
}

.btn-primary {
    background: #2d6a4f;
    color: #fff;
}

.btn-primary:hover {
    background: #1b4d3d;
}

.btn-secondary {
    background: #e8f5e9;
    color: #2d6a4f;
}

.btn-secondary:hover {
    background: #c8e6c9;
}

.btn-danger {
    background: #d32f2f;
    color: #fff;
}

.btn-danger:hover {
    background: #b71c1c;
}

.btn-export {
    background: #1565c0;
    color: #fff;
    padding: 12px 20px;
    font-size: 18px;
}

.btn-export:hover {
    background: #0d47a1;
}

.btn-back {
    background: #f5f5f5;
    color: #333;
    padding: 12px 20px;
    font-size: 18px;
}

.btn-back:hover {
    background: #e0e0e0;
}

.step-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 32px;
    width: 100%;
}

.step-actions .btn {
    max-width: 280px;
}

/* 步驟中的返回（左上） */
.back-link {
    align-self: flex-start;
    background: none;
    border: none;
    font-size: 18px;
    color: #666;
    cursor: pointer;
    padding: 8px 4px;
    margin-bottom: 8px;
}

.back-link:hover {
    color: #333;
}

/* --- 確認頁 --- */
.confirm-card {
    width: 100%;
    max-width: 320px;
    background: #fff;
    border-radius: 20px;
    padding: 28px 24px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    margin: 16px 0;
}

.confirm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 22px;
}

.confirm-row:last-child {
    border-bottom: none;
}

.confirm-label {
    color: #666;
}

.confirm-value {
    font-weight: 700;
    color: #1a1a2e;
}

/* --- 血壓狀態標籤 --- */
.bp-status {
    display: inline-block;
    padding: 8px 24px;
    border-radius: 30px;
    font-size: 24px;
    font-weight: 700;
    margin: 8px 0;
}

.bp-normal {
    background: #e8f5e9;
    color: #2e7d32;
}

.bp-elevated {
    background: #fff8e1;
    color: #f57f17;
}

.bp-high {
    background: #ffebee;
    color: #c62828;
}

/* --- 成功頁 --- */
.success-screen {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
}

.success-screen.active {
    display: flex;
}

.success-icon {
    font-size: 72px;
    margin-bottom: 16px;
}

.success-title {
    font-size: 32px;
    font-weight: 700;
    color: #2e7d32;
    margin-bottom: 8px;
}

.success-sub {
    font-size: 20px;
    color: #666;
    margin-bottom: 32px;
}

/* --- 卡片列表（記錄頁） --- */
.month-nav {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
}

.month-nav .month-label {
    font-size: 26px;
    font-weight: 700;
    color: #1a1a2e;
    min-width: 160px;
    text-align: center;
}

.month-nav .arrow-btn {
    background: #fff;
    border: 2px solid #d0d7de;
    border-radius: 50%;
    width: 52px;
    height: 52px;
    font-size: 26px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    color: #333;
}

.month-nav .arrow-btn:hover {
    background: #e8f5e9;
    border-color: #2d6a4f;
}

.record-card {
    background: #fff;
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    border-left: 6px solid #d0d7de;
}

.record-card.bp-normal-border {
    border-left-color: #4caf50;
}

.record-card.bp-elevated-border {
    border-left-color: #ffc107;
}

.record-card.bp-high-border {
    border-left-color: #f44336;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 18px;
    color: #666;
}

.card-body {
    display: flex;
    gap: 24px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.card-metric {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.card-metric .metric-value {
    font-size: 28px;
    font-weight: 700;
    color: #1a1a2e;
}

.card-metric .metric-label {
    font-size: 14px;
    color: #999;
    margin-top: 2px;
}

.card-actions {
    display: flex;
    gap: 10px;
    margin-top: 8px;
}

.card-actions .btn {
    padding: 10px 20px;
    font-size: 16px;
    max-width: none;
    width: auto;
    border-radius: 10px;
}

/* --- 無記錄提示 --- */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #999;
    font-size: 20px;
}

/* --- 表單頁（修改頁用） --- */
.form-page {
    width: 100%;
}

.form-page h1 {
    font-size: 26px;
    text-align: center;
    margin-bottom: 24px;
    color: #1a1a2e;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
}

.form-group input,
.form-group select {
    width: 100%;
    padding: 16px 18px;
    font-size: 22px;
    border: 2px solid #d0d7de;
    border-radius: 12px;
    outline: none;
    background: #fff;
    transition: border-color 0.3s;
}

.form-group input:focus,
.form-group select:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.15);
}

.form-group select {
    cursor: pointer;
    appearance: auto;
}

.form-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 28px;
}

/* --- 導航連結列 --- */
.nav-links {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e0e0e0;
}

/* --- 響應式 --- */
@media (max-width: 480px) {
    .container {
        padding: 12px;
    }

    .step-title {
        font-size: 28px;
    }

    .step-input {
        font-size: 32px;
        padding: 16px 20px;
    }

    .confirm-row {
        font-size: 18px;
    }

    .card-metric .metric-value {
        font-size: 24px;
    }

    .month-nav .month-label {
        font-size: 22px;
        min-width: 140px;
    }

    .top-nav h1 {
        font-size: 22px;
    }
}

@media (min-width: 768px) {
    .step-input {
        max-width: 320px;
    }

    .btn {
        max-width: 320px;
    }

    .record-card {
        padding: 24px;
    }
}
```

- [ ] **Step 2: 提交**

```bash
git add public/styles.css
git commit -m "feat: elderly-friendly CSS design system with large fonts and cards"
```

---

### Task 3: 首頁 — 4 步驟引導輸入

**Files:**
- Modify: `views/index.ejs`（完全重寫）

**Context:** 目前的 index.ejs 是單頁表單（5 欄位），改為 4 步驟引導流程。所有步驟在同一頁，用 JavaScript 控制顯示/隱藏。送出時 POST 到 `/add`。

- [ ] **Step 1: 撰寫新的 index.ejs**

完整內容：
```ejs
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>血壓記錄</title>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container">
        <!-- 頂部導航 -->
        <div class="top-nav">
            <h1>血壓記錄</h1>
            <a href="/records" class="nav-btn">記錄</a>
        </div>

        <!-- 進度條 -->
        <div class="progress-container">
            <div class="progress-steps">
                <span class="progress-dot active" id="dot-1"></span>
                <span class="progress-dot" id="dot-2"></span>
                <span class="progress-dot" id="dot-3"></span>
                <span class="progress-dot" id="dot-4"></span>
            </div>
            <div class="progress-label" id="stepLabel">步驟 1/4</div>
        </div>

        <form id="bpForm" action="/add" method="POST" style="flex:1;display:flex;flex-direction:column;">
            <!-- 隱藏欄位：自動填入 -->
            <input type="hidden" name="record_date" id="recordDate">
            <input type="hidden" name="time_of_day" id="timeOfDay">

            <!-- 步驟 1: 高壓 -->
            <div class="step active" id="step-1">
                <div class="step-title">高壓是多少？</div>
                <input type="number" class="step-input" id="highPressure" name="high_pressure"
                       placeholder="___" inputmode="numeric" min="50" max="250" autofocus>
                <div class="step-actions">
                    <button type="button" class="btn btn-primary" onclick="goStep(2)">下一步 →</button>
                </div>
            </div>

            <!-- 步驟 2: 低壓 -->
            <div class="step" id="step-2">
                <button type="button" class="back-link" onclick="goStep(1)">← 上一步</button>
                <div class="step-title">低壓是多少？</div>
                <input type="number" class="step-input" id="lowPressure" name="low_pressure"
                       placeholder="___" inputmode="numeric" min="30" max="150">
                <div class="step-actions">
                    <button type="button" class="btn btn-primary" onclick="goStep(3)">下一步 →</button>
                </div>
            </div>

            <!-- 步驟 3: 心跳 -->
            <div class="step" id="step-3">
                <button type="button" class="back-link" onclick="goStep(2)">← 上一步</button>
                <div class="step-title">心跳是多少？</div>
                <input type="number" class="step-input" id="heartbeat" name="heartbeat"
                       placeholder="___" inputmode="numeric" min="30" max="200">
                <div class="step-actions">
                    <button type="button" class="btn btn-primary" onclick="goStep(4)">下一步 →</button>
                </div>
            </div>

            <!-- 步驟 4: 確認 -->
            <div class="step" id="step-4">
                <button type="button" class="back-link" onclick="goStep(3)">← 上一步</button>
                <div class="step-title">請確認資料</div>

                <div class="confirm-card">
                    <div class="confirm-row">
                        <span class="confirm-label">高壓</span>
                        <span class="confirm-value" id="confirmHigh">--</span>
                    </div>
                    <div class="confirm-row">
                        <span class="confirm-label">低壓</span>
                        <span class="confirm-value" id="confirmLow">--</span>
                    </div>
                    <div class="confirm-row">
                        <span class="confirm-label">心跳</span>
                        <span class="confirm-value" id="confirmHeart">--</span>
                    </div>
                    <div class="confirm-row">
                        <span class="confirm-label">日期</span>
                        <span class="confirm-value" id="confirmDate">--</span>
                    </div>
                    <div class="confirm-row">
                        <span class="confirm-label">時段</span>
                        <span class="confirm-value" id="confirmPeriod">--</span>
                    </div>
                </div>

                <div id="bpStatus"></div>

                <div class="step-actions">
                    <button type="submit" class="btn btn-primary">✓ 確認儲存</button>
                </div>
            </div>
        </form>

        <!-- 成功畫面（隱藏，提交後才顯示） -->
        <div class="success-screen" id="successScreen">
            <div class="success-icon">✓</div>
            <div class="success-title">記錄已儲存！</div>
            <div class="success-sub">3 秒後可繼續輸入</div>
            <button class="btn btn-primary" onclick="resetForm()">再記一筆</button>
        </div>
    </div>

    <script>
        let currentStep = 1;
        let successTimer = null;

        // 自動填入日期和時段
        document.addEventListener('DOMContentLoaded', function() {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            document.getElementById('recordDate').value = today;

            const hour = now.getHours();
            const isPM = hour >= 12;
            document.getElementById('timeOfDay').value = isPM ? 'PM' : 'AM';
        });

        function goStep(n) {
            // 驗證當前步驟
            if (n > currentStep) {
                if (!validateStep(currentStep)) return;
            }

            // 隱藏所有步驟
            for (let i = 1; i <= 4; i++) {
                document.getElementById('step-' + i).classList.remove('active');
                document.getElementById('dot-' + i).classList.remove('active');
            }

            currentStep = n;

            // 顯示目標步驟
            document.getElementById('step-' + n).classList.add('active');
            document.getElementById('dot-' + n).classList.add('active');
            document.getElementById('stepLabel').textContent = '步驟 ' + n + '/4';

            // 如果是步驟 4，更新確認內容
            if (n === 4) {
                updateConfirm();
            }

            // 聚焦輸入框
            setTimeout(function() {
                const inputs = document.querySelectorAll('.step.active .step-input');
                if (inputs.length > 0) inputs[0].focus();
            }, 100);
        }

        function validateStep(step) {
            const inputMap = {
                1: { id: 'highPressure', name: '高壓', min: 50, max: 250 },
                2: { id: 'lowPressure', name: '低壓', min: 30, max: 150 },
                3: { id: 'heartbeat', name: '心跳', min: 30, max: 200 }
            };

            const field = inputMap[step];
            if (!field) return true;

            const el = document.getElementById(field.id);
            const val = parseInt(el.value);

            if (!val || isNaN(val)) {
                alert('請輸入' + field.name);
                el.focus();
                return false;
            }

            if (val < field.min || val > field.max) {
                alert(field.name + '範圍應在 ' + field.min + ' ~ ' + field.max + ' 之間');
                el.focus();
                return false;
            }

            return true;
        }

        function updateConfirm() {
            const high = document.getElementById('highPressure').value;
            const low = document.getElementById('lowPressure').value;
            const heart = document.getElementById('heartbeat').value;

            document.getElementById('confirmHigh').textContent = high;
            document.getElementById('confirmLow').textContent = low;
            document.getElementById('confirmHeart').textContent = heart;

            // 格式化日期
            const dateVal = document.getElementById('recordDate').value;
            if (dateVal) {
                const d = new Date(dateVal + 'T12:00:00');
                const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                document.getElementById('confirmDate').textContent =
                    d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 (' + weekdays[d.getDay()] + ')';
            }

            const isPM = document.getElementById('timeOfDay').value === 'PM';
            document.getElementById('confirmPeriod').textContent = isPM ? '下午' : '上午';

            // 血壓分級
            const hp = parseInt(high);
            const lp = parseInt(low);
            const statusEl = document.getElementById('bpStatus');

            let statusClass, statusText;
            if (hp < 120 && lp < 80) {
                statusClass = 'bp-normal';
                statusText = '🟢 血壓正常';
            } else if (hp < 130 && lp < 80) {
                statusClass = 'bp-elevated';
                statusText = '🟡 血壓偏高';
            } else if (hp < 140 || lp < 90) {
                statusClass = 'bp-elevated';
                statusText = '🟡 血壓偏高';
            } else {
                statusClass = 'bp-high';
                statusText = '🔴 高血壓';
            }

            statusEl.className = 'bp-status ' + statusClass;
            statusEl.textContent = statusText;
        }

        // 表單提交 - AJAX 避免頁面跳轉
        document.getElementById('bpForm').addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = new FormData(this);
            fetch(this.action, {
                method: 'POST',
                body: new URLSearchParams(formData)
            }).then(function(resp) {
                if (resp.ok) {
                    showSuccess();
                } else {
                    alert('儲存失敗，請重試');
                }
            }).catch(function() {
                alert('網路錯誤，請重試');
            });
        });

        function showSuccess() {
            document.getElementById('bpForm').style.display = 'none';
            document.querySelector('.progress-container').style.display = 'none';
            document.getElementById('successScreen').classList.add('active');

            // 3 秒自動重置
            successTimer = setTimeout(resetForm, 3000);
        }

        function resetForm() {
            if (successTimer) clearTimeout(successTimer);
            document.getElementById('bpForm').style.display = 'flex';
            document.querySelector('.progress-container').style.display = 'block';
            document.getElementById('successScreen').classList.remove('active');
            document.getElementById('bpForm').reset();

            // 重置到步驟 1
            currentStep = 0;
            goStep(1);
        }

        // 鍵盤 Enter 跳到下一步
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const activeStep = document.querySelector('.step.active');
                if (activeStep && activeStep.id !== 'step-4') {
                    e.preventDefault();
                    goStep(currentStep + 1);
                }
            }
        });
    </script>
</body>
</html>
```

- [ ] **Step 2: 啟動伺服器並測試首頁**

Run:
```bash
cd "c:\Users\shamough1792\Documents\GitHub\Blood_Pressure_Tracker"
node server.js
```
1. 開啟 http://localhost:3000
2. 檢查是否顯示步驟 1（高壓）
3. 輸入數字後點下一步，檢查是否跳到步驟 2
4. 檢查步驟 4 確認頁是否顯示正確的血壓分級
5. 提交後檢查成功畫面

- [ ] **Step 3: 提交**

```bash
git add views/index.ejs
git commit -m "feat: 4-step guided blood pressure input flow"
```

---

### Task 4: 記錄頁 — 卡片式列表

**Files:**
- Modify: `views/records.ejs`（完全重寫）

**Context:** 目前的 records.ejs 是表格 + 下拉選單。改為卡片列表 + 左右箭頭切換月份。

- [ ] **Step 1: 撰寫新的 records.ejs**

完整內容：
```ejs
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>血壓記錄</title>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container">
        <!-- 頂部導航 -->
        <div class="top-nav">
            <a href="/" class="nav-btn">← 返回</a>
            <h1>血壓記錄</h1>
            <a href="/export/excel" class="nav-btn" style="font-size:15px;">📥 匯出</a>
        </div>

        <%
            // 取得所有月份並排序
            var months = Object.keys(groupedRecords).sort();
            var currentIdx = months.indexOf(selectedMonth);
            if (currentIdx === -1) currentIdx = months.length - 1;
            var currentMonth = months[currentIdx];
            var prevMonth = currentIdx > 0 ? months[currentIdx - 1] : null;
            var nextMonth = currentIdx < months.length - 1 ? months[currentIdx + 1] : null;

            // 格式化月份顯示
            function formatMonth(ym) {
                return ym.replace('-', '年') + '月';
            }
        %>

        <!-- 月份導航 -->
        <div class="month-nav">
            <% if (prevMonth) { %>
                <a href="/records?yearMonth=<%= prevMonth %>" class="arrow-btn">〈</a>
            <% } else { %>
                <span class="arrow-btn" style="visibility:hidden;">〈</span>
            <% } %>
            <span class="month-label"><%= formatMonth(currentMonth) %></span>
            <% if (nextMonth) { %>
                <a href="/records?yearMonth=<%= nextMonth %>" class="arrow-btn">〉</a>
            <% } else { %>
                <span class="arrow-btn" style="visibility:hidden;">〉</span>
            <% } %>
        </div>

        <!-- 記錄卡片列表 -->
        <% if (groupedRecords[currentMonth] && groupedRecords[currentMonth].length) { %>
            <% groupedRecords[currentMonth].forEach(function(record) {
                var hp = parseInt(record.high_pressure);
                var lp = parseInt(record.low_pressure);
                var borderClass = '';
                if (hp >= 140 || lp >= 90) {
                    borderClass = 'bp-high-border';
                } else if (hp >= 120 || lp >= 80) {
                    borderClass = 'bp-elevated-border';
                } else {
                    borderClass = 'bp-normal-border';
                }
            %>
                <div class="record-card <%= borderClass %>">
                    <div class="card-header">
                        <span><%= record.formattedDate %></span>
                    </div>
                    <div class="card-body">
                        <div class="card-metric">
                            <span class="metric-value"><%= record.high_pressure %></span>
                            <span class="metric-label">高壓</span>
                        </div>
                        <div class="card-metric">
                            <span class="metric-value"><%= record.low_pressure %></span>
                            <span class="metric-label">低壓</span>
                        </div>
                        <div class="card-metric">
                            <span class="metric-value"><%= record.heartbeat %></span>
                            <span class="metric-label">心跳</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <a href="/modify/<%= record.id %>" class="btn btn-secondary">修改</a>
                        <form action="/delete/<%= record.id %>" method="POST" style="display:inline;"
                              onsubmit="return confirm('確定要刪除這條記錄嗎？');">
                            <button type="submit" class="btn btn-danger">刪除</button>
                        </form>
                    </div>
                </div>
            <% }); %>
        <% } else { %>
            <div class="empty-state">
                沒有記錄
            </div>
        <% } %>
    </div>
</body>
</html>
```

- [ ] **Step 2: 啟動伺服器並測試記錄頁**

Run:
```bash
cd "c:\Users\shamough1792\Documents\GitHub\Blood_Pressure_Tracker"
node server.js
```
1. 開啟 http://localhost:3000/records
2. 檢查是否顯示卡片列表
3. 檢查月份左右箭頭是否正常切換
4. 檢查修改/刪除按鈕
5. 檢查匯出按鈕

- [ ] **Step 3: 提交**

```bash
git add views/records.ejs
git commit -m "feat: card-based record list with month navigation"
```

---

### Task 5: 修改頁 — 大字版表單

**Files:**
- Modify: `views/modify.ejs`

**Context:** 將修改頁改為大字版。功能不變，但所有字體和輸入框放大。

- [ ] **Step 1: 撰寫新的 modify.ejs**

完整內容：
```ejs
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>修改血壓記錄</title>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container">
        <div class="top-nav">
            <a href="/records" class="nav-btn">← 返回記錄</a>
            <h1>修改記錄</h1>
            <span style="width:60px;"></span>
        </div>

        <div class="form-page">
            <form action="/update/<%= record.id %>" method="POST">
                <div class="form-group">
                    <label for="high_pressure">高壓</label>
                    <input type="number" id="high_pressure" name="high_pressure"
                           value="<%= record.high_pressure %>" required min="50" max="250">
                </div>

                <div class="form-group">
                    <label for="low_pressure">低壓</label>
                    <input type="number" id="low_pressure" name="low_pressure"
                           value="<%= record.low_pressure %>" required min="30" max="150">
                </div>

                <div class="form-group">
                    <label for="heartbeat">心跳</label>
                    <input type="number" id="heartbeat" name="heartbeat"
                           value="<%= record.heartbeat %>" required min="30" max="200">
                </div>

                <div class="form-group">
                    <label for="time_of_day">時段</label>
                    <select id="time_of_day" name="time_of_day" required>
                        <option value="AM" <%= new Date(record.recorded_at).getHours() < 12 ? 'selected' : '' %>>上午</option>
                        <option value="PM" <%= new Date(record.recorded_at).getHours() >= 12 ? 'selected' : '' %>>下午</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="record_date">日期</label>
                    <input type="date" id="record_date" name="record_date"
                           value="<%= new Date(record.recorded_at).toISOString().split('T')[0] %>" required>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">✓ 儲存修改</button>
                    <a href="/records" class="btn btn-back">取消</a>
                </div>
            </form>
        </div>
    </div>
</body>
</html>
```

- [ ] **Step 2: 啟動伺服器並測試修改頁**

Run:
```bash
cd "c:\Users\shamough1792\Documents\GitHub\Blood_Pressure_Tracker"
node server.js
```
1. 從記錄頁點選一筆記錄的「修改」
2. 檢查表單是否正確載入原有資料
3. 修改一個數值並儲存
4. 回到記錄頁確認修改已生效

- [ ] **Step 3: 提交**

```bash
git add views/modify.ejs
git commit -m "feat: large-font modify form"
```

---

### Task 6: 完整驗收

**Files:**
- （無檔案修改）

- [ ] **Step 1: 跑一遍完整流程**

Run:
```bash
cd "c:\Users\shamough1792\Documents\GitHub\Blood_Pressure_Tracker"
node server.js
```

驗證下列項目：
1. **首頁 4 步驟引導：** 高壓 → 低壓 → 心跳 → 確認 → 成功
2. **自動日期時段：** 確認頁顯示正確的今天日期和上午/下午
3. **血壓分級：** 測試正常/偏高/高血壓三種顏色
4. **輸入驗證：** 輸入超出範圍的數字應跳出提示
5. **鍵盤 Enter：** 按下 Enter 跳到下一步
6. **成功畫面：** 提交後顯示成功，3 秒後自動重置
7. **記錄頁卡片：** 卡片顯示正確，月份切換正常
8. **修改頁：** 放大表單可正常修改
9. **刪除：** 確認對話框後可刪除
10. **匯出 Excel：** 按鈕可正常下載
11. **手機版面：** 縮小瀏覽器視窗，確認響應式正常

- [ ] **Step 2: 如有問題，修復**

如果發現任何問題，修正後提交。

- [ ] **Step 3: 最終提交**

```bash
git add -A
git commit -m "feat: complete elderly-friendly redesign"
```
