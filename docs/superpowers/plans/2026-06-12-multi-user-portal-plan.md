# 多用戶 Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將單一用戶的血壓記錄系統改為多用戶 Portal，支援使用者選擇、管理後台、SQL 匯入

**Architecture:** 新增 `users` 資料表，`records` 加 `user_id` 外鍵。新增使用者選擇頁作為入口，管理後台負責使用者 CRUD + SQL 匯入。既有頁面加上 user_id 過濾。

**Tech Stack:** Express + EJS + MySQL2 + vanilla CSS

---

### Task 1: 資料庫 Migration

**Files:**
- Create: `mariadb/migration-001-add-users.sql`

**Context:** 需要建立 users 表，並在 records 表加上 user_id 欄位，才能支援多用戶。

- [ ] **Step 1: 建立 migration SQL 檔**

```sql
-- 建立 users 表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#4CAF50',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 新增預設使用者
INSERT INTO users (name, color) VALUES ('使用者', '#4CAF50');

-- records 表加入 user_id
ALTER TABLE records ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE records ADD FOREIGN KEY (user_id) REFERENCES users(id);
```

- [ ] **Step 2: 提交**

```bash
git add mariadb/migration-001-add-users.sql
git commit -m "feat: add users table and user_id to records"
```

---

### Task 2: server.js — 新增使用者 API 路由 + 用戶選擇入口

**Files:**
- Modify: `server.js`（新增路由，不改既有路由）

**Context:** 需要新增：
1. GET `/` 改為使用者選擇頁（portal.ejs）
2. GET `/bp` 讓選擇後的使用者進入血壓記錄頁（原 index.ejs，加上 user_id 參數）
3. GET `/api/users` 取得使用者列表
4. POST `/api/users` 新增使用者
5. DELETE `/api/users/:id` 刪除使用者（連同記錄）
6. POST `/api/import-sql` 上傳 SQL 檔匯入

- [ ] **Step 1: 在 server.js 新增以下路由（在既有 route 之前）**

在 `app.get('/', ...)` 之前插入：

```javascript
// ===== 多用戶 Portal =====

// 使用者選擇頁（入口）
app.get('/', (req, res) => {
    const query = 'SELECT * FROM users ORDER BY id ASC';
    db.query(query, (err, users) => {
        if (err) throw err;
        res.render('portal', { users, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });
});

// 使用者管理頁
app.get('/admin', (req, res) => {
    const query = 'SELECT * FROM users ORDER BY id ASC';
    db.query(query, (err, users) => {
        if (err) throw err;
        res.render('admin', { users, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });
});

// API: 取得使用者列表
app.get('/api/users', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// API: 新增使用者
app.post('/api/users', (req, res) => {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: '請輸入名稱' });
    db.query('INSERT INTO users (name, color) VALUES (?, ?)', [name, color || '#4CAF50'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, name, color: color || '#4CAF50' });
    });
});

// API: 刪除使用者（連同記錄）
app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    db.query('DELETE FROM records WHERE user_id = ?', [userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// API: 編輯使用者
app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, color } = req.body;
    db.query('UPDATE users SET name = ?, color = ? WHERE id = ?', [name, color, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// API: 匯入 SQL
app.post('/api/import-sql', (req, res) => {
    const { user_id } = req.body;
    if (!req.files || !req.files.sqlFile) {
        return res.status(400).send('請上傳 SQL 檔案');
    }
    const sqlContent = req.files.sqlFile.data.toString('utf8');
    
    // 解析 INSERT INTO records 語句
    const insertRegex = /INSERT\s+INTO\s+records\s*(?:\([^)]*\))?\s*VALUES\s*(.*?);/gis;
    let match;
    let imported = 0;
    let errors = 0;
    
    db.beginTransaction(err => {
        if (err) return res.status(500).send('資料庫錯誤');
        
        while ((match = insertRegex.exec(sqlContent)) !== null) {
            const valuesBlock = match[1];
            // 解析每一組 values
            const valueRegex = /\(([^)]+)\)/g;
            let vMatch;
            while ((vMatch = valueRegex.exec(valuesBlock)) !== null) {
                const parts = vMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
                // parts: [id, high, low, heart, timestamp] 或 [high, low, heart, timestamp]
                let high, low, heart, timestamp;
                if (parts.length >= 5) {
                    // 有 id 欄位，跳過 id
                    high = parts[parts.length - 4];
                    low = parts[parts.length - 3];
                    heart = parts[parts.length - 2];
                    timestamp = parts[parts.length - 1];
                } else if (parts.length >= 4) {
                    high = parts[parts.length - 4];
                    low = parts[parts.length - 3];
                    heart = parts[parts.length - 2];
                    timestamp = parts[parts.length - 1];
                } else continue;
                
                const ts = timestamp === 'current_timestamp()' || timestamp === 'CURRENT_TIMESTAMP' 
                    ? new Date() : new Date(timestamp);
                
                db.query(
                    'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)',
                    [parseInt(high), parseInt(low), parseInt(heart), ts, parseInt(user_id)],
                    (err) => {
                        if (err) errors++;
                        else imported++;
                    }
                );
            }
        }
        
        db.commit(err => {
            if (err) {
                db.rollback(() => {});
                return res.status(500).send('匯入失敗');
            }
            res.send(`匯入完成：成功 ${imported} 筆，失敗 ${errors} 筆`);
        });
    });
});
```

