const express = require('express');
const db = require('../db');
const { version: appVersion } = require('../package.json');
const { formatDateForFilename } = require('../lib/util');
const { createSessionToken, COOKIE_NAME } = require('../middleware/adminAuth');

function isHttpsRequest(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    return req.protocol === 'https' || req.secure === true || forwardedProto === 'https';
}

module.exports = function createAdminRouter(adminAuth) {
    const router = express.Router();
    const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const validId = value => /^\d+$/.test(String(value)) && Number(value) > 0;

    router.use((req, res, next) => {
        res.locals.appVersion = appVersion;
        next();
    });

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
                secure: isHttpsRequest(req)
            });
            return res.redirect('/admin');
        }
        res.status(401).render('admin-login', { error: true, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });

    // 登出：清除 cookie 並導向首頁
    router.post('/admin/logout', (req, res) => {
        res.clearCookie(COOKIE_NAME, {
            path: '/',
            secure: isHttpsRequest(req)
        });
        res.redirect('/');
    });

    // 其餘所有管理路由（含 /api/*）需登入
    router.use(requireAdmin);

    function loadAdminSummary(callback) {
        db.query('SELECT COUNT(*) AS total_records, SUM(recorded_at >= CURDATE()) AS today_records FROM records', callback);
    }

    // 管理總覽
    router.get('/admin', (req, res) => {
        const usersSql = 'SELECT u.id, u.name, u.color, u.created_at, COUNT(r.id) AS record_count, MAX(r.recorded_at) AS last_recorded_at FROM users u LEFT JOIN records r ON r.user_id = u.id GROUP BY u.id, u.name, u.color, u.created_at ORDER BY u.id ASC';
        db.query(usersSql, (err, users) => {
            if (err) return res.status(500).send('讀取使用者資料失敗');
            loadAdminSummary((summaryErr, summaryRows) => {
                if (summaryErr) return res.status(500).send('讀取統計資料失敗');
                const summary = summaryRows[0] || { total_records: 0, today_records: 0 };
                res.render('admin', { pageTitle: '管理總覽', pageDescription: '快速查看使用者與血壓記錄的整體狀況。', activePage: 'overview', summary: { totalUsers: users.length, totalRecords: Number(summary.total_records) || 0, todayRecords: Number(summary.today_records) || 0 }, titleSuffix: process.env.TITLE_SUFFIX || '' });
            });
        });
    });

    router.get('/admin/users', (req, res) => {
        const usersSql = 'SELECT u.id, u.name, u.color, u.created_at, COUNT(r.id) AS record_count, MAX(r.recorded_at) AS last_recorded_at FROM users u LEFT JOIN records r ON r.user_id = u.id GROUP BY u.id, u.name, u.color, u.created_at ORDER BY u.id ASC';
        db.query(usersSql, (err, users) => {
            if (err) return res.status(500).send('讀取使用者資料失敗');
            res.render('admin-users', { users, pageTitle: '使用者管理', pageDescription: '管理家庭成員帳號、識別色與使用者資料。', activePage: 'users', titleSuffix: process.env.TITLE_SUFFIX || '' });
        });
    });

    router.get('/admin/records', (req, res) => {
        db.query('SELECT id, name, color FROM users ORDER BY id ASC', (userErr, users) => {
            if (userErr) return res.status(500).send('讀取使用者資料失敗');
            db.query('SELECT r.id, r.high_pressure, r.low_pressure, r.heartbeat, r.recorded_at, r.user_id, u.name AS user_name FROM records r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.recorded_at DESC LIMIT 200', (recordErr, records) => {
                if (recordErr) return res.status(500).send('讀取血壓記錄失敗');
                loadAdminSummary((summaryErr, summaryRows) => {
                    if (summaryErr) return res.status(500).send('讀取統計資料失敗');
                    const summary = summaryRows[0] || { total_records: 0, today_records: 0 };
                    res.render('admin-records', { users, records, summary: { totalRecords: Number(summary.total_records) || 0, todayRecords: Number(summary.today_records) || 0 }, pageTitle: '血壓記錄', pageDescription: '查看最近 200 筆量測資料，並依使用者快速篩選。', activePage: 'records', titleSuffix: process.env.TITLE_SUFFIX || '' });
                });
            });
        });
    });

    router.get('/admin/backup', (req, res) => {
        db.query('SELECT id, name FROM users ORDER BY id ASC', (err, users) => {
            if (err) return res.status(500).send('讀取使用者資料失敗');
            res.render('admin-backup', { users, pageTitle: '備份還原', pageDescription: '下載完整資料備份，或將 SQL 記錄匯入指定使用者。', activePage: 'backup', titleSuffix: process.env.TITLE_SUFFIX || '' });
        });
    });

