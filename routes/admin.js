const express = require('express');
const db = require('../db');
const { formatDateForFilename } = require('../lib/util');
const router = express.Router();

// 管理後台
router.get('/admin', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, users) => {
        if (err) throw err;
        res.render('admin', { users, titleSuffix: process.env.TITLE_SUFFIX || '' });
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
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: '請輸入名稱' });
    db.query('INSERT INTO users (name, color) VALUES (?, ?)', [name, color || '#4CAF50'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, name, color: color || '#4CAF50' });
    });
});

// API: 刪除使用者（連同記錄）
router.delete('/api/users/:id', (req, res) => {
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
router.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, color } = req.body;
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

module.exports = router;