需要安裝 `express-fileupload` 套件來處理檔案上傳：
```bash
npm install express-fileupload
```

在 server.js 頂部加入：
```javascript
const fileUpload = require('express-fileupload');
app.use(fileUpload());
```

- [ ] **Step 2: 將既有 GET `/` 改為血壓記錄頁（加上 user_id 參數）**

將原來的 GET `/` 改為 GET `/bp/:userId`：
```javascript
// 血壓記錄頁（需指定 user_id）
app.get('/bp/:userId', (req, res) => {
    res.render('index', { 
        successMessage: null, 
        titleSuffix: process.env.TITLE_SUFFIX || '',
        userId: req.params.userId
    });
});
```

POST `/add` 也需要接收 user_id：
```javascript
const { high_pressure, low_pressure, heartbeat, record_date, time_of_day, user_id } = req.body;
```
並在 INSERT 時加入 user_id：
```javascript
const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)';
db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, user_id || 1], ...);
```

- [ ] **Step 3: 既有查詢加上 user_id 過濾**

GET `/records` 改為接受 `?userId=` 參數：
```javascript
app.get('/records', (req, res) => {
    const userId = req.query.userId || 1;
    db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at DESC', [userId], ...);
});
```

GET `/modify/:id`、POST `/update/:id`、POST `/delete/:id` 同樣加上 `WHERE user_id = ?`。

GET `/export/excel` 也加上 `WHERE user_id = ?`。

- [ ] **Step 4: 提交**

```bash
git add server.js package.json
git commit -m "feat: multi-user routes and API"
```

---

### Task 3: portal.ejs — 使用者選擇頁

**Files:**
- Create: `views/portal.ejs`

**Context:** 作為網站首頁，顯示所有使用者的大頭貼，點選後進入各自的記錄頁。

- [ ] **Step 1: 建立 views/portal.ejs**

