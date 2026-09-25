const express = require('express');
const defaultDb = require('../db');
const { buildExcel } = require('../lib/excel');
const { formatDateForFilename } = require('../lib/util');
const { buildRecordedAt } = require('../lib/record-time');
const { parsePositiveId, recordOwnerWhere } = require('../lib/record-access');
const { createUserActionToken, verifyUserActionToken } = require('../lib/user-action-token');
module.exports = function createRecordsRouter(db = defaultDb) {
const router = express.Router();

// 血壓輸入驗證：合理範圍內先接受，防垃圾值入庫
function validateBp(hp, lp, heart) {
    const h = parseInt(hp, 10);
    const l = parseInt(lp, 10);
    const b = parseInt(heart, 10);
    if (isNaN(h) || h < 50 || h > 250) return '高壓需喺 50-250 之間';
    if (isNaN(l) || l < 30 || l > 150) return '低壓需喺 30-150 之間';
    if (isNaN(b) || b < 30 || b > 200) return '心跳需喺 30-200 之間';
    if (l >= h) return '低壓不能大於或等於高壓';
    return null;
}

// 保留實際錄入時間，早/晚只用於分類與重複檢查
function toRecordedAt(record_date, time_of_day) {
    return buildRecordedAt(record_date, time_of_day);
}

// API: 檢查同日同時段有冇已有記錄
router.get('/api/check-duplicate', (req, res) => {
    const { userId, date, period } = req.query;
    if (!userId || !date || !period) return res.json({ duplicate: false });
    const isPM = period === 'PM';
    db.query(
        'SELECT id FROM records WHERE user_id = ? AND DATE(recorded_at) = ? AND (HOUR(recorded_at) < 12) = ?',
        [userId, date, isPM ? 0 : 1],
        (err, rows) => {
            if (err) return res.json({ duplicate: false });
            res.json({ duplicate: rows.length > 0 });
        }
    );
});

// 新增記錄
router.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day, user_id } = req.body;

    const errMsg = validateBp(high_pressure, low_pressure, heartbeat);
    if (errMsg) {
        return res.status(400).send(errMsg);
    }

    const userId = parsePositiveId(user_id);
    if (!userId) return res.status(400).send('使用者編號無效');
    if (!verifyUserActionToken(process.env.SESSION_SECRET, userId, req.body._actionToken)) return res.status(403).send('安全驗證失效，請重新整理頁面');
    const recordedAt = toRecordedAt(record_date, time_of_day);

    db.query('SELECT name FROM users WHERE id = ? LIMIT 1', [userId], (userErr, users) => {
        if (userErr) return res.status(500).send('讀取使用者失敗');
        if (!users.length) return res.status(404).send('找不到使用者');
        const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)';
        db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, userId], (err, result) => {
            if (err) {
                console.error('Error inserting record:', err);
                return res.status(500).send('新增記錄失敗');
            }
            console.log(`[記錄] 新增 id=${result.insertId} user=${userId} ${high_pressure}/${low_pressure}/${heartbeat} ${recordedAt.getHours() < 12 ? '早' : '晚'} ${record_date || '今天'}`);
            res.render('index', { successMessage: '血壓記錄已成功添加！', titleSuffix: process.env.TITLE_SUFFIX || '', userId, userName: users[0].name, actionToken: createUserActionToken(process.env.SESSION_SECRET, userId) });
        });
    });
});

// 修改表單
router.get('/modify/:id', (req, res) => {
    const owner = recordOwnerWhere(req.params.id, req.query.userId);
    if (!owner) return res.status(400).send('記錄或使用者編號無效');
    db.query(`SELECT * FROM records WHERE ${owner.clause}`, owner.params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) {
            return res.status(404).send('Record not found');
        }

        const record = results[0];
        res.render('modify', { record, titleSuffix: process.env.TITLE_SUFFIX || '', userId: owner.params[1], userName: req.query.name || '', actionToken: createUserActionToken(process.env.SESSION_SECRET, owner.params[1]) });
    });
});

// 更新記錄
router.post('/update/:id', (req, res) => {
    const owner = recordOwnerWhere(req.params.id, req.body.userId);
    if (!owner) return res.status(400).send('記錄或使用者編號無效');
    if (!verifyUserActionToken(process.env.SESSION_SECRET, owner.params[1], req.body._actionToken)) return res.status(403).send('安全驗證失效，請重新整理頁面');
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

    const errMsg = validateBp(high_pressure, low_pressure, heartbeat);
    if (errMsg) {
        return res.status(400).send(errMsg);
    }

    const recordedAt = toRecordedAt(record_date, time_of_day);

    const query = `UPDATE records SET high_pressure = ?, low_pressure = ?, heartbeat = ?, recorded_at = ? WHERE ${owner.clause}`;
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, ...owner.params], (err, result) => {
        if (err) {
            console.error('Error updating record:', err);
            return res.status(500).send('Error updating record');
        }
        if (!result.affectedRows) return res.status(404).send('找不到記錄');
        console.log(`[記錄] 修改 id=${owner.params[0]} user=${owner.params[1]} ${high_pressure}/${low_pressure}/${heartbeat} ${recordedAt.getHours() < 12 ? '早' : '晚'} ${record_date || '今天'}`);
        res.redirect('/records?userId=' + owner.params[1] + '&name=' + encodeURIComponent(req.body.name || ''));
    });
});

// 刪除記錄
router.post('/delete/:id', (req, res) => {
    const owner = recordOwnerWhere(req.params.id, req.body.userId);
    if (!owner) return res.status(400).send('記錄或使用者編號無效');
    if (!verifyUserActionToken(process.env.SESSION_SECRET, owner.params[1], req.body._actionToken)) return res.status(403).send('安全驗證失效，請重新整理頁面');
    db.query(`DELETE FROM records WHERE ${owner.clause}`, owner.params, (err, result) => {
        if (err) return res.status(500).send('刪除記錄失敗');
        if (!result.affectedRows) return res.status(404).send('找不到記錄');
        console.log(`[記錄] 刪除 id=${owner.params[0]} user=${owner.params[1]}`);
        res.redirect('/records?userId=' + owner.params[1] + '&name=' + encodeURIComponent(req.body.name || ''));
    });
});

// Excel 匯出
router.get('/export/excel', (req, res, next) => {
    const userId = req.query.userId || 1;
    db.query('SELECT name FROM users WHERE id = ?', [userId], (err2, users) => {
        if (err2) return next(err2);
        const userName = users && users.length ? users[0].name : '';
        db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at ASC', [userId], async (err, results) => {
            if (err) return next(err);

            if (results.length === 0) {
                return res.status(404).send('沒有記錄可供匯出');
            }

            const workbook = buildExcel(results, userName);

            const today = new Date();
            const formattedDate = formatDateForFilename(today);
            const excelSuffix = userName || process.env.TITLE_SUFFIX || '';
            const excelFilename = `血壓記錄${excelSuffix ? '(' + excelSuffix + ')' : ''}_${formattedDate}.xlsx`;
            try {
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(excelFilename)}`);
                await workbook.xlsx.write(res);
                res.end();
            } catch (writeErr) {
                next(writeErr);
            }
        });
    });
});

return router;
};
