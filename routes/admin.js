const express = require('express');
const defaultDb = require('../db');
const { version: appVersion } = require('../package.json');
const { formatDateForFilename } = require('../lib/util');
const { buildPaginationItems } = require('../lib/pagination');
const { buildAdminOverview, buildAdminOverviewQuery } = require('../lib/admin-overview');
const { createBackup, parseBackup, previewBackup } = require('../lib/backup');
const { withTransaction } = require('../lib/db-transaction');
const { createSessionToken, extractToken, COOKIE_NAME } = require('../middleware/adminAuth');

function isHttpsRequest(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    return req.protocol === 'https' || req.secure === true || forwardedProto === 'https';
}

module.exports = function createAdminRouter(adminAuth, db = defaultDb) {
    const router = express.Router();
    const loginAttempts = new Map();
    let lastBackupAt = null;
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
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        const attempt = loginAttempts.get(key);
        if (attempt && attempt.lockedUntil > Date.now()) {
            return res.status(429).render('admin-login', { error: 'too_many_attempts', titleSuffix: process.env.TITLE_SUFFIX || '' });
        }
        if (adminAuth.credentialsMatch(username || '', password || '')) {
            loginAttempts.delete(key);
            const token = createSessionToken(adminAuth, Date.now());
            res.cookie(COOKIE_NAME, token, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: isHttpsRequest(req)
            });
            return res.redirect('/admin');
        }
        const failures = (attempt?.failures || 0) + 1;
        loginAttempts.set(key, { failures, lockedUntil: failures >= 5 ? Date.now() + 5 * 60 * 1000 : 0 });
        res.status(401).render('admin-login', { error: true, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });

    // 其餘所有管理路由（含 /api/*）需登入
    router.use(requireAdmin);

    router.use((req, res, next) => {
        const sessionToken = extractToken(req.headers.cookie);
        res.locals.csrfToken = adminAuth.createCsrfToken(sessionToken);
        next();
    });

    function requireCsrf(req, res, next) {
        const sessionToken = extractToken(req.headers.cookie);
        const csrfToken = req.get('x-csrf-token') || req.body?._csrf;
        if (adminAuth.verifyCsrfToken(sessionToken, csrfToken)) return next();
        if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: '安全驗證失效，請重新整理頁面' });
        return res.status(403).send('安全驗證失效，請重新整理頁面');
    }

    router.post('/admin/logout', requireCsrf, (req, res) => {
        res.clearCookie(COOKIE_NAME, { path: '/', secure: isHttpsRequest(req) });
        res.redirect('/');
    });

    router.use('/api', (req, res, next) => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return requireCsrf(req, res, next);
        next();
    });

    function loadAdminSummary(callback) {
        db.query('SELECT COUNT(*) AS total_records, SUM(recorded_at >= CURDATE()) AS today_records FROM records', callback);
    }

    function parseRecordFilters(query) {
        const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(query.pageSize, 10) || 50));
        const userId = validId(query.user) ? String(query.user) : '';
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        const from = datePattern.test(String(query.from || '')) ? String(query.from) : '';
        const to = datePattern.test(String(query.to || '')) ? String(query.to) : '';
        const status = ['normal', 'high', 'low'].includes(query.status) ? query.status : '';
        const sort = query.sort === 'oldest' ? 'oldest' : 'newest';
        const where = [];
        const params = [];
        if (userId) { where.push('r.user_id = ?'); params.push(userId); }
        if (from) { where.push('r.recorded_at >= ?'); params.push(`${from} 00:00:00`); }
        if (to) { where.push('r.recorded_at <= ?'); params.push(`${to} 23:59:59`); }
        if (status === 'high') where.push('(r.high_pressure >= 140 OR r.low_pressure >= 90)');
        if (status === 'low') where.push('(r.high_pressure < 90 OR r.low_pressure < 60)');
        if (status === 'normal') where.push('r.high_pressure < 140 AND r.low_pressure < 90 AND r.high_pressure >= 90 AND r.low_pressure >= 60');
        return { page, pageSize, userId, from, to, status, sort, where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
    }

    function loadFilteredRecords(filters, callback) {
        const direction = filters.sort === 'oldest' ? 'ASC' : 'DESC';
        const offset = (filters.page - 1) * filters.pageSize;
        const countSql = `SELECT COUNT(*) AS total FROM records r ${filters.where}`;
        const recordsSql = `SELECT r.id, r.high_pressure, r.low_pressure, r.heartbeat, r.recorded_at, r.user_id, u.name AS user_name FROM records r LEFT JOIN users u ON u.id = r.user_id ${filters.where} ORDER BY r.recorded_at ${direction}, r.id ${direction} LIMIT ? OFFSET ?`;
        db.query(countSql, filters.params, (countErr, countRows) => {
            if (countErr) return callback(countErr);
            db.query(recordsSql, filters.params.concat([filters.pageSize, offset]), (recordsErr, records) => {
                if (recordsErr) return callback(recordsErr);
                callback(null, { records, total: Number(countRows[0]?.total) || 0 });
            });
        });
    }

    // 管理總覽
    router.get('/admin', (req, res) => {
        const overviewUserId = validId(req.query.overviewUser) ? String(req.query.overviewUser) : '';
        const usersSql = 'SELECT u.id, u.name, u.color, u.created_at, COUNT(r.id) AS record_count, MAX(r.recorded_at) AS last_recorded_at FROM users u LEFT JOIN records r ON r.user_id = u.id GROUP BY u.id, u.name, u.color, u.created_at ORDER BY u.id ASC';
        db.query(usersSql, (err, users) => {
            if (err) return res.status(500).send('讀取使用者資料失敗');
            loadAdminSummary((summaryErr, summaryRows) => {
                if (summaryErr) return res.status(500).send('讀取統計資料失敗');
                const overviewQuery = buildAdminOverviewQuery(overviewUserId);
                db.query(overviewQuery.sql, overviewQuery.params, (overviewErr, recentRecords) => {
                    if (overviewErr) return res.status(500).send('讀取近期統計失敗');
                    const summary = summaryRows[0] || { total_records: 0, today_records: 0 };
                    res.render('admin', { pageTitle: '管理總覽', pageDescription: '快速查看使用者與血壓記錄的整體狀況。', activePage: 'overview', summary: { totalUsers: users.length, totalRecords: Number(summary.total_records) || 0, todayRecords: Number(summary.today_records) || 0 }, overview: buildAdminOverview(recentRecords), overviewUsers: users, overviewUserId, lastBackupAt, titleSuffix: process.env.TITLE_SUFFIX || '' });
                });
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
        const filters = parseRecordFilters(req.query);
        db.query('SELECT id, name, color FROM users ORDER BY id ASC', (userErr, users) => {
            if (userErr) return res.status(500).send('讀取使用者資料失敗');
            loadFilteredRecords(filters, (recordErr, result) => {
                if (recordErr) return res.status(500).send('讀取血壓記錄失敗');
                loadAdminSummary((summaryErr, summaryRows) => {
                    if (summaryErr) return res.status(500).send('讀取統計資料失敗');
                    const summary = summaryRows[0] || { total_records: 0, today_records: 0 };
                    const totalPages = Math.ceil(result.total / filters.pageSize);
                    res.render('admin-records', { users, records: result.records, recordsTotal: result.total, recordsPage: filters.page, recordsPageSize: filters.pageSize, recordFilters: filters, paginationItems: buildPaginationItems(totalPages, filters.page), summary: { totalRecords: Number(summary.total_records) || 0, todayRecords: Number(summary.today_records) || 0 }, pageTitle: '血壓記錄', pageDescription: '依使用者、日期與血壓狀態篩選全部量測資料。', activePage: 'records', titleSuffix: process.env.TITLE_SUFFIX || '' });
                });
            });
        });
    });

    router.get('/admin/export/records.csv', (req, res) => {
        const filters = parseRecordFilters(req.query);
        const sql = `SELECT r.recorded_at, u.name AS user_name, r.high_pressure, r.low_pressure, r.heartbeat FROM records r LEFT JOIN users u ON u.id = r.user_id ${filters.where} ORDER BY r.recorded_at ${filters.sort === 'oldest' ? 'ASC' : 'DESC'}, r.id ${filters.sort === 'oldest' ? 'ASC' : 'DESC'}`;
        db.query(sql, filters.params, (err, records) => {
            if (err) return res.status(500).send('匯出失敗');
            const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
            const csv = ['量測時間,使用者,收縮壓,舒張壓,心跳', ...records.map(r => [r.recorded_at, r.user_name || '已移除使用者', r.high_pressure, r.low_pressure, r.heartbeat].map(escape).join(','))].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`血壓記錄_${formatDateForFilename(new Date())}.csv`)}`);
            res.send(`\uFEFF${csv}`);
        });
    });

    router.get('/admin/backup', (req, res) => {
        db.query('SELECT id, name FROM users ORDER BY id ASC', (err, users) => {
            if (err) return res.status(500).send('讀取使用者資料失敗');
            res.render('admin-backup', { users, pageTitle: '備份還原', pageDescription: '下載具 checksum 的 JSON 備份，匯入前可先預覽資料。', activePage: 'backup', titleSuffix: process.env.TITLE_SUFFIX || '' });
        });
    });

    router.get('/admin/export/backup.json', (req, res, next) => {
        db.query('SELECT id, name, color, created_at FROM users ORDER BY id ASC', (userErr, users) => {
            if (userErr) return next(userErr);
            db.query('SELECT id, high_pressure, low_pressure, heartbeat, recorded_at, user_id FROM records ORDER BY id ASC', (recordErr, records) => {
                if (recordErr) return next(recordErr);
                const now = new Date();
                const backup = createBackup({ users, records, exportedAt: now.toISOString(), appVersion });
                lastBackupAt = now;
                const filename = `血壓記錄備份_${formatDateForFilename(now)}.json`;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
                res.send(JSON.stringify(backup, null, 2));
            });
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
    db.query('SELECT id FROM users WHERE name = ? LIMIT 1', [name], (lookupErr, existing) => {
        if (lookupErr) return res.status(500).json({ error: '新增使用者失敗' });
        if (existing.length) return res.status(409).json({ error: '使用者名稱已存在' });
        db.query('INSERT INTO users (name, color) VALUES (?, ?)', [name, color], (err, result) => {
            if (err) return res.status(500).json({ error: '新增使用者失敗' });
            res.json({ id: result.insertId, name, color });
        });
    });
});

// API: 刪除使用者（連同記錄）
router.delete('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    if (!validId(userId)) return res.status(400).json({ error: '使用者編號無效' });
    try {
        await withTransaction(db, async connection => {
            await connection.query('DELETE FROM records WHERE user_id = ?', [userId]);
            const [result] = await connection.query('DELETE FROM users WHERE id = ?', [userId]);
            if (!result.affectedRows) {
                const error = new Error('找不到使用者');
                error.statusCode = 404;
                throw error;
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.statusCode === 404 ? error.message : '刪除使用者失敗' });
    }
});

function readBackupUpload(req) {
    if (!req.files || !req.files.backupFile) throw Object.assign(new Error('請上傳 JSON 備份檔案'), { statusCode: 400 });
    const upload = req.files.backupFile;
    if (upload.size > 5 * 1024 * 1024) throw Object.assign(new Error('備份檔案不可超過 5 MB'), { statusCode: 413 });
    return parseBackup(upload.data.toString('utf8'));
}

async function prepareBackupImport(req) {
    const targetUserId = Number.parseInt(req.body.user_id, 10);
    if (!validId(targetUserId)) throw Object.assign(new Error('請選擇有效使用者'), { statusCode: 400 });
    const [users] = await db.promise().query('SELECT id FROM users WHERE id = ? LIMIT 1', [targetUserId]);
    if (!users.length) throw Object.assign(new Error('找不到指定使用者'), { statusCode: 400 });
    const preview = previewBackup(readBackupUpload(req), targetUserId);
    if (!preview.validRows.length) throw Object.assign(new Error('備份中沒有可匯入的有效記錄'), { statusCode: 400 });
    if (preview.validRows.length > 5000) throw Object.assign(new Error('單次最多匯入 5000 筆記錄'), { statusCode: 413 });
    return preview;
}

router.post('/api/import-backup/preview', async (req, res) => {
    try {
        const preview = await prepareBackupImport(req);
        res.json({ total: preview.total, valid: preview.validRows.length, skipped: preview.skipped, exportedAt: preview.exportedAt, sourceVersion: preview.sourceVersion });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
});

router.post('/api/import-backup/confirm', async (req, res) => {
    try {
        const preview = await prepareBackupImport(req);
        await withTransaction(db, async connection => {
            for (const row of preview.validRows) {
                await connection.query('INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)', row);
            }
        });
        res.json({ success: true, imported: preview.validRows.length, skipped: preview.skipped });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.statusCode ? error.message : '匯入失敗，資料已回復' });
    }
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
    db.query('SELECT id FROM users WHERE name = ? AND id <> ? LIMIT 1', [name, userId], (lookupErr, existing) => {
        if (lookupErr) return res.status(500).json({ error: '更新使用者失敗' });
        if (existing.length) return res.status(409).json({ error: '使用者名稱已存在' });
        db.query('UPDATE users SET name = ?, color = ? WHERE id = ?', [name, color, userId], (err, result) => {
            if (err) return res.status(500).json({ error: '更新使用者失敗' });
            if (!result.affectedRows) return res.status(404).json({ error: '找不到使用者' });
            res.json({ success: true });
        });
    });
});

// API: 匯入 SQL
router.post('/api/import-sql', async (req, res) => {
    const { user_id } = req.body;
    if (!req.files || !req.files.sqlFile) {
        return res.status(400).send('請上傳 SQL 檔案');
    }
    const upload = req.files.sqlFile;
    if (upload.size > 5 * 1024 * 1024) return res.status(413).send('SQL 檔案不可超過 5 MB');
    const targetUserId = Number.parseInt(user_id, 10);
    if (!validId(targetUserId)) return res.status(400).send('請選擇有效使用者');
    const sqlContent = upload.data.toString('utf8');

    const userExists = await new Promise(resolve => db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [targetUserId], (err, rows) => resolve(!err && rows.length > 0)));
    if (!userExists) return res.status(400).send('找不到指定使用者');

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
                if (high >= 50 && high <= 300 && low >= 30 && low <= 200 && heart >= 25 && heart <= 250 && !Number.isNaN(ts.getTime())) {
                    rows.push([high, low, heart, ts, targetUserId]);
                }
            }
        }
    }

    if (rows.length === 0) return res.send('找不到符合格式與數值範圍的記錄');
    if (rows.length > 5000) return res.status(413).send('單次最多匯入 5000 筆記錄');

    try {
      await withTransaction(db, async connection => {
          for (const row of rows) {
              await connection.query('INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)', row);
          }
      });
    } catch (error) {
      return res.status(400).send('匯入失敗，資料已回復，請檢查 SQL 內容');
    }

    res.send(`匯入完成：成功 ${rows.length} 筆，失敗 0 筆`);
});

    return router;
};