```ejs
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>血壓記錄<%= typeof titleSuffix !== 'undefined' && titleSuffix ? ' (' + titleSuffix + ')' : '' %></title>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#2d6a4f">
    <link rel="stylesheet" href="/styles.css">
    <style>
        .user-grid{display:flex;flex-wrap:wrap;gap:24px;justify-content:center;padding:20px 0;flex:1;align-content:center}
        .user-card{display:flex;flex-direction:column;align-items:center;text-decoration:none;width:120px;padding:16px;border-radius:20px;transition:background 0.2s;cursor:pointer}
        .user-card:hover{background:#e8f5e9}
        .user-avatar{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;color:#fff;margin-bottom:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15)}
        .user-name{font-size:22px;font-weight:700;color:#1a1a2e}
        .admin-link{position:fixed;bottom:20px;right:20px;width:52px;height:52px;border-radius:50%;background:#2d6a4f;color:#fff;border:none;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
        @media(max-width:480px){.user-card{width:100px;padding:12px}.user-avatar{width:64px;height:64px;font-size:28px}}
    </style>
</head>
<body>
    <div class="container" style="justify-content:center;">
        <h1 style="text-align:center;font-size:32px;margin-bottom:8px;">血壓記錄</h1>
        <p style="text-align:center;color:#666;font-size:18px;margin-bottom:16px;">選擇使用者</p>
        
        <div class="user-grid">
            <% users.forEach(function(u) { %>
                <a href="/bp/<%= u.id %>" class="user-card" onclick="localStorage.setItem('bp_user', '<%= u.id %>')">
                    <div class="user-avatar" style="background:<%= u.color %>">
                        <%= u.name.charAt(0) %>
                    </div>
                    <span class="user-name"><%= u.name %></span>
                </a>
            <% }); %>
        </div>
    </div>
    
    <a href="/admin" class="admin-link">⚙</a>
    
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
    </script>
</body>
</html>
```

- [ ] **Step 2: 提交**

```bash
git add views/portal.ejs
git commit -m "feat: user selection portal page"
```

---

### Task 4: admin.ejs — 管理後台

**Files:**
- Create: `views/admin.ejs`

**Context:** 管理使用者（新增、編輯、刪除）和 SQL 匯入。採用現有設計風格，但寬度可達 720px 適合電腦操作。

- [ ] **Step 1: 建立 views/admin.ejs**

