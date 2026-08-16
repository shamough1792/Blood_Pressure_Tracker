const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { buildExcel } = require('../lib/excel');
const { formatDateForFilename } = require('../lib/util');
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

// 早/晚固定時間（設計取捨：只保留早晚語意）
function toRecordedAt(record_date, time_of_day) {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const date = record_date || `${y}-${mo}-${d}`;
    const hour = now.getHours();
    const isPM = time_of_day === 'PM' || (time_of_day !== 'AM' && hour >= 12);
    return isPM
        ? new Date(`${date}T20:00:00`)
        : new Date(`${date}T08:00:00`);
}

// 新增記錄
router.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day, user_id } = req.body;

    const errMsg = validateBp(high_pressure, low_pressure, heartbeat);
    if (errMsg) {
        return res.status(400).send(errMsg);
    }

    const recordedAt = toRecordedAt(record_date, time_of_day);

    const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, user_id || 1], (err, result) => {
        if (err) {
            console.error('Error inserting record:', err);
            return res.status(500).send('Error adding record');
        }
        console.log(`[記錄] 新增 id=${result.insertId} user=${user_id || 1} ${high_pressure}/${low_pressure}/${heartbeat} ${recordedAt.getHours() < 12 ? '早' : '晚'} ${record_date || '今天'}`);
        db.query('SELECT name FROM users WHERE id = ?', [user_id || 1], (err2, users) => {
            const userName = users && users.length ? users[0].name : '';
            res.render('index', { successMessage: '血壓記錄已成功添加！', titleSuffix: process.env.TITLE_SUFFIX || '', userId: user_id || 1, userName });
        });
    });
});

// 修改表單
router.get('/modify/:id', (req, res) => {
    const recordId = req.params.id;
    db.query('SELECT * FROM records WHERE id = ?', [recordId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) {
            return res.status(404).send('Record not found');
        }

        const record = results[0];
        res.render('modify', { record, titleSuffix: process.env.TITLE_SUFFIX || '', userId: req.query.userId || 1, userName: req.query.name || '' });
    });
});

// 更新記錄
router.post('/update/:id', (req, res) => {
    const recordId = req.params.id;
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

    const errMsg = validateBp(high_pressure, low_pressure, heartbeat);
    if (errMsg) {
        return res.status(400).send(errMsg);
    }

    const recordedAt = toRecordedAt(record_date, time_of_day);

    const query = 'UPDATE records SET high_pressure = ?, low_pressure = ?, heartbeat = ?, recorded_at = ? WHERE id = ?';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, recordId], (err) => {
        if (err) {
            console.error('Error updating record:', err);
            return res.status(500).send('Error updating record');
        }
        console.log(`[記錄] 修改 id=${recordId} user=${req.query.userId || 1} ${high_pressure}/${low_pressure}/${heartbeat} ${recordedAt.getHours() < 12 ? '早' : '晚'} ${record_date || '今天'}`);
        res.redirect('/records?userId=' + (req.query.userId || 1) + '&name=' + encodeURIComponent(req.query.name || ''));
    });
});

// 刪除記錄
router.post('/delete/:id', (req, res) => {
    const recordId = req.params.id;
    const query = 'DELETE FROM records WHERE id = ?';
    db.query(query, [recordId], (err) => {
        if (err) throw err;
        console.log(`[記錄] 刪除 id=${recordId} user=${req.body.userId || 1}`);
        res.redirect('/records?userId=' + (req.body.userId || 1) + '&name=' + encodeURIComponent(req.body.name || ''));
    });
});

// Excel 匯出
router.get('/export/excel', (req, res) => {
    const userId = req.query.userId || 1;
    db.query('SELECT name FROM users WHERE id = ?', [userId], (err2, users) => {
        const userName = users && users.length ? users[0].name : '';
        db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at ASC', [userId], async (err, results) => {
            if (err) throw err;

            if (results.length === 0) {
                return res.send(`
                    <script>
                        alert('沒有記錄可供匯出');
                        window.history.back();
                    </script>
                `);
            }

            const workbook = buildExcel(results, userName);

            const today = new Date();
            const formattedDate = formatDateForFilename(today);
            const excelSuffix = userName || process.env.TITLE_SUFFIX || '';
            const excelFilename = `血壓記錄${excelSuffix ? '(' + excelSuffix + ')' : ''}_${formattedDate}.xlsx`;
            const excelPath = path.join(__dirname, '..', excelFilename);

            try {
                await workbook.xlsx.writeFile(excelPath);
                res.download(excelPath, excelFilename, (err) => {
                    if (err) console.error('Error downloading the file:', err);
                    fs.unlink(excelPath, () => {});
                });
            } catch (writeErr) {
                console.error('Error writing Excel file:', writeErr);
                res.status(500).send('匯出 Excel 失敗');
            }
        });
    });
});

module.exports = router;