// SQL 匯出（備份）
router.get('/admin/export/sql', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, users) => {
        if (err) return res.status(500).send('匯出失敗：' + err.message);

        let sql = '';
        sql += '-- 血壓記錄系統備份\n';
        sql += `-- 匯出時間：${new Date().toLocaleString('zh-HK')}\n\n`;
        sql += 'CREATE TABLE IF NOT EXISTS `users` (\n';
        sql += '  `id` int NOT NULL AUTO_INCREMENT,\n';
        sql += '  `name` varchar(50) NOT NULL,\n';
        sql += '  `color` varchar(7) NOT NULL DEFAULT \'#4CAF50\',\n';
        sql += '  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,\n';
        sql += '  PRIMARY KEY (`id`)\n';
        sql += ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n';

        if (users.length) {
            sql += 'INSERT INTO `users` (`id`, `name`, `color`) VALUES\n';
            sql += users.map(u =>
                `(${u.id}, '${String(u.name).replace(/'/g, "''")}', '${u.color}')`
            ).join(',\n');
            sql += ';\n\n';
        }

        sql += 'CREATE TABLE IF NOT EXISTS `records` (\n';
        sql += '  `id` int NOT NULL AUTO_INCREMENT,\n';
        sql += '  `high_pressure` int NOT NULL,\n';
        sql += '  `low_pressure` int NOT NULL,\n';
        sql += '  `heartbeat` int NOT NULL,\n';
        sql += '  `recorded_at` timestamp DEFAULT CURRENT_TIMESTAMP,\n';
        sql += '  `user_id` int NOT NULL DEFAULT 1,\n';
        sql += '  PRIMARY KEY (`id`)\n';
        sql += ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n';

        db.query('SELECT * FROM records ORDER BY id ASC', (err2, records) => {
            if (err2) return res.status(500).send('匯出失敗：' + err2.message);

            if (records.length) {
                sql += 'INSERT INTO `records` (`id`, `high_pressure`, `low_pressure`, `heartbeat`, `recorded_at`, `user_id`) VALUES\n';
                sql += records.map(r => {
                    const ts = new Date(r.recorded_at);
                    const tsStr = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
                    return `(${r.id}, ${r.high_pressure}, ${r.low_pressure}, ${r.heartbeat}, '${tsStr}', ${r.user_id})`;
                }).join(',\n');
                sql += ';\n';
            }

            const filename = `血壓記錄備份_${formatDateForFilename(new Date())}.sql`;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
            res.send(sql);
        });
    });
});

// API: 取得使用者列表
router.get('/api/users', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// API: 新增使用者
router.post('/api/users', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const color = req.body.color || '#4CAF50';
    if (!name) return res.status(400).json({ error: '請輸入名稱' });
    if (name.length > 50) return res.status(400).json({ error: '名稱不可超過 50 個字元' });
    if (!validColor(color)) return res.status(400).json({ error: '顏色格式無效' });
    db.query('INSERT INTO users (name, color) VALUES (?, ?)', [name, color], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, name, color });
    });
});

// API: 刪除使用者（連同記錄）
router.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    if (!validId(userId)) return res.status(400).json({ error: '使用者編號無效' });
    db.query('DELETE FROM records WHERE user_id = ?', [userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: '找不到使用者' });
            res.json({ success: true });
        });
    });
});

// API: 編輯使用者
router.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const { color } = req.body;
    if (!validId(userId)) return res.status(400).json({ error: '使用者編號無效' });
    if (!name) return res.status(400).json({ error: '請輸入名稱' });
    if (name.length > 50) return res.status(400).json({ error: '名稱不可超過 50 個字元' });
    if (!validColor(color)) return res.status(400).json({ error: '顏色格式無效' });
    db.query('UPDATE users SET name = ?, color = ? WHERE id = ?', [name, color, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// API: 匯入 SQL
router.post('/api/import-sql', async (req, res) => {
    const { user_id } = req.body;
    if (!req.files || !req.files.sqlFile) {
        return res.status(400).send('請上傳 SQL 檔案');
    }
    const sqlContent = req.files.sqlFile.data.toString('utf8');

    // 解析所有 VALUES 並組裝成參數陣列
    const insertRegex = /INSERT\s+INTO\s+`?records`?\s*(?:\([^)]*\))?\s*VALUES\s*(.*?);/gis;
    const rows = [];
    let match;
    while ((match = insertRegex.exec(sqlContent)) !== null) {
        const valuesBlock = match[1];
        const valueRegex = /\(([^)]+)\)/g;
        let vMatch;
        while ((vMatch = valueRegex.exec(valuesBlock)) !== null) {
            const parts = vMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
            if (parts.length >= 4) {
                const high = parseInt(parts[parts.length - 4]) || 0;
                const low = parseInt(parts[parts.length - 3]) || 0;
                const heart = parseInt(parts[parts.length - 2]) || 0;
                const ts = ['current_timestamp()', 'CURRENT_TIMESTAMP'].includes(parts[parts.length - 1])
                    ? new Date() : new Date(parts[parts.length - 1]);
                rows.push([high, low, heart, ts, parseInt(user_id) || 1]);
            }
        }
    }

    if (rows.length === 0) return res.send('找不到可匯入的記錄');

    // 逐筆匯入，每筆之間讓出事件循環，避免卡住
    let success = 0, failed = 0;

    for (const row of rows) {
        await new Promise(resolve => {
            db.query('INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)', row, (err) => {
                if (err) failed++;
                else success++;
                setImmediate(resolve);
            });
        });
    }

    res.send(`匯入完成：成功 ${success} 筆，失敗 ${failed} 筆`);
});

    return router;
};