```ejs
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>管理使用者<%= typeof titleSuffix !== 'undefined' && titleSuffix ? ' (' + titleSuffix + ')' : '' %></title>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#2d6a4f">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="admin-container">
        <div class="top-nav">
            <a href="/" class="nav-btn">← 返回</a>
            <h1>管理使用者</h1>
            <span style="width:60px;"></span>
        </div>

        <!-- 使用者列表 -->
        <div class="admin-card">
            <h2>使用者列表</h2>
            <% users.forEach(function(u) { %>
            <div class="user-row">
                <div class="mini-avatar" style="background:<%= u.color %>"><%= u.name.charAt(0) %></div>
                <span class="user-row-name"><%= u.name %></span>
                <button class="btn-sm btn-sm-edit" onclick='editUser(<%= u.id %>, "<%= u.name %>", "<%= u.color %>")'>編輯</button>
                <button class="btn-sm btn-sm-delete" onclick="deleteUser(<%= u.id %>, '<%= u.name %>')">刪除</button>
            </div>
            <% }); %>
        </div>

        <!-- 新增使用者 -->
        <div class="admin-card">
            <h2>新增使用者</h2>
            <form id="addForm" onsubmit="return addUser(event)">
                <div class="form-inline">
                    <div class="form-group">
                        <label>姓名</label>
                        <input type="text" id="newName" required style="width:100%;padding:14px 16px;font-size:20px;border:2px solid #d0d7de;border-radius:12px">
                    </div>
                    <div class="form-group">
                        <label>顏色</label>
                        <input type="color" id="newColor" value="#4CAF50" style="height:52px;width:80px;padding:4px;border:2px solid #d0d7de;border-radius:12px;cursor:pointer">
                    </div>
                    <button type="submit" class="btn btn-primary" style="padding:14px 24px;font-size:18px;max-width:none;">新增</button>
                </div>
            </form>
        </div>

        <!-- SQL 匯入 -->
        <div class="admin-card">
            <h2>匯入 SQL</h2>
            <div class="import-section">
                <p style="font-size:16px;color:#666;margin-bottom:12px;">上傳從其他 Docker container 匯出的 SQL 檔</p>
                <div class="form-group">
                    <label>匯入給哪個使用者</label>
                    <select id="importUser" style="width:100%;padding:14px 16px;font-size:20px;border:2px solid #d0d7de;border-radius:12px">
                        <% users.forEach(function(u) { %>
                        <option value="<%= u.id %>"><%= u.name %></option>
                        <% }); %>
                    </select>
                </div>
                <form id="importForm" onsubmit="return importSql(event)">
                    <input type="file" id="sqlFile" accept=".sql" required style="font-size:16px;">
                    <button type="submit" class="btn btn-primary" style="max-width:none;padding:14px 24px;font-size:18px;margin-top:12px;">上傳並匯入</button>
                </form>
                <div id="importResult" class="import-result"></div>
            </div>
        </div>
    </div>

    <!-- 編輯彈窗 -->
    <div id="editModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:100;display:none;align-items:center;justify-content:center;">
        <div style="background:#fff;border-radius:20px;padding:28px;max-width:380px;width:90%;">
            <h2 style="font-size:24px;margin-bottom:16px;">編輯使用者</h2>
            <input type="hidden" id="editId">
            <div class="form-group"><label>姓名</label><input type="text" id="editName" style="width:100%;padding:14px 16px;font-size:20px;border:2px solid #d0d7de;border-radius:12px"></div>
            <div class="form-group"><label>顏色</label><input type="color" id="editColor" style="height:52px;width:80px;padding:4px;border:2px solid #d0d7de;border-radius:12px"></div>
            <div style="display:flex;gap:12px;margin-top:20px;">
                <button class="btn btn-primary" style="max-width:none;flex:1;" onclick="saveEdit()">儲存</button>
                <button class="btn btn-back" style="max-width:none;flex:1;" onclick="closeEdit()">取消</button>
            </div>
        </div>
    </div>

    <script>
    function addUser(e) {
        e.preventDefault();
        const name = document.getElementById('newName').value;
        const color = document.getElementById('newColor').value;
        fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        }).then(r => r.json()).then(() => location.reload());
        return false;
    }

    function deleteUser(id, name) {
        if (!confirm('確定刪除 ' + name + '？所有相關血壓記錄也會一併刪除。')) return;
        fetch('/api/users/' + id, { method: 'DELETE' })
            .then(r => r.json()).then(() => location.reload());
    }

    function editUser(id, name, color) {
        document.getElementById('editModal').style.display = 'flex';
        document.getElementById('editId').value = id;
        document.getElementById('editName').value = name;
        document.getElementById('editColor').value = color;
    }

    function closeEdit() {
        document.getElementById('editModal').style.display = 'none';
    }

    function saveEdit() {
        const id = document.getElementById('editId').value;
        const name = document.getElementById('editName').value;
        const color = document.getElementById('editColor').value;
        fetch('/api/users/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        }).then(r => r.json()).then(() => location.reload());
    }

    function importSql(e) {
        e.preventDefault();
        const file = document.getElementById('sqlFile').files[0];
        const userId = document.getElementById('importUser').value;
        if (!file) return alert('請選擇 SQL 檔案');

        const formData = new FormData();
        formData.append('sqlFile', file);
        formData.append('user_id', userId);

        fetch('/api/import-sql', { method: 'POST', body: formData })
            .then(r => r.text()).then(msg => {
                document.getElementById('importResult').style.display = 'block';
                document.getElementById('importResult').textContent = msg;
            }).catch(() => alert('匯入失敗'));
        return false;
    }

    // 點擊彈窗背景關閉
    document.getElementById('editModal').addEventListener('click', function(e) {
        if (e.target === this) closeEdit();
    });
    </script>
</body>
</html>
```

- [ ] **Step 2: 提交**

```bash
git add views/admin.ejs
git commit -m "feat: admin panel for user management and SQL import"
```

---

### Task 5: 既有 EJS 加入 user_id

**Files:**
- Modify: `views/index.ejs`
- Modify: `views/records.ejs`
- Modify: `views/modify.ejs`

- [ ] **Step 1: index.ejs — 加入 user_id hidden field 和切換使用者按鈕**

在 `<form>` 內部的隱藏欄位區域加入：
```ejs
<input type="hidden" name="user_id" value="<%= userId %>">
```

在頂部導航加入使用者切換按鈕：
```ejs
<div class="top-nav">
    <h1>血壓記錄<%= ... %></h1>
    <div style="display:flex;gap:4px;">
        <a href="/" class="nav-btn">切換</a>
        <a href="/records?userId=<%= userId %>" class="nav-btn">記錄</a>
    </div>
</div>
```

- [ ] **Step 2: records.ejs — 所有連結加上 userId 參數**

所有導向 `/modify/`、`/delete/`、`/export/excel` 的連結加上 `userId` 參數：
```ejs
<a href="/modify/<%= record.id %>?userId=<%= userId %>">修改</a>
```
月份導航和匯出也要加上：
```ejs
<a href="/export/excel?userId=<%= userId %>" class="nav-btn">📥 匯出</a>
```

- [ ] **Step 3: modify.ejs — form action 帶 userId**

```ejs
<form action="/update/<%= record.id %>?userId=<%= userId %>" method="POST">
```

- [ ] **Step 4: 提交**

```bash
git add views/index.ejs views/records.ejs views/modify.ejs
git commit -m "feat: add userId to all pages and links"
```

---

### Task 6: CSS 補充

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: 加入管理頁面相關樣式**

在 CSS 底部加入 portal 和使用者卡片相關樣式：
```css
.user-grid { display: flex; flex-wrap: wrap; gap: 24px; justify-content: center; padding: 20px 0; }
.user-card { display: flex; flex-direction: column; align-items: center; text-decoration: none; width: 120px; padding: 16px; border-radius: 20px; transition: background 0.2s; cursor: pointer; }
.user-card:hover { background: #e8f5e9; }
.user-avatar { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; color: #fff; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.user-name { font-size: 22px; font-weight: 700; color: #1a1a2e; }
.admin-link { position: fixed; bottom: 20px; right: 20px; width: 52px; height: 52px; border-radius: 50%; background: #2d6a4f; color: #fff; border: none; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); text-decoration: none; }
@media(max-width:480px){ .user-card { width: 100px; } .user-avatar { width: 64px; height: 64px; font-size: 28px; } }

/* Admin panel */
.admin-container { max-width: 720px; margin: 0 auto; padding: 20px 16px; }
.admin-card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.admin-card h2 { font-size: 22px; margin-bottom: 16px; color: #1a1a2e; }
.user-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.user-row:last-child { border-bottom: none; }
.user-row .mini-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 18px; flex-shrink: 0; }
.user-row .user-row-name { font-size: 20px; font-weight: 600; flex: 1; }
.user-row .btn-sm { padding: 8px 14px; font-size: 14px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; }
.btn-sm-edit { background: #e8f5e9; color: #2d6a4f; }
.btn-sm-delete { background: #ffebee; color: #c62828; }
.form-inline { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.form-inline .form-group { flex: 1; min-width: 150px; margin-bottom: 0; }
.form-inline input[type="color"] { height: 52px; padding: 4px; width: 60px; }
.import-section { border: 2px dashed #d0d7de; border-radius: 16px; padding: 24px; text-align: center; }
.import-section input[type="file"] { margin: 12px 0; }
.import-result { margin-top: 12px; padding: 12px; border-radius: 8px; background: #e8f5e9; color: #2e7d32; font-size: 16px; display: none; }
```

- [ ] **Step 2: 提交**

```bash
git add public/styles.css
git commit -m "feat: add portal and admin panel styles"
```

---

### Task 7: 完整驗收

- [ ] **Step 1: 啟動伺服器驗證完整流程**

```bash
cd /path/to/project
node server.js
```

驗證項目：
1. 開啟 http://localhost:3000 → 顯示使用者選擇頁
2. 選擇使用者 → 進入血壓記錄頁
3. 輸入記錄 → 成功儲存
4. 查看記錄 → 只顯示該使用者的記錄
5. 修改/刪除 → 正常運作
6. 匯出 Excel → 只匯出該使用者資料
7. 管理後台 → 新增/編輯/刪除使用者
8. SQL 匯入 → 上傳 SQL 檔指定使用者
9. 切換使用者 → 回到選擇頁選另一人